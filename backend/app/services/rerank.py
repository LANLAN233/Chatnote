"""Jina Reranker API integration — Cross-Encoder reranking for RAG retrieval.

Uses Jina Reranker v3 (https://docs.jina.ai/#tag/search-foundation-models/POST/v1/rerank)
to re-rank candidate documents by semantic relevance to the query.

Fallback: gracefully degrades to identity ordering when API key is not configured
or the API call fails.
"""

import logging
from typing import Optional

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

# Jina Reranker API endpoint
JINA_RERANK_URL = "https://api.jina.ai/v1/rerank"

# Default model
JINA_RERANK_MODEL = "jina-reranker-v3"


class RerankerService:
    """Cross-Encoder reranker using Jina AI's Reranker API.

    Provides semantic re-ranking of documents (e.g., search results) based
    on a query. Returns documents reordered by relevance score.

    Graceful degradation: if no JINA_API_KEY is configured, returns
    documents in original order.
    """

    @classmethod
    def _is_configured(cls) -> bool:
        """Check if Jina API key is available."""
        return bool(settings.JINA_API_KEY)

    @classmethod
    async def rerank(
        cls,
        query: str,
        documents: list[str],
        top_n: int = 15,
        model: str = JINA_RERANK_MODEL,
    ) -> list[tuple[int, float]]:
        """Re-rank documents by semantic relevance to the query.

        Args:
            query: The search query / user question.
            documents: List of document texts to re-rank.
            top_n: Number of top results to return (default 15).
            model: Jina reranker model ID (default: jina-reranker-v3).

        Returns:
            List of (original_index, relevance_score) tuples, sorted by
            score descending. Returns identity ordering if the API is
            unavailable.
        """
        if not documents:
            return []

        if not cls._is_configured():
            logger.debug("JINA_API_KEY not configured; skipping rerank")
            return [(i, 1.0) for i in range(min(top_n, len(documents)))]

        # Truncate documents to avoid oversized requests (8192 token limit per doc)
        truncated = [doc[:4000] for doc in documents]

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    JINA_RERANK_URL,
                    headers={
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {settings.JINA_API_KEY}",
                    },
                    json={
                        "model": model,
                        "query": query,
                        "documents": truncated,
                        "top_n": min(top_n, len(documents)),
                        "return_documents": False,
                    },
                )
                resp.raise_for_status()
                data = resp.json()
        except httpx.HTTPStatusError as exc:
            logger.warning(
                "Jina reranker API error (HTTP %d): %s, falling back to original order",
                exc.response.status_code,
                exc.response.text[:200] if exc.response else "no response",
            )
            return [(i, 1.0) for i in range(min(top_n, len(documents)))]
        except Exception as exc:
            logger.warning(
                "Jina reranker API call failed: %s, falling back to original order",
                exc,
            )
            return [(i, 1.0) for i in range(min(top_n, len(documents)))]

        results = data.get("results", [])
        if not results:
            return [(i, 1.0) for i in range(min(top_n, len(documents)))]

        return [
            (r["index"], r["relevance_score"])
            for r in results
        ]

    @classmethod
    async def rerank_documents(
        cls,
        query: str,
        documents: list[str],
        top_n: int = 15,
    ) -> list[str]:
        """Convenience method: re-rank and return reordered document texts.

        Args:
            query: The search query.
            documents: Documents to re-rank.
            top_n: Number of top results.

        Returns:
            Reordered document texts (truncated to top_n).
        """
        ranked = await cls.rerank(query, documents, top_n)
        result = []
        for idx, _ in ranked:
            if 0 <= idx < len(documents):
                result.append(documents[idx])
        return result
