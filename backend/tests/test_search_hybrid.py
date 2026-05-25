"""Tests for search.py — hybrid search engine using pgvector + tsvector + RRF.

All tests are mock-based since the test DB is SQLite (no pgvector support).
Database execute calls are mocked; EmbeddingService.generate_embedding is patched.
"""
import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.search import (
    hybrid_search,
    vector_search,
    fulltext_search,
    RRF_K,
)


# ── Helpers ───────────────────────────────────────────────────────────


def _mock_row(note_id: int, content: str, score: float):
    """Create a mock Row object with .note_id, .content, .score attributes."""
    row = MagicMock()
    row.note_id = note_id
    row.content = content
    row.score = score
    return row


def _mock_db_execute(rows: list):
    """Create a mock db session whose execute() returns the given rows."""
    mock_result = MagicMock()
    mock_result.fetchall.return_value = rows
    mock_db = AsyncMock()
    mock_db.execute.return_value = mock_result
    return mock_db


def _mock_embedding(dim: int = 768):
    """Return a fake embedding list of length dim."""
    return [0.1] * dim


# ── Module-level structure tests ──────────────────────────────────────


class TestModuleStructure:
    """Verify search.py module structure — no FTS5 code remains."""

    def test_rrf_k_constant_exists(self):
        assert RRF_K == 60

    def test_hybrid_search_exists(self):
        assert callable(hybrid_search)

    def test_vector_search_exists(self):
        assert callable(vector_search)

    def test_fulltext_search_exists(self):
        assert callable(fulltext_search)

    def test_no_fts5_functions(self):
        """Verify old FTS5 functions are removed from the module."""
        import app.services.search as mod
        assert not hasattr(mod, "fts_search")
        assert not hasattr(mod, "ensure_fts_table")
        assert not hasattr(mod, "rebuild_fts_index")

    def test_no_fts5_constants(self):
        """Verify old FTS5 SQL constants are removed."""
        import app.services.search as mod
        assert not hasattr(mod, "FTS_CREATE_SQL")
        assert not hasattr(mod, "FTS_REBUILD_SQL")
        assert not hasattr(mod, "FTS_DROP_SQL")


# ── vector_search tests ───────────────────────────────────────────────


class TestVectorSearch:
    """Tests for vector_search() using pgvector cosine similarity."""

    @pytest.mark.asyncio
    async def test_returns_empty_list_when_embedding_is_none(self):
        """When EmbeddingService returns None, vector_search returns []."""
        with patch(
            "app.services.search.EmbeddingService.generate_embedding",
            new_callable=AsyncMock,
        ) as mock_gen:
            mock_gen.return_value = None
            db = AsyncMock()
            result = await vector_search("test query", 1, db)
            assert result == []

    @pytest.mark.asyncio
    async def test_returns_correct_structure_with_embedding(self):
        """vector_search returns list of dicts with note_id, content, score."""
        embedding = _mock_embedding()
        rows = [
            _mock_row(1, "Note about machine learning", 0.95),
            _mock_row(2, "Deep learning basics", 0.87),
            _mock_row(3, "Neural networks intro", 0.72),
        ]

        with patch(
            "app.services.search.EmbeddingService.generate_embedding",
            new_callable=AsyncMock,
        ) as mock_gen:
            mock_gen.return_value = embedding
            db = _mock_db_execute(rows)

            result = await vector_search("machine learning", 1, db)

            assert len(result) == 3
            assert result[0]["note_id"] == 1
            assert result[0]["content"] == "Note about machine learning"
            assert result[0]["score"] == 0.95
            assert result[1]["note_id"] == 2
            assert result[2]["note_id"] == 3

    @pytest.mark.asyncio
    async def test_sets_hnsw_ef_search(self):
        """vector_search sets HNSW ef_search before querying."""
        embedding = _mock_embedding()
        rows = [_mock_row(1, "content", 0.9)]

        with patch(
            "app.services.search.EmbeddingService.generate_embedding",
            new_callable=AsyncMock,
        ) as mock_gen:
            mock_gen.return_value = embedding
            db = _mock_db_execute(rows)

            await vector_search("test", 1, db)

            # Check that execute was called at least twice (SET LOCAL + query)
            # The first call should be SET LOCAL hnsw.ef_search
            assert db.execute.call_count >= 2, (
                f"Expected at least 2 execute calls (SET LOCAL + query), "
                f"got {db.execute.call_count}"
            )
            # Verify the first call's SQL contains hnsw.ef_search
            first_call_sql = str(db.execute.call_args_list[0].args[0])
            assert "hnsw.ef_search" in first_call_sql, (
                f"First execute call should set hnsw.ef_search, got: {first_call_sql}"
            )

    @pytest.mark.asyncio
    async def test_fetches_limit_times_2_for_rrf_pooling(self):
        """Fetches limit*2 results to provide enough candidates for RRF."""
        embedding = _mock_embedding()
        rows = [_mock_row(i, f"note {i}", 0.9) for i in range(1, 6)]

        with patch(
            "app.services.search.EmbeddingService.generate_embedding",
            new_callable=AsyncMock,
        ) as mock_gen:
            mock_gen.return_value = embedding
            db = _mock_db_execute(rows)

            await vector_search("test", 1, db, limit=5)

            # Verify that execute was called (SET LOCAL + main query)
            assert db.execute.call_count >= 2, (
                f"Expected at least 2 execute calls, got {db.execute.call_count}"
            )

    @pytest.mark.asyncio
    async def test_embedding_converted_to_pgvector_literal(self):
        """Embedding is formatted as '[0.1,0.2,...]' for pgvector."""
        embedding = [0.5, -0.3, 0.8]
        rows = [_mock_row(1, "content", 0.9)]

        with patch(
            "app.services.search.EmbeddingService.generate_embedding",
            new_callable=AsyncMock,
        ) as mock_gen:
            mock_gen.return_value = embedding
            db = _mock_db_execute(rows)

            await vector_search("test", 1, db)

            # Find the call that passes the query_vec param (the second execute call)
            # call_args[1] is the params dict for positional-arg style
            params_calls = [
                call.args[1]
                for call in db.execute.call_args_list
                if len(call.args) >= 2 and isinstance(call.args[1], dict)
            ]
            assert len(params_calls) >= 1, (
                f"Expected at least 1 call with params dict, got {len(params_calls)}"
            )
            params = params_calls[0]
            assert "query_vec" in params, f"Expected query_vec in params: {params}"
            assert params["query_vec"] == "[0.5,-0.3,0.8]"

    @pytest.mark.asyncio
    async def test_scores_are_floats(self):
        """All returned scores are Python floats."""
        embedding = _mock_embedding()
        rows = [_mock_row(1, "content", 0.95)]

        with patch(
            "app.services.search.EmbeddingService.generate_embedding",
            new_callable=AsyncMock,
        ) as mock_gen:
            mock_gen.return_value = embedding
            db = _mock_db_execute(rows)

            result = await vector_search("test", 1, db)

            assert isinstance(result[0]["score"], float)


# ── fulltext_search tests ─────────────────────────────────────────────


class TestFulltextSearch:
    """Tests for fulltext_search() using PostgreSQL tsvector."""

    @pytest.mark.asyncio
    async def test_returns_correct_structure(self):
        """fulltext_search returns list of dicts with note_id, content, score."""
        rows = [
            _mock_row(1, "Note about limits in calculus", 0.9),
            _mock_row(2, "Limit definition", 0.8),
        ]

        db = _mock_db_execute(rows)
        result = await fulltext_search("limit", 1, db)

        assert len(result) == 2
        assert result[0]["note_id"] == 1
        assert result[0]["content"] == "Note about limits in calculus"
        assert result[0]["score"] == 0.9
        assert result[1]["note_id"] == 2

    @pytest.mark.asyncio
    async def test_falls_back_to_ilike_on_error(self):
        """When tsquery fails, falls back to ILIKE search."""
        db = AsyncMock()
        # First call raises an exception (simulating tsquery failure)
        # Second call (ILIKE fallback) succeeds
        ilike_rows = [_mock_row(5, "Found via ILIKE", 0.1)]
        mock_fail = AsyncMock()
        mock_fail.execute.side_effect = Exception("syntax error in tsquery")

        # We need a db that fails first then succeeds
        fallback_result = MagicMock()
        fallback_result.fetchall.return_value = ilike_rows

        db.execute.side_effect = [
            Exception("syntax error in tsquery"),  # tsquery fails
            fallback_result,  # ILIKE succeeds
        ]

        result = await fulltext_search("special:chars!", 1, db)

        assert len(result) == 1
        assert result[0]["note_id"] == 5
        assert result[0]["content"] == "Found via ILIKE"
        assert result[0]["score"] == 0.1

    @pytest.mark.asyncio
    async def test_fetches_limit_times_2(self):
        """Fetches limit*2 for RRF pooling."""
        rows = [_mock_row(i, f"note {i}", 0.9) for i in range(1, 21)]
        db = _mock_db_execute(rows)

        result = await fulltext_search("test", 1, db, limit=10)

        # Should return at most 20 (limit*2), but we mocked 20 rows
        assert len(result) == 20

    @pytest.mark.asyncio
    async def test_scores_are_floats(self):
        """All returned scores are Python floats."""
        rows = [_mock_row(1, "content", 0.85)]
        db = _mock_db_execute(rows)

        result = await fulltext_search("test", 1, db)

        assert isinstance(result[0]["score"], float)


# ── hybrid_search tests ───────────────────────────────────────────────


class TestHybridSearch:
    """Tests for hybrid_search() with RRF fusion."""

    @pytest.mark.asyncio
    async def test_vector_mode_delegates_to_vector_search(self):
        """mode='vector' returns results from vector_search with source='vector'."""
        embedding = _mock_embedding()
        rows = [
            _mock_row(1, "Vector result", 0.95),
            _mock_row(2, "Another vector result", 0.80),
        ]

        with patch(
            "app.services.search.EmbeddingService.generate_embedding",
            new_callable=AsyncMock,
        ) as mock_gen:
            mock_gen.return_value = embedding
            db = _mock_db_execute(rows)

            result = await hybrid_search("machine learning", 1, db, limit=5, mode="vector")

            assert len(result) == 2
            for r in result:
                assert r["source"] == "vector"
            assert result[0]["note_id"] == 1
            assert result[0]["score"] == 0.95

    @pytest.mark.asyncio
    async def test_fulltext_mode_delegates_to_fulltext_search(self):
        """mode='fulltext' returns results from fulltext_search with source='fulltext'."""
        rows = [
            _mock_row(1, "Fulltext result", 0.9),
            _mock_row(2, "Another fulltext result", 0.7),
        ]

        db = _mock_db_execute(rows)
        result = await hybrid_search("keyword", 1, db, limit=5, mode="fulltext")

        assert len(result) == 2
        for r in result:
            assert r["source"] == "fulltext"
        assert result[0]["content"] == "Fulltext result"

    @pytest.mark.asyncio
    async def test_hybrid_mode_runs_both_searches_and_fuses(self):
        """mode='hybrid' runs both searches and fuses via RRF."""
        embedding = _mock_embedding()
        vector_rows = [
            _mock_row(1, "Vector top", 0.95),
            _mock_row(2, "Vector second", 0.80),
            _mock_row(3, "Vector third", 0.60),
        ]
        fulltext_rows = [
            _mock_row(2, "Vector second", 0.70),  # note 2 in both
            _mock_row(4, "Fulltext only", 0.50),
        ]

        # db needs to handle multiple execute calls:
        # 1. SET LOCAL hnsw.ef_search (vector)
        # 2. vector query
        # 3. fulltext query
        mock_vec_result = MagicMock()
        mock_vec_result.fetchall.return_value = vector_rows
        mock_ft_result = MagicMock()
        mock_ft_result.fetchall.return_value = fulltext_rows

        db = AsyncMock()
        db.execute.side_effect = [
            MagicMock(),  # SET LOCAL hnsw.ef_search
            mock_vec_result,  # vector query
            mock_ft_result,  # fulltext query
        ]

        with patch(
            "app.services.search.EmbeddingService.generate_embedding",
            new_callable=AsyncMock,
        ) as mock_gen:
            mock_gen.return_value = embedding

            result = await hybrid_search("machine learning", 1, db, limit=10, mode="hybrid")

            # Should fuse 4 unique notes (1, 2, 3 from vector + 4 from fulltext)
            assert len(result) == 4

            # All should have source='hybrid'
            for r in result:
                assert r["source"] == "hybrid"

            # Note 1 (rank 1 in vector) + Note 2 (rank 2 in vector + rank 1 in fulltext)
            # RRF scores:
            #   note 1: 1/(60+1) = 1/61 ≈ 0.01639
            #   note 2: 1/(60+2) + 1/(60+1) = 1/62 + 1/61 ≈ 0.01613 + 0.01639 = 0.03252
            #   note 3: 1/(60+3) = 1/63 ≈ 0.01587
            #   note 4: 1/(60+2) = 1/62 ≈ 0.01613
            # So note 2 should be first
            assert result[0]["note_id"] == 2  # highest RRF score
            assert result[1]["note_id"] == 1

    @pytest.mark.asyncio
    async def test_rrf_scoring_correctness(self):
        """Verify RRF formula: score = SUM(1/(k + rank_i))."""
        embedding = _mock_embedding()
        vector_rows = [
            _mock_row(1, "Note 1", 0.9),
            _mock_row(2, "Note 2", 0.8),
        ]
        fulltext_rows = [
            _mock_row(2, "Note 2", 0.7),
            _mock_row(3, "Note 3", 0.6),
        ]

        mock_vec_result = MagicMock()
        mock_vec_result.fetchall.return_value = vector_rows
        mock_ft_result = MagicMock()
        mock_ft_result.fetchall.return_value = fulltext_rows
        db = AsyncMock()
        db.execute.side_effect = [
            MagicMock(),  # SET LOCAL
            mock_vec_result,
            mock_ft_result,
        ]

        with patch(
            "app.services.search.EmbeddingService.generate_embedding",
            new_callable=AsyncMock,
        ) as mock_gen:
            mock_gen.return_value = embedding

            result = await hybrid_search("test", 1, db, limit=10, mode="hybrid")

            # RRF raw scores:
            # note 1: 1/(60+1) = 1/61 ≈ 0.016393
            # note 2: 1/(60+2) + 1/(60+1) = 1/62 + 1/61 ≈ 0.016129 + 0.016393 = 0.032522
            # note 3: 1/(60+2) = 1/62 ≈ 0.016129
            # Max = 0.032522 (note 2)
            # Normalized:
            #   note 2: 0.032522 / 0.032522 = 1.0
            #   note 1: 0.016393 / 0.032522 ≈ 0.5041
            #   note 3: 0.016129 / 0.032522 ≈ 0.4959

            assert result[0]["note_id"] == 2
            assert result[0]["score"] == pytest.approx(1.0, abs=0.01)
            assert result[1]["score"] == pytest.approx(0.504, abs=0.01)
            assert result[2]["score"] == pytest.approx(0.496, abs=0.01)

    @pytest.mark.asyncio
    async def test_hybrid_scores_normalized_to_0_1(self):
        """All hybrid search scores are normalized to [0, 1] range."""
        embedding = _mock_embedding()
        vector_rows = [
            _mock_row(1, "Note 1", 0.9),
        ]
        fulltext_rows = [
            _mock_row(2, "Note 2", 0.7),
        ]

        mock_vec_result = MagicMock()
        mock_vec_result.fetchall.return_value = vector_rows
        mock_ft_result = MagicMock()
        mock_ft_result.fetchall.return_value = fulltext_rows
        db = AsyncMock()
        db.execute.side_effect = [
            MagicMock(),  # SET LOCAL
            mock_vec_result,
            mock_ft_result,
        ]

        with patch(
            "app.services.search.EmbeddingService.generate_embedding",
            new_callable=AsyncMock,
        ) as mock_gen:
            mock_gen.return_value = embedding

            result = await hybrid_search("test", 1, db, limit=10, mode="hybrid")

            for r in result:
                assert 0.0 <= r["score"] <= 1.0, f"Score {r['score']} out of [0,1]"

    @pytest.mark.asyncio
    async def test_hybrid_respects_limit(self):
        """hybrid_search returns at most `limit` results."""
        embedding = _mock_embedding()
        vector_rows = [_mock_row(i, f"Note {i}", 0.9) for i in range(1, 11)]
        fulltext_rows = [_mock_row(i + 10, f"Note {i+10}", 0.8) for i in range(1, 11)]

        mock_vec_result = MagicMock()
        mock_vec_result.fetchall.return_value = vector_rows
        mock_ft_result = MagicMock()
        mock_ft_result.fetchall.return_value = fulltext_rows
        db = AsyncMock()
        db.execute.side_effect = [
            MagicMock(),  # SET LOCAL
            mock_vec_result,
            mock_ft_result,
        ]

        with patch(
            "app.services.search.EmbeddingService.generate_embedding",
            new_callable=AsyncMock,
        ) as mock_gen:
            mock_gen.return_value = embedding

            result = await hybrid_search("test", 1, db, limit=5, mode="hybrid")

            assert len(result) == 5

    @pytest.mark.asyncio
    async def test_empty_results_both_searches(self):
        """When both searches return empty, hybrid returns empty list."""
        embedding = _mock_embedding()

        mock_vec_result = MagicMock()
        mock_vec_result.fetchall.return_value = []
        mock_ft_result = MagicMock()
        mock_ft_result.fetchall.return_value = []
        db = AsyncMock()
        db.execute.side_effect = [
            MagicMock(),  # SET LOCAL
            mock_vec_result,
            mock_ft_result,
        ]

        with patch(
            "app.services.search.EmbeddingService.generate_embedding",
            new_callable=AsyncMock,
        ) as mock_gen:
            mock_gen.return_value = embedding

            result = await hybrid_search("no match", 1, db, limit=10, mode="hybrid")

            assert result == []

    @pytest.mark.asyncio
    async def test_vector_mode_when_embedding_fails_returns_empty(self):
        """When embedding generation fails in vector mode, returns empty list."""
        with patch(
            "app.services.search.EmbeddingService.generate_embedding",
            new_callable=AsyncMock,
        ) as mock_gen:
            mock_gen.return_value = None
            db = AsyncMock()

            result = await hybrid_search("test", 1, db, limit=5, mode="vector")

            assert result == []

    @pytest.mark.asyncio
    async def test_hybrid_mode_when_embedding_fails_still_runs_fulltext(self):
        """When embedding fails in hybrid mode, fulltext results still returned."""
        fulltext_rows = [
            _mock_row(5, "Fulltext only result", 0.8),
        ]

        mock_ft_result = MagicMock()
        mock_ft_result.fetchall.return_value = fulltext_rows
        db = AsyncMock()
        # vector_search returns [] (embedding is None → no execute calls)
        # fulltext_search makes one execute call
        db.execute.side_effect = [
            mock_ft_result,  # fulltext query
        ]

        with patch(
            "app.services.search.EmbeddingService.generate_embedding",
            new_callable=AsyncMock,
        ) as mock_gen:
            mock_gen.return_value = None

            result = await hybrid_search("test", 1, db, limit=5, mode="hybrid")

            assert len(result) == 1
            assert result[0]["note_id"] == 5
            assert result[0]["source"] == "hybrid"

    @pytest.mark.asyncio
    async def test_default_mode_is_hybrid(self):
        """When mode not specified, defaults to 'hybrid'."""
        embedding = _mock_embedding()
        vector_rows = [_mock_row(1, "Note 1", 0.9)]
        fulltext_rows = [_mock_row(2, "Note 2", 0.7)]

        mock_vec_result = MagicMock()
        mock_vec_result.fetchall.return_value = vector_rows
        mock_ft_result = MagicMock()
        mock_ft_result.fetchall.return_value = fulltext_rows
        db = AsyncMock()
        db.execute.side_effect = [
            MagicMock(),  # SET LOCAL
            mock_vec_result,
            mock_ft_result,
        ]

        with patch(
            "app.services.search.EmbeddingService.generate_embedding",
            new_callable=AsyncMock,
        ) as mock_gen:
            mock_gen.return_value = embedding

            # mode not specified = defaults to "hybrid"
            result = await hybrid_search("test", 1, db, limit=10)

            assert len(result) == 2
            for r in result:
                assert r["source"] == "hybrid"


# ── Edge case tests ───────────────────────────────────────────────────


class TestEdgeCases:
    """Edge case and behavioral tests for search functions."""

    @pytest.mark.asyncio
    async def test_vector_search_empty_db(self):
        """vector_search with empty result set returns []."""
        embedding = _mock_embedding()

        with patch(
            "app.services.search.EmbeddingService.generate_embedding",
            new_callable=AsyncMock,
        ) as mock_gen:
            mock_gen.return_value = embedding
            db = _mock_db_execute([])

            result = await vector_search("query", 1, db)
            assert result == []

    @pytest.mark.asyncio
    async def test_fulltext_search_empty_db(self):
        """fulltext_search with empty result set returns []."""
        db = _mock_db_execute([])
        result = await fulltext_search("noresults", 1, db)
        assert result == []

    @pytest.mark.asyncio
    async def test_hybrid_with_one_search_empty(self):
        """Hybrid works when one search returns empty results."""
        embedding = _mock_embedding()
        vector_rows = [_mock_row(1, "Only vector", 0.9)]
        fulltext_rows: list = []

        mock_vec_result = MagicMock()
        mock_vec_result.fetchall.return_value = vector_rows
        mock_ft_result = MagicMock()
        mock_ft_result.fetchall.return_value = fulltext_rows
        db = AsyncMock()
        db.execute.side_effect = [
            MagicMock(),  # SET LOCAL
            mock_vec_result,
            mock_ft_result,
        ]

        with patch(
            "app.services.search.EmbeddingService.generate_embedding",
            new_callable=AsyncMock,
        ) as mock_gen:
            mock_gen.return_value = embedding

            result = await hybrid_search("test", 1, db, limit=10, mode="hybrid")

            assert len(result) == 1
            assert result[0]["note_id"] == 1
            assert result[0]["source"] == "hybrid"

    @pytest.mark.asyncio
    async def test_overlapping_results_preserve_content(self):
        """When a note appears in both searches, it appears once with valid content."""
        embedding = _mock_embedding()
        vector_rows = [_mock_row(1, "Vector content version", 0.9)]
        fulltext_rows = [_mock_row(1, "Fulltext content version", 0.8)]

        mock_vec_result = MagicMock()
        mock_vec_result.fetchall.return_value = vector_rows
        mock_ft_result = MagicMock()
        mock_ft_result.fetchall.return_value = fulltext_rows
        db = AsyncMock()
        db.execute.side_effect = [
            MagicMock(),  # SET LOCAL
            mock_vec_result,
            mock_ft_result,
        ]

        with patch(
            "app.services.search.EmbeddingService.generate_embedding",
            new_callable=AsyncMock,
        ) as mock_gen:
            mock_gen.return_value = embedding

            result = await hybrid_search("test", 1, db, limit=10, mode="hybrid")

            assert len(result) == 1
            # Note appears once even though it's in both result sets
            # Content from fulltext (processed second) overwrites vector content
            assert result[0]["content"] == "Fulltext content version"
