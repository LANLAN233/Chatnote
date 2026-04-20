import logging

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

FTS_CREATE_SQL = """
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
    content,
    content='notes',
    content_rowid='id'
);
"""

FTS_REBUILD_SQL = """
INSERT INTO notes_fts(rowid, content)
SELECT id, content FROM notes;
"""

FTS_DROP_SQL = "DROP TABLE IF EXISTS notes_fts;"


async def ensure_fts_table(db: AsyncSession) -> None:
    try:
        await db.execute(text(FTS_CREATE_SQL))
    except Exception as e:
        logger.warning(f"FTS5 table creation skipped (may not be supported): {e}")


async def rebuild_fts_index(db: AsyncSession) -> None:
    try:
        await db.execute(text("DELETE FROM notes_fts"))
        await db.execute(text(FTS_REBUILD_SQL))
    except Exception as e:
        logger.warning(f"FTS rebuild failed: {e}")


async def fts_search(db: AsyncSession, query: str, user_id: int, limit: int = 20) -> list[int]:
    try:
        escaped = query.replace('"', '""')
        result = await db.execute(
            text("""
                SELECT n.id
                FROM notes_fts f
                JOIN notes n ON n.id = f.rowid
                WHERE notes_fts MATCH :q AND n.user_id = :uid
                ORDER BY rank
                LIMIT :lim
            """),
            {"q": escaped, "uid": user_id, "lim": limit},
        )
        return [row[0] for row in result.fetchall()]
    except Exception as e:
        logger.warning(f"FTS search failed, falling back to ILIKE: {e}")
        return []
