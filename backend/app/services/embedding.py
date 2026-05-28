import asyncio
import logging
import time
from typing import Optional

from openai import AsyncOpenAI
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.note_chunk import NoteChunk
from app.models.note_embedding import NoteEmbedding

logger = logging.getLogger(__name__)


class EmbeddingService:
    """Generate and cache embeddings using OpenAI text-embedding-3-small."""

    _client: Optional[AsyncOpenAI] = None
    _model: str = "text-embedding-3-small"
    _dimensions: int = 768
    _max_retries: int = 3
    _base_delay: float = 1.0  # seconds, for exponential backoff

    @classmethod
    def _get_client(cls) -> Optional[AsyncOpenAI]:
        """Lazy-init OpenAI client. Returns None if no API key configured."""
        if cls._client is None:
            api_key = settings.OPENAI_API_KEY
            if not api_key:
                logger.warning("OPENAI_API_KEY not configured; embeddings disabled")
                return None
            cls._client = AsyncOpenAI(api_key=api_key)
        return cls._client

    @classmethod
    async def generate_embedding(cls, text: str) -> Optional[list[float]]:
        """Generate embedding for a single text. Returns None if API unavailable."""
        client = cls._get_client()
        if client is None:
            return None

        # Truncate long text to ~8000 tokens (rough estimate: 4 chars/token)
        if len(text) > 32000:
            text = text[:32000]

        for attempt in range(cls._max_retries):
            try:
                response = await client.embeddings.create(
                    model=cls._model,
                    input=text,
                    dimensions=cls._dimensions,
                )
                return response.data[0].embedding
            except Exception as e:
                if attempt < cls._max_retries - 1:
                    delay = cls._base_delay * (2**attempt)
                    logger.warning(
                        f"Embedding attempt {attempt+1} failed: {e}. Retrying in {delay}s..."
                    )
                    await asyncio.sleep(delay)
                else:
                    logger.error(
                        f"Embedding failed after {cls._max_retries} attempts: {e}"
                    )
                    return None

    @classmethod
    async def generate_embeddings_batch(
        cls, texts: list[str], batch_size: int = 100
    ) -> list[Optional[list[float]]]:
        """Generate embeddings for multiple texts in batches with rate limiting."""
        client = cls._get_client()
        if client is None:
            return [None] * len(texts)

        all_embeddings = []

        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            # Truncate each text
            truncated = [t[:32000] for t in batch]

            for attempt in range(cls._max_retries):
                try:
                    response = await client.embeddings.create(
                        model=cls._model,
                        input=truncated,
                        dimensions=cls._dimensions,
                    )
                    embeddings = [d.embedding for d in response.data]
                    all_embeddings.extend(embeddings)
                    break
                except Exception as e:
                    if attempt < cls._max_retries - 1:
                        delay = cls._base_delay * (2**attempt)
                        await asyncio.sleep(delay)
                    else:
                        logger.error(f"Batch embedding failed: {e}")
                        all_embeddings.extend([None] * len(truncated))

            # Rate limiting: ~20 RPS
            if i + batch_size < len(texts):
                await asyncio.sleep(0.05)

        return all_embeddings

    @classmethod
    async def get_or_create_embedding(
        cls, note_id: int, content: str, db: AsyncSession, force: bool = False
    ) -> Optional[list[float]]:
        """Get cached embedding or create new one. Stores result in NoteEmbedding table.

        Args:
            note_id: The note ID to generate embedding for.
            content: The note content text.
            db: Async database session.
            force: If True, delete any existing cached embedding and regenerate.
                   Use this when note content has changed (updates).
        """
        # Force rebuild: delete old cache first
        if force:
            await db.execute(
                delete(NoteEmbedding).where(NoteEmbedding.note_id == note_id)
            )
            await db.flush()
        else:
            # Check cache
            result = await db.execute(
                select(NoteEmbedding).where(NoteEmbedding.note_id == note_id)
            )
            existing = result.scalar_one_or_none()
            if existing is not None:
                return existing.embedding

        # Generate new embedding
        embedding = await cls.generate_embedding(content)
        if embedding is None:
            return None

        # Store in cache
        record = NoteEmbedding(
            note_id=note_id,
            embedding=embedding,
            embedding_model=cls._model,
        )
        db.add(record)
        await db.flush()

        return embedding


# ── Chunking Configuration ────────────────────────────────────────
# Character-based chunking with sliding window.
# 512 chars ≈ 200-300 Chinese words or ~1500 tokens.
CHUNK_SIZE: int = 512
CHUNK_OVERLAP: int = 128


def _split_into_chunks(text: str) -> list[str]:
    """Split text into overlapping chunks of CHUNK_SIZE characters.

    Uses a simple sliding window. For short texts (<= CHUNK_SIZE),
    returns a single chunk.

    Args:
        text: The full note content.

    Returns:
        List of chunk strings.
    """
    if len(text) <= CHUNK_SIZE:
        return [text]

    chunks = []
    start = 0
    while start < len(text):
        chunk = text[start:start + CHUNK_SIZE]
        chunks.append(chunk)
        start += CHUNK_SIZE - CHUNK_OVERLAP
    return chunks


async def chunk_and_embed(
    note_id: int,
    content: str,
    db: AsyncSession,
) -> bool:
    """Split a note into chunks, generate embeddings, and store in note_chunks.

    Deletes any existing chunks for this note before creating new ones.
    Also maintains the legacy single-embedding (note_embeddings) for backward
    compatibility with non-chunk search paths.

    Args:
        note_id: The note ID.
        content: Full note content to chunk.
        db: Async database session.

    Returns:
        True if chunking succeeded, False if embedding API was unavailable.
    """
    from sqlalchemy import delete as sa_delete

    # 1. Delete old chunks for this note
    await db.execute(
        sa_delete(NoteChunk).where(NoteChunk.note_id == note_id)
    )
    await db.flush()

    # 2. Split into chunks
    chunks = _split_into_chunks(content)

    # 3. Batch-generate embeddings for all chunks
    embeddings = await EmbeddingService.generate_embeddings_batch(
        chunks, batch_size=100
    )

    # 4. Store chunks with embeddings
    success_count = 0
    for i, (chunk_text, emb) in enumerate(zip(chunks, embeddings)):
        if emb is None:
            logger.warning(
                "Failed to generate embedding for chunk %d of note %d", i, note_id
            )
            continue
        chunk_record = NoteChunk(
            note_id=note_id,
            chunk_index=i,
            content=chunk_text,
            embedding=emb,
        )
        db.add(chunk_record)
        success_count += 1

    await db.flush()

    if success_count == 0:
        logger.error(
            "All chunk embeddings failed for note %d (%d chunks)",
            note_id, len(chunks),
        )
        return False

    logger.debug(
        "Chunked note %d: %d chunks, %d embeddings stored",
        note_id, len(chunks), success_count,
    )
    return True
