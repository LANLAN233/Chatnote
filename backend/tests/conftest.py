import asyncio
import os
from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import create_engine as create_sync_engine, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.database import Base, get_db
from app.main import app
from app.plugins import plugin_manager


def _build_test_db_url() -> str:
    """Build the test database URL.

    Priority:
    1. TEST_DATABASE_URL environment variable
    2. Derived from production DATABASE_URL with _test suffix
    """
    env_url = os.environ.get("TEST_DATABASE_URL")
    if env_url:
        return env_url
    prod_url = settings.DATABASE_URL
    # Replace database name: /chatnote → /chatnote_test
    # Handles formats: postgresql+asyncpg://user:pass@host:port/chatnote
    base, _, db_name = prod_url.rpartition("/")
    return f"{base}/{db_name}_test"


def _ensure_test_database():
    """Create the test database if it does not already exist.

    Connects to the 'postgres' system database (or 'template1') to issue
    CREATE DATABASE, since you cannot create a database while connected to it.
    """
    test_url = _build_test_db_url()
    # Build a URL to the 'postgres' system database by replacing the db name
    base, _, _ = test_url.rpartition("/")
    # Replace asyncpg with psycopg2 for sync admin connection
    admin_url = f"{base}/postgres".replace("+asyncpg", "+psycopg2")

    try:
        sync_engine = create_sync_engine(admin_url, isolation_level="AUTOCOMMIT")
        with sync_engine.connect() as conn:
            # Extract just the database name from the test URL
            db_name = test_url.rsplit("/", 1)[-1]
            result = conn.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :db"),
                {"db": db_name},
            )
            if result.fetchone() is None:
                conn.execute(text(f'CREATE DATABASE "{db_name}"'))
        sync_engine.dispose()
    except Exception:
        # If we can't connect to postgres, the test database might already
        # exist or PostgreSQL might not be running. Let the test session
        # attempt connection and fail with a clear error.
        pass


# Module-level setup: ensure the test database exists before any fixtures run
_ensure_test_database()

TEST_DATABASE_URL = _build_test_db_url()
test_engine = create_async_engine(TEST_DATABASE_URL, echo=False)
TestSessionLocal = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)


@pytest_asyncio.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """Create all tables for the test, yield a session, then drop all tables.

    Tables are created/dropped per-test-function to ensure total isolation.
    """
    # Enable pgvector extension (required for vector columns)
    async with test_engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await conn.run_sync(Base.metadata.create_all)

    async with TestSessionLocal() as session:
        yield session
        await session.rollback()

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """Provide an async HTTP test client with the test DB session injected."""

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    # Initialize plugin manager with test database
    await plugin_manager.scan_plugins(db_session)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def auth_token(client: AsyncClient, db_session: AsyncSession) -> str:
    """Register a test user and return a valid JWT access token."""
    response = await client.post(
        "/api/auth/register",
        json={"username": "testuser", "password": "testpass123", "display_name": "Test User"},
    )
    data = response.json()
    return data["data"]["token"]["access_token"]


@pytest_asyncio.fixture
async def auth_headers(auth_token: str) -> dict:
    """Return Authorization header dict with a valid Bearer token."""
    return {"Authorization": f"Bearer {auth_token}"}
