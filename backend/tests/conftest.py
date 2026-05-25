import asyncio
from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.database import Base, get_db
from app.main import app
from app.models.models import Channel, Note, Server, User
from app.plugins import plugin_manager

# In CI/Docker, override this to point to a PostgreSQL test database.
# For local testing without PG running, consider using SQLite or a test container.
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"
test_engine = create_async_engine(TEST_DATABASE_URL, echo=False)
TestSessionLocal = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)


@pytest_asyncio.fixture
async def db_session():
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with TestSessionLocal() as session:
        yield session
        await session.rollback()

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
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
    response = await client.post(
        "/api/auth/register",
        json={"username": "testuser", "password": "testpass123", "display_name": "Test User"},
    )
    data = response.json()
    return data["data"]["token"]["access_token"]


@pytest_asyncio.fixture
async def auth_headers(auth_token: str) -> dict:
    return {"Authorization": f"Bearer {auth_token}"}