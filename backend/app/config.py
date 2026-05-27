from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "ChatNote"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = True

    DATABASE_URL: str = "postgresql+asyncpg://chatnote:changeme@localhost:6432/chatnote"

    EMBEDDING_MODEL: str = "text-embedding-3-small"
    EMBEDDING_DIMENSIONS: int = 768
    OPENAI_API_KEY: str = ""

    SECRET_KEY: str = "chatnote-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7

    CORS_ORIGINS: list[str] = ["*"]

    UPLOAD_DIR: str = "./uploads"

    # ── Deprecated legacy keys (use user-scoped keys via settings UI) ──
    LLM_PROVIDER: str = "deepseek"
    LLM_API_KEY: str = ""
    LLM_MODEL: str = "deepseek-v4-flash"
    LLM_BASE_URL: str = ""

    ENCRYPTION_KEY: str = ""

    MOONSHOT_API_KEY: str = ""

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()