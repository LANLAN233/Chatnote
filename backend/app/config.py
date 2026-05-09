from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "ChatNote"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = True

    DATABASE_URL: str = "sqlite+aiosqlite:///./chatnote.db"

    SECRET_KEY: str = "chatnote-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7

    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    UPLOAD_DIR: str = "./uploads"

    LLM_PROVIDER: str = "deepseek"
    LLM_API_KEY: str = ""
    LLM_MODEL: str = "deepseek-chat"
    LLM_BASE_URL: str = ""

    ENCRYPTION_KEY: str = ""

    MOONSHOT_API_KEY: str = ""

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()