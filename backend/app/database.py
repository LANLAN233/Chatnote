from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

# PostgreSQL connection pool configuration
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    pool_recycle=3600,
)

async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def init_db():
    """Initialize PostgreSQL with pgvector extension and create all tables."""
    async with engine.begin() as conn:
        # Create pgvector extension first (required before vector columns)
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        # Create all tables from SQLAlchemy metadata
        await conn.run_sync(Base.metadata.create_all)
