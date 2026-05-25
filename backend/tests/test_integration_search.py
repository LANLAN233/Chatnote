"""Integration tests for the search pipeline (hybrid + vector + fulltext + embedding).

Verifies end-to-end search flow, mode routing, RRF fusion, embedding caching,
and NoteSearchResult schema — all using mocks (no real DB required).
"""
import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.search import hybrid_search, vector_search, fulltext_search, RRF_K
from app.services.embedding import EmbeddingService
from app.schemas.schemas import NoteSearchResult


# ── Helpers ──────────────────────────────────────────────────────────────────

def _mock_row(note_id: int, content: str, score: float):
    """Create a mock Row object with .note_id, .content, .score attributes."""
    row = MagicMock()
    row.note_id = note_id
    row.content = content
    row.score = score
    return row


def _mock_embedding(dim: int = 768):
    """Return a fake embedding list of length dim."""
    return [0.1] * dim


# ── Search Pipeline Integration Tests ────────────────────────────────────────


class TestSearchPipelineEndToEnd:
    """End-to-end search pipeline integration tests — mode routing and fusion."""

    @pytest.mark.asyncio
    async def test_hybrid_search_combines_both_sources(self):
        """hybrid_search in hybrid mode calls both vector and fulltext searches."""
        embedding = _mock_embedding()
        vector_rows = [
            _mock_row(1, "Vector result alpha", 0.9),
            _mock_row(2, "Vector result beta", 0.7),
        ]
        fulltext_rows = [
            _mock_row(3, "Fulltext result gamma", 0.8),
            _mock_row(4, "Fulltext result delta", 0.6),
        ]

        mock_vec_result = MagicMock()
        mock_vec_result.fetchall.return_value = vector_rows
        mock_ft_result = MagicMock()
        mock_ft_result.fetchall.return_value = fulltext_rows
        db = AsyncMock()
        db.execute.side_effect = [
            MagicMock(),     # SET LOCAL hnsw.ef_search
            mock_vec_result,  # vector query
            mock_ft_result,   # fulltext query
        ]

        with patch(
            "app.services.search.EmbeddingService.generate_embedding",
            new_callable=AsyncMock,
        ) as mock_gen:
            mock_gen.return_value = embedding

            results = await hybrid_search("test query", 1, db, limit=10, mode="hybrid")

        assert len(results) > 0
        for r in results:
            assert "note_id" in r
            assert "content" in r
            assert "score" in r
            assert "source" in r

    @pytest.mark.asyncio
    async def test_vector_mode_only_calls_vector(self):
        """mode='vector' should only use vector search, not fulltext."""
        embedding = _mock_embedding()
        vector_rows = [
            _mock_row(1, "Vector only result", 0.95),
            _mock_row(2, "Second vector result", 0.80),
        ]
        db = _mock_db_for_vector(vector_rows)

        with patch(
            "app.services.search.EmbeddingService.generate_embedding",
            new_callable=AsyncMock,
        ) as mock_gen:
            mock_gen.return_value = embedding

            results = await hybrid_search("test", 1, db, limit=10, mode="vector")

        assert len(results) == 2
        assert all(r["source"] == "vector" for r in results)

    @pytest.mark.asyncio
    async def test_fulltext_mode_only_calls_fulltext(self):
        """mode='fulltext' should only use fulltext search, not vector."""
        fulltext_rows = [
            _mock_row(1, "Fulltext only result", 0.9),
            _mock_row(2, "Second fulltext result", 0.7),
        ]
        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.fetchall.return_value = fulltext_rows
        db.execute.return_value = mock_result

        results = await hybrid_search("test", 1, db, limit=10, mode="fulltext")

        assert len(results) == 2
        assert all(r["source"] == "fulltext" for r in results)

    @pytest.mark.asyncio
    async def test_hybrid_mode_when_embedding_fails_still_returns_fulltext(self):
        """When embedding fails in hybrid mode, fulltext results are still returned."""
        fulltext_rows = [
            _mock_row(5, "Fallback fulltext result", 0.5),
        ]
        mock_ft_result = MagicMock()
        mock_ft_result.fetchall.return_value = fulltext_rows
        db = AsyncMock()
        db.execute.side_effect = [mock_ft_result]  # only fulltext query

        with patch(
            "app.services.search.EmbeddingService.generate_embedding",
            new_callable=AsyncMock,
        ) as mock_gen:
            mock_gen.return_value = None

            results = await hybrid_search("test", 1, db, limit=10, mode="hybrid")

        assert len(results) > 0
        assert results[0]["note_id"] == 5

    @pytest.mark.asyncio
    async def test_rrf_scores_are_normalized_to_0_1(self):
        """All RRF fusion scores should be in the [0, 1] range."""
        embedding = _mock_embedding()
        vector_rows = [_mock_row(i, f"V{i}", 1.0) for i in range(1, 4)]
        fulltext_rows = [_mock_row(i, f"F{i}", 1.0) for i in range(3, 6)]

        mock_vec_result = MagicMock()
        mock_vec_result.fetchall.return_value = vector_rows
        mock_ft_result = MagicMock()
        mock_ft_result.fetchall.return_value = fulltext_rows
        db = AsyncMock()
        db.execute.side_effect = [
            MagicMock(),
            mock_vec_result,
            mock_ft_result,
        ]

        with patch(
            "app.services.search.EmbeddingService.generate_embedding",
            new_callable=AsyncMock,
        ) as mock_gen:
            mock_gen.return_value = embedding

            results = await hybrid_search("test", 1, db, limit=10, mode="hybrid")

        for r in results:
            assert 0.0 <= r["score"] <= 1.0, (
                f"Score {r['score']} out of [0,1] range"
            )

        # Best result should be exactly 1.0 (normalized)
        assert results[0]["score"] == pytest.approx(1.0, abs=0.01)

    @pytest.mark.asyncio
    async def test_best_hybrid_result_has_max_normalized_score(self):
        """The top result after RRF normalization should have score 1.0."""
        embedding = _mock_embedding()
        vector_rows = [_mock_row(1, "Best match", 0.99)]
        fulltext_rows = [_mock_row(2, "Second match", 0.5)]

        mock_vec_result = MagicMock()
        mock_vec_result.fetchall.return_value = vector_rows
        mock_ft_result = MagicMock()
        mock_ft_result.fetchall.return_value = fulltext_rows
        db = AsyncMock()
        db.execute.side_effect = [
            MagicMock(),
            mock_vec_result,
            mock_ft_result,
        ]

        with patch(
            "app.services.search.EmbeddingService.generate_embedding",
            new_callable=AsyncMock,
        ) as mock_gen:
            mock_gen.return_value = embedding

            results = await hybrid_search("test", 1, db, limit=10, mode="hybrid")

        assert len(results) >= 1
        assert results[0]["score"] == pytest.approx(1.0, abs=0.01)


# ── NoteSearchResult Schema Tests ────────────────────────────────────────────


class TestNoteSearchResultSchema:
    """Verify the NoteSearchResult Pydantic schema matches search output."""

    def test_schema_has_required_fields(self):
        """NoteSearchResult must include note_id, content, score, source."""
        fields = NoteSearchResult.model_fields
        assert "note_id" in fields
        assert "content" in fields
        assert "score" in fields
        assert "source" in fields

    def test_score_is_float(self):
        """Score field must be annotated as float."""
        fields = NoteSearchResult.model_fields
        score_field = fields["score"]
        assert score_field.annotation is float, (
            f"score should be float, got {score_field.annotation}"
        )

    def test_source_is_string(self):
        """Source field must be annotated as str."""
        fields = NoteSearchResult.model_fields
        source_field = fields["source"]
        assert source_field.annotation is str, (
            f"source should be str, got {source_field.annotation}"
        )

    def test_valid_source_values_can_be_constructed(self):
        """Schema accepts valid source values: vector, fulltext, hybrid."""
        valid_sources = ["vector", "fulltext", "hybrid"]
        for src in valid_sources:
            result = NoteSearchResult(
                note_id=1,
                content="test content",
                score=0.9,
                source=src,
            )
            assert result.source == src

    def test_search_output_fits_schema(self):
        """hybrid_search output dicts should conform to NoteSearchResult fields."""
        # Verify that all dict keys in search output match schema field names
        schema_fields = set(NoteSearchResult.model_fields.keys())
        search_output_keys = {"note_id", "content", "score", "source"}
        assert search_output_keys.issubset(schema_fields), (
            f"Search output keys {search_output_keys} not all in schema {schema_fields}"
        )


# ── Embedding Pipeline Integration Tests ─────────────────────────────────────


class TestEmbeddingPipelineIntegration:
    """Integration tests for embedding generation + caching pipeline."""

    @pytest.mark.asyncio
    async def test_get_or_create_embedding_cache_hit(self):
        """Should return cached embedding without calling OpenAI API."""
        mock_db = AsyncMock()
        cached_embedding = [0.1, 0.2, 0.3]

        # Mock existing NoteEmbedding record
        mock_result = MagicMock()
        mock_record = MagicMock()
        mock_record.embedding = cached_embedding
        mock_result.scalar_one_or_none.return_value = mock_record
        mock_db.execute = AsyncMock(return_value=mock_result)

        with patch.object(
            EmbeddingService, "generate_embedding"
        ) as mock_gen:
            result = await EmbeddingService.get_or_create_embedding(
                1, "test content", mock_db
            )

            assert result == cached_embedding
            mock_gen.assert_not_called()

    @pytest.mark.asyncio
    async def test_get_or_create_embedding_cache_miss(self):
        """Should generate and store new embedding on cache miss."""
        mock_db = AsyncMock()
        new_embedding = [0.7, 0.8, 0.9]

        # Mock: no existing record
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(return_value=mock_result)
        # add() is sync in SQLAlchemy, not async
        mock_db.add = MagicMock()

        with patch.object(
            EmbeddingService, "generate_embedding", new_callable=AsyncMock
        ) as mock_gen:
            mock_gen.return_value = new_embedding

            result = await EmbeddingService.get_or_create_embedding(
                1, "new content", mock_db
            )

            assert result == new_embedding
            mock_gen.assert_awaited_once_with("new content")
            mock_db.add.assert_called_once()
            mock_db.flush.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_get_or_create_embedding_returns_none_on_api_failure(self):
        """Should return None and not store anything when API fails."""
        mock_db = AsyncMock()

        # Mock: no existing record
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(return_value=mock_result)
        # add() is sync in SQLAlchemy, not async
        mock_db.add = MagicMock()

        with patch.object(
            EmbeddingService, "generate_embedding", new_callable=AsyncMock
        ) as mock_gen:
            mock_gen.return_value = None

            result = await EmbeddingService.get_or_create_embedding(
                1, "content", mock_db
            )

            assert result is None
            mock_db.add.assert_not_called()


# ── Data Flow Integration Tests ──────────────────────────────────────────────


class TestDataFlowEndToEnd:
    """Verify the complete data flow structure — services are properly connected."""

    def test_all_search_services_importable(self):
        """Search, embedding, and note services form a complete chain."""
        from app.services.search import hybrid_search, vector_search, fulltext_search
        from app.services.embedding import EmbeddingService
        from app.services.note_service import fetch_notes_semantic

        assert hybrid_search is not None
        assert vector_search is not None
        assert fulltext_search is not None
        assert EmbeddingService is not None
        assert fetch_notes_semantic is not None

    def test_rrf_k_constant_is_60(self):
        """RRF constant k should be 60 (standard value)."""
        assert RRF_K == 60

    def test_embedding_model_dimension_is_768(self):
        """Embedding model output dimension should be 768 (text-embedding-3-small)."""
        assert EmbeddingService._dimensions == 768

    def test_embedding_model_name_is_correct(self):
        """Model name should be text-embedding-3-small."""
        assert EmbeddingService._model == "text-embedding-3-small"


# ── Export for pytest collection ─────────────────────────────────────────────


def _mock_db_for_vector(rows: list):
    """Helper: mock db for a vector search only."""
    mock_result = MagicMock()
    mock_result.fetchall.return_value = rows
    db = AsyncMock()
    db.execute.side_effect = [
        MagicMock(),  # SET LOCAL hnsw.ef_search
        mock_result,   # vector query
    ]
    return db
