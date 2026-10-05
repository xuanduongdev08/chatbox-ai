"""
PostgreSQL async engine, session factory, and ORM base.

Fix applied:
  - get_db return type annotation corrected from AsyncSession (wrong, it's a
    generator) to AsyncGenerator[AsyncSession, None].
"""
from __future__ import annotations

from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

# ─── Engine ────────────────────────────────────────────────────────────────────
engine = create_async_engine(
    settings.postgres_url,
    echo=not settings.is_production,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

# ─── Session factory ───────────────────────────────────────────────────────────
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


# ─── Base model ────────────────────────────────────────────────────────────────
class Base(DeclarativeBase):
    pass


# ─── Dependency helper ─────────────────────────────────────────────────────────
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that yields an async DB session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
