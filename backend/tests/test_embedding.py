"""Tests for embedding.py — EmbeddingService using OpenAI text-embedding-3-small.

Tests are import/mock-based since the test DB is SQLite (no pgvector support).
OpenAI client calls are mocked; DB interactions use AsyncMock where needed.
"""

import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.embedding import EmbeddingService


# ── Helper: build a fake OpenAI embedding response object ────────────
def _mock_embedding_data(embedding: list[float]):
    """Return a mock response object with the expected .data[0].embedding path."""
    item = MagicMock()
    item.embedding = embedding
    response = MagicMock()
    response.data = [item]
    return response


def _mock_embedding_data_batch(embeddings: list[list[float]]):
    """Return a mock response object with .data for batch."""
    response = MagicMock()
    response.data = [MagicMock() for _ in embeddings]
    for item, emb in zip(response.data, embeddings):
        item.embedding = emb
    return response


# ── Class structure tests (no mocks needed) ──────────────────────────

class TestEmbeddingServiceExists:
    """Verify EmbeddingService class definition."""

    def test_class_exists(self):
        assert EmbeddingService is not None

    def test_has_method_generate_embedding(self):
        assert hasattr(EmbeddingService, "generate_embedding")
        assert callable(EmbeddingService.generate_embedding)

    def test_has_method_generate_embeddings_batch(self):
        assert hasattr(EmbeddingService, "generate_embeddings_batch")
        assert callable(EmbeddingService.generate_embeddings_batch)

    def test_has_method_get_or_create_embedding(self):
        assert hasattr(EmbeddingService, "get_or_create_embedding")
        assert callable(EmbeddingService.get_or_create_embedding)

    def test_has_method_get_client(self):
        assert hasattr(EmbeddingService, "_get_client")
        assert callable(EmbeddingService._get_client)

    def test_default_model_is_text_embedding_3_small(self):
        assert EmbeddingService._model == "text-embedding-3-small"

    def test_default_dimensions_is_768(self):
        assert EmbeddingService._dimensions == 768

    def test_default_max_retries_is_3(self):
        assert EmbeddingService._max_retries == 3


# ── Client initialization tests ──────────────────────────────────────

class TestGetClient:
    """Test _get_client lazy initialization."""

    def setup_method(self):
        """Reset client cache before each test."""
        EmbeddingService._client = None

    def test_returns_none_when_no_api_key(self):
        """_get_client returns None when OPENAI_API_KEY is empty."""
        with patch("app.services.embedding.settings") as mock_settings:
            mock_settings.OPENAI_API_KEY = ""
            client = EmbeddingService._get_client()
            assert client is None

    def test_returns_client_when_api_key_present(self):
        """_get_client returns an AsyncOpenAI client when key is set."""
        with patch("app.services.embedding.settings") as mock_settings:
            mock_settings.OPENAI_API_KEY = "sk-test-key"
            # Also mock the AsyncOpenAI constructor to avoid real network
            with patch("app.services.embedding.AsyncOpenAI") as mock_openai_cls:
                mock_client = MagicMock()
                mock_openai_cls.return_value = mock_client
                client = EmbeddingService._get_client()
                assert client is mock_client
                mock_openai_cls.assert_called_once_with(api_key="sk-test-key")

    def test_client_is_cached_after_first_call(self):
        """Second call reuses cached client without creating new one."""
        with patch("app.services.embedding.settings") as mock_settings:
            mock_settings.OPENAI_API_KEY = "sk-test-key"
            with patch("app.services.embedding.AsyncOpenAI") as mock_openai_cls:
                mock_client = MagicMock()
                mock_openai_cls.return_value = mock_client
                first = EmbeddingService._get_client()
                second = EmbeddingService._get_client()
                assert first is second
                mock_openai_cls.assert_called_once()


# ── Single embedding generation tests ────────────────────────────────

class TestGenerateEmbedding:
    """Test generate_embedding with mocked OpenAI client."""

    def setup_method(self):
        EmbeddingService._client = None

    def test_returns_none_without_api_key(self):
        """Returns None when no API key is configured."""
        with patch("app.services.embedding.settings") as mock_settings:
            mock_settings.OPENAI_API_KEY = ""
            result = asyncio.run(EmbeddingService.generate_embedding("hello"))
            assert result is None

    def test_returns_embedding_on_success(self):
        """Returns embedding vector on successful API call."""
        mock_vector = [0.1, 0.2, 0.3]

        with patch("app.services.embedding.settings") as mock_settings:
            mock_settings.OPENAI_API_KEY = "sk-test"
            with patch.object(EmbeddingService, "_get_client") as mock_get_client:
                mock_client = AsyncMock()
                mock_client.embeddings.create = AsyncMock(
                    return_value=_mock_embedding_data(mock_vector)
                )
                mock_get_client.return_value = mock_client

                result = asyncio.run(
                    EmbeddingService.generate_embedding("hello world")
                )
                assert result == mock_vector
                mock_client.embeddings.create.assert_awaited_once()

    def test_truncates_long_text(self):
        """Truncates text longer than 32000 characters."""
        long_text = "x" * 50000  # > 32000

        with patch("app.services.embedding.settings") as mock_settings:
            mock_settings.OPENAI_API_KEY = "sk-test"
            with patch.object(EmbeddingService, "_get_client") as mock_get_client:
                mock_client = AsyncMock()
                mock_client.embeddings.create = AsyncMock(
                    return_value=_mock_embedding_data([0.1])
                )
                mock_get_client.return_value = mock_client

                result = asyncio.run(
                    EmbeddingService.generate_embedding(long_text)
                )
                # Verify the text was truncated before sending
                call_args = mock_client.embeddings.create.call_args
                sent_text = call_args.kwargs["input"]
                assert len(sent_text) == 32000
                assert result == [0.1]

    def test_retries_on_transient_error(self):
        """Retries with exponential backoff on transient errors."""
        mock_vector = [0.5, 0.6]

        with patch("app.services.embedding.settings") as mock_settings:
            mock_settings.OPENAI_API_KEY = "sk-test"
            with patch.object(EmbeddingService, "_get_client") as mock_get_client:
                mock_client = AsyncMock()
                # Fail twice, succeed on third attempt
                mock_client.embeddings.create = AsyncMock(
                    side_effect=[
                        Exception("rate limit"),
                        Exception("server error"),
                        _mock_embedding_data(mock_vector),
                    ]
                )
                mock_get_client.return_value = mock_client

                with patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
                    result = asyncio.run(
                        EmbeddingService.generate_embedding("test")
                    )
                    assert result == mock_vector
                    assert mock_client.embeddings.create.await_count == 3
                    # Should have slept twice (attempts 1 and 2 fail)
                    assert mock_sleep.await_count == 2

    def test_returns_none_after_all_retries_fail(self):
        """Returns None after max_retries exhausted."""
        with patch("app.services.embedding.settings") as mock_settings:
            mock_settings.OPENAI_API_KEY = "sk-test"
            with patch.object(EmbeddingService, "_get_client") as mock_get_client:
                mock_client = AsyncMock()
                mock_client.embeddings.create = AsyncMock(
                    side_effect=Exception("always fail")
                )
                mock_get_client.return_value = mock_client

                with patch("asyncio.sleep", new_callable=AsyncMock):
                    result = asyncio.run(
                        EmbeddingService.generate_embedding("test")
                    )
                    assert result is None
                    assert mock_client.embeddings.create.await_count == 3


# ── Batch embedding generation tests ─────────────────────────────────

class TestGenerateEmbeddingsBatch:
    """Test generate_embeddings_batch with mocked OpenAI client."""

    def setup_method(self):
        EmbeddingService._client = None

    def test_returns_nones_without_api_key(self):
        """Returns list of None when no API key."""
        with patch("app.services.embedding.settings") as mock_settings:
            mock_settings.OPENAI_API_KEY = ""
            result = asyncio.run(
                EmbeddingService.generate_embeddings_batch(["a", "b"])
            )
            assert result == [None, None]

    def test_batch_single_call(self):
        """Small batch fits in one API call."""
        vectors = [[0.1, 0.2], [0.3, 0.4]]

        with patch("app.services.embedding.settings") as mock_settings:
            mock_settings.OPENAI_API_KEY = "sk-test"
            with patch.object(EmbeddingService, "_get_client") as mock_get_client:
                mock_client = AsyncMock()
                mock_client.embeddings.create = AsyncMock(
                    return_value=_mock_embedding_data_batch(vectors)
                )
                mock_get_client.return_value = mock_client

                with patch("asyncio.sleep", new_callable=AsyncMock):
                    result = asyncio.run(
                        EmbeddingService.generate_embeddings_batch(
                            ["text1", "text2"], batch_size=100
                        )
                    )
                    assert result == vectors
                    mock_client.embeddings.create.assert_awaited_once()

    def test_batch_multiple_calls(self):
        """Large batch triggers multiple API calls."""
        texts = ["text"] * 250  # 250 items, batch_size=100 → 3 calls
        vectors = [[0.1]] * 250

        with patch("app.services.embedding.settings") as mock_settings:
            mock_settings.OPENAI_API_KEY = "sk-test"
            with patch.object(EmbeddingService, "_get_client") as mock_get_client:
                mock_client = AsyncMock()

                # Return 100 embeddings per call
                def side_effect(model, input, dimensions):
                    count = len(input) if isinstance(input, list) else 1
                    return _mock_embedding_data_batch([[0.1]] * count)

                mock_client.embeddings.create = AsyncMock(side_effect=side_effect)
                mock_get_client.return_value = mock_client

                with patch("asyncio.sleep", new_callable=AsyncMock):
                    result = asyncio.run(
                        EmbeddingService.generate_embeddings_batch(
                            texts, batch_size=100
                        )
                    )
                    assert len(result) == 250
                    # 250 items / 100 batch = 3 calls (100, 100, 50)
                    assert mock_client.embeddings.create.await_count == 3

    def test_batch_truncates_long_texts(self):
        """Batch truncates each text to 32000 chars."""
        texts = ["x" * 50000, "hello"]

        with patch("app.services.embedding.settings") as mock_settings:
            mock_settings.OPENAI_API_KEY = "sk-test"
            with patch.object(EmbeddingService, "_get_client") as mock_get_client:
                mock_client = AsyncMock()
                mock_client.embeddings.create = AsyncMock(
                    return_value=_mock_embedding_data_batch([[0.1], [0.2]])
                )
                mock_get_client.return_value = mock_client

                with patch("asyncio.sleep", new_callable=AsyncMock):
                    asyncio.run(
                        EmbeddingService.generate_embeddings_batch(texts)
                    )
                    call_args = mock_client.embeddings.create.call_args
                    sent_texts = call_args.kwargs["input"]
                    assert len(sent_texts[0]) == 32000
                    assert sent_texts[1] == "hello"


# ── Cache (get_or_create) tests ──────────────────────────────────────

class TestGetOrCreateEmbedding:
    """Test get_or_create_embedding with mocked DB and OpenAI."""

    def setup_method(self):
        EmbeddingService._client = None

    def test_returns_cached_embedding_on_hit(self):
        """When NoteEmbedding exists, return cached embedding without API call."""
        mock_db = AsyncMock()
        cached_embedding = [0.1, 0.2, 0.3]

        # Mock the select result to return an existing NoteEmbedding
        mock_result = MagicMock()
        mock_record = MagicMock()
        mock_record.embedding = cached_embedding
        mock_result.scalar_one_or_none.return_value = mock_record
        mock_db.execute = AsyncMock(return_value=mock_result)

        with patch.object(EmbeddingService, "generate_embedding") as mock_gen:
            result = asyncio.run(
                EmbeddingService.get_or_create_embedding(42, "some content", mock_db)
            )
            assert result == cached_embedding
            # Should NOT call generate_embedding
            mock_gen.assert_not_called()

    def test_generates_and_stores_on_miss(self):
        """When no cached embedding, generate and store a new one."""
        mock_db = AsyncMock()
        new_embedding = [0.7, 0.8, 0.9]

        # Mock: no existing record
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(return_value=mock_result)

        with patch.object(
            EmbeddingService, "generate_embedding", new_callable=AsyncMock
        ) as mock_gen:
            mock_gen.return_value = new_embedding

            result = asyncio.run(
                EmbeddingService.get_or_create_embedding(42, "fresh content", mock_db)
            )
            assert result == new_embedding
            # Should have called generate_embedding
            mock_gen.assert_awaited_once_with("fresh content")
            # Should have added record to DB
            mock_db.add.assert_called_once()
            mock_db.flush.assert_awaited_once()

    def test_returns_none_when_generation_fails(self):
        """Returns None when embedding generation fails and nothing cached."""
        mock_db = AsyncMock()

        # Mock: no existing record
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(return_value=mock_result)

        with patch.object(
            EmbeddingService, "generate_embedding", new_callable=AsyncMock
        ) as mock_gen:
            mock_gen.return_value = None

            result = asyncio.run(
                EmbeddingService.get_or_create_embedding(42, "content", mock_db)
            )
            assert result is None
            # Should NOT add to DB when generation fails
            mock_db.add.assert_not_called()
