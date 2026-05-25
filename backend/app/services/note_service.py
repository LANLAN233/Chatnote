from __future__ import annotations

import logging

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.models import Channel, Note, Server

logger = logging.getLogger(__name__)


async def fetch_notes_for_context(
    db: AsyncSession,
    user_id: int,
    server_id: int,
    channel_id: int | None = None,
    limit: int = 20,
) -> list[str]:
    """Retrieve recent notes for AI agent context.

    Returns list of formatted strings: "[channel_name] truncated_content"
    Content is truncated to 200 chars with "..." appended if longer.
    Results are sorted by created_at DESC and limited to `limit` items.

    Args:
        db: Async database session
        user_id: Owner of the notes
        server_id: Server to fetch notes from
        channel_id: Optional channel filter (all channels if None)
        limit: Maximum number of notes to return (default 20)

    Returns:
        List of formatted strings, one per note
    """
    # Build base query: notes belonging to user, in the given server
    stmt = (
        select(Note)
        .options(selectinload(Note.channel).selectinload(Channel.server))
        .where(Note.user_id == user_id)
        .where(Channel.server_id == server_id)
        .join(Note.channel)
    )

    if channel_id is not None:
        stmt = stmt.where(Note.channel_id == channel_id)

    stmt = stmt.order_by(desc(Note.created_at)).limit(limit)

    result = await db.execute(stmt)
    notes = result.scalars().all()

    formatted: list[str] = []
    for note in notes:
        content = note.content or ""
        if len(content) > 200:
            content = content[:200] + "..."
        channel_name = note.channel.name if note.channel else "unknown"
        formatted.append(f"[{channel_name}] {content}")

    return formatted


async def fetch_notes_semantic(
    db: AsyncSession,
    query: str,
    user_id: int,
    limit: int = 10,
) -> list[str]:
    """Fetch notes by semantic similarity for RAG context.

    Uses pgvector cosine similarity to find the most relevant notes
    for the given query. Returns truncated content strings (max 500 chars).

    Args:
        db: Async database session
        query: Natural language search query
        user_id: Owner of the notes
        limit: Maximum number of notes to return (default 10)

    Returns:
        List of truncated note content strings, sorted by relevance
    """
    from app.services.search import vector_search

    results = await vector_search(query, user_id, db, limit)
    return [r["content"][:500] for r in results]
