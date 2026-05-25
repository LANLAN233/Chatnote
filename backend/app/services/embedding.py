import asyncio
import logging
import time
from typing import Optional

from openai import AsyncOpenAI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
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
        cls, note_id: int, content: str, db: AsyncSession
    ) -> Optional[list[float]]:
        """Get cached embedding or create new one. Stores result in NoteEmbedding table."""
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
