"""Tests for PostgreSQL database configuration."""

from app.database import Base, engine


class TestDatabaseConfig:
    """Verify database configuration values."""

    def test_engine_created(self):
        """Engine can be created (import works, no construction errors)."""
        assert engine is not None
        assert hasattr(engine, "connect")
        assert hasattr(engine, "begin")

    def test_base_class_exists(self):
        """Base declarative class is defined."""
        assert Base is not None
        assert hasattr(Base, "metadata")
        assert hasattr(Base, "registry")


class TestSettings:
    """Verify PostgreSQL and embedding settings."""

    def test_database_url_is_postgres(self):
        """DATABASE_URL uses postgresql+asyncpg."""
        from app.config import settings

        assert "postgresql+asyncpg" in settings.DATABASE_URL
        assert "localhost" in settings.DATABASE_URL
        assert "chatnote" in settings.DATABASE_URL

    def test_embedding_model(self):
        """EMBEDDING_MODEL is text-embedding-3-small."""
        from app.config import settings

        assert settings.EMBEDDING_MODEL == "text-embedding-3-small"

    def test_embedding_dimensions(self):
        """EMBEDDING_DIMENSIONS is 768."""
        from app.config import settings

        assert settings.EMBEDDING_DIMENSIONS == 768

    def test_openai_api_key_exists(self):
        """OPENAI_API_KEY setting is defined."""
        from app.config import settings

        assert hasattr(settings, "OPENAI_API_KEY")
        assert isinstance(settings.OPENAI_API_KEY, str)

    def test_existing_settings_preserved(self):
        """Legacy settings are still present after refactor."""
        from app.config import settings

        assert settings.APP_NAME == "ChatNote"
        assert settings.LLM_PROVIDER == "deepseek"
        assert hasattr(settings, "MOONSHOT_API_KEY")
        assert hasattr(settings, "SECRET_KEY")
