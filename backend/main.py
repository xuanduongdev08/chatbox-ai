"""
FastAPI Application Entry Point

Fix applied:
  - /health endpoint wraps Redis ping in try/except — returns {"redis": "error"}
    instead of raising an unhandled 500 when Redis is unavailable.
"""
from __future__ import annotations

import logging
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import agent, auth, chat, document, history
from app.api.v1 import models as models_api
from app.core.config import settings
from app.db.postgres import Base, engine
from app.db.redis import close_redis

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown lifecycle."""
    logger.info("Starting up DGXAI Backend…")

    # Create all DB tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Lightweight in-place migration for existing databases (create_all never alters tables)
        from sqlalchemy import text
        for stmt in (
            "ALTER TABLE users ALTER COLUMN hashed_password DROP NOT NULL",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(64)",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(512)",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(20) NOT NULL DEFAULT 'local'",
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_google_id_uq ON users (google_id)",
            "ALTER TABLE conversations ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT false",
            "ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachments TEXT",
        ):
            await conn.execute(text(stmt))
    logger.info("Database tables ready.")

    # Seed default dev user (dev environments only)
    if not settings.is_production:
        from app.db.postgres import AsyncSessionLocal
        from app.models.models import User

        async with AsyncSessionLocal() as session:
            dev_user_id = uuid.UUID("00000000-0000-0000-0000-000000000000")
            existing_user = await session.get(User, dev_user_id)
            if not existing_user:
                dev_user = User(
                    id=dev_user_id,
                    email="dev@example.com",
                    hashed_password="devpasswordhash",
                    full_name="Local Dev User",
                )
                session.add(dev_user)
                await session.commit()
                logger.info("Default dev user created.")

    yield

    logger.info("Shutting down…")
    await close_redis()
    await engine.dispose()


app = FastAPI(
    title="DGXAI API",
    description="Production-ready AI Chatbot with RAG, Memory, and Agentic Tool Calling",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ─── CORS ─────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Conversation-Id"],
)

# ─── Routers ──────────────────────────────────────────────────────────────────
API_PREFIX = "/api/v1"
app.include_router(auth.router, prefix=API_PREFIX)
app.include_router(models_api.router, prefix=API_PREFIX)
app.include_router(chat.router, prefix=API_PREFIX)
app.include_router(document.router, prefix=API_PREFIX)
app.include_router(history.router, prefix=API_PREFIX)
app.include_router(agent.router, prefix=API_PREFIX)


@app.get("/health", tags=["Health"])
async def health_check():
    """Health check endpoint for container orchestration."""
    redis_status = "error"
    postgres_status = "ok"  # If this handler runs, Postgres is up

    try:
        from app.db.redis import get_redis
        redis = await get_redis()
        pong = await redis.ping()
        redis_status = "ok" if pong else "error"
    except Exception as exc:
        logger.warning("Health check — Redis unavailable: %s", exc)
        redis_status = "error"

    overall = "healthy" if redis_status == "ok" else "degraded"

    return {
        "status": overall,
        "version": "1.0.0",
        "services": {
            "redis": redis_status,
            "postgres": postgres_status,
        },
    }
