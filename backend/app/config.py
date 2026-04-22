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

    LLM_PROVIDER: str = "zhipu"
    LLM_API_KEY: str = "a85689a74b514677b7068397e1f0df96.iyKySHTSMFZFYWMQ"
    LLM_MODEL: str = "glm-4"
    LLM_BASE_URL: str = ""

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()