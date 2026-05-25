"""Hybrid search engine using pgvector + PostgreSQL full-text search with RRF fusion."""
import asyncio
import logging
from typing import Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.embedding import EmbeddingService

logger = logging.getLogger(__name__)

# RRF constant
RRF_K = 60


async def vector_search(
    query: str,
    user_id: int,
    db: AsyncSession,
    limit: int = 10,
) -> list[dict]:
    """Search notes by vector similarity using pgvector cosine distance.
    
    Returns list of dicts with keys: note_id, content, score (cosine similarity 0-1)
    """
    # Generate query embedding
    query_embedding = await EmbeddingService.generate_embedding(query)
    if query_embedding is None:
        return []
    
    # Set HNSW search parameter for better recall
    await db.execute(text("SET LOCAL hnsw.ef_search = 100"))
    
    # Convert embedding to pgvector literal string: '[0.1,0.2,...]'
    embedding_str = "[" + ",".join(str(x) for x in query_embedding) + "]"
    
    # Cosine similarity: 1 - (cosine_distance) = 1 - (<=>)
    sql = text("""
        SELECT 
            n.id AS note_id,
            n.content,
            1 - (ne.embedding <=> :query_vec) AS score
        FROM note_embeddings ne
        JOIN notes n ON ne.note_id = n.id
        WHERE n.user_id = :user_id
        ORDER BY ne.embedding <=> :query_vec
        LIMIT :limit
    """)
    result = await db.execute(sql, {
        "query_vec": embedding_str,
        "user_id": user_id,
        "limit": limit * 2,  # fetch more for RRF
    })
    
    rows = result.fetchall()
    return [
        {"note_id": row.note_id, "content": row.content, "score": float(row.score)}
        for row in rows
    ]


async def fulltext_search(
    query: str,
    user_id: int,
    db: AsyncSession,
    limit: int = 10,
) -> list[dict]:
    """Search notes by PostgreSQL full-text search (tsvector).
    
    Uses ts_rank_cd for ranking. Falls back to ILIKE if tsquery fails.
    """
    # Use plainto_tsquery for simple user input
    sql = text("""
        SELECT 
            n.id AS note_id,
            n.content,
            ts_rank_cd(
                to_tsvector('english', coalesce(n.content, '')),
                plainto_tsquery('english', :query)
            ) AS score
        FROM notes n
        WHERE n.user_id = :user_id
          AND to_tsvector('english', coalesce(n.content, '')) @@ plainto_tsquery('english', :query)
        ORDER BY score DESC
        LIMIT :limit
    """)
    
    try:
        result = await db.execute(sql, {
            "query": query,
            "user_id": user_id,
            "limit": limit * 2,
        })
        rows = result.fetchall()
    except Exception as e:
        logger.warning(f"Full-text search failed, falling back to ILIKE: {e}")
        # Fallback to ILIKE
        sql = text("""
            SELECT n.id AS note_id, n.content, 0.1 AS score
            FROM notes n
            WHERE n.user_id = :user_id AND n.content ILIKE :pattern
            LIMIT :limit
        """)
        result = await db.execute(sql, {
            "user_id": user_id,
            "pattern": f"%{query}%",
            "limit": limit * 2,
        })
        rows = result.fetchall()
    
    return [
        {"note_id": row.note_id, "content": row.content, "score": float(row.score)}
        for row in rows
    ]


async def hybrid_search(
    query: str,
    user_id: int,
    db: AsyncSession,
    limit: int = 10,
    mode: str = "hybrid",
) -> list[dict]:
    """Hybrid search combining vector + full-text with RRF fusion.
    
    Args:
        query: Search query string
        user_id: User ID to filter notes
        db: Async database session
        limit: Maximum results to return
        mode: 'hybrid', 'vector', or 'fulltext'
    
    Returns:
        List of dicts with: note_id, content, score, source
    """
    if mode == "vector":
        results = await vector_search(query, user_id, db, limit)
        for r in results:
            r["source"] = "vector"
        return results[:limit]
    
    if mode == "fulltext":
        results = await fulltext_search(query, user_id, db, limit)
        for r in results:
            r["source"] = "fulltext"
        return results[:limit]
    
    # mode == "hybrid": run both searches and fuse with RRF
    vector_results, fulltext_results = await asyncio.gather(
        vector_search(query, user_id, db, limit),
        fulltext_search(query, user_id, db, limit),
    )
    
    # RRF fusion
    # score = SUM(1 / (k + rank_i)) across both result sets, k=60
    rrf_scores: dict[int, float] = {}
    sources: dict[int, str] = {}
    content_map: dict[int, str] = {}
    
    # Process vector results
    for rank, item in enumerate(vector_results, start=1):
        nid = item["note_id"]
        rrf_scores[nid] = rrf_scores.get(nid, 0) + 1.0 / (RRF_K + rank)
        sources[nid] = "hybrid"
        content_map[nid] = item["content"]
    
    # Process fulltext results
    for rank, item in enumerate(fulltext_results, start=1):
        nid = item["note_id"]
        rrf_scores[nid] = rrf_scores.get(nid, 0) + 1.0 / (RRF_K + rank)
        if nid not in sources:
            sources[nid] = "hybrid"
        content_map[nid] = item["content"]
    
    # Sort by RRF score descending
    sorted_ids = sorted(rrf_scores.keys(), key=lambda x: rrf_scores[x], reverse=True)
    
    # Normalize scores to 0-1 range
    max_score = max(rrf_scores.values()) if rrf_scores else 1.0
    
    results = []
    for nid in sorted_ids[:limit]:
        results.append({
            "note_id": nid,
            "content": content_map[nid],
            "score": round(rrf_scores[nid] / max_score, 4) if max_score > 0 else 0.0,
            "source": sources[nid],
        })
    
    return results
