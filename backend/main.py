"""
FastAPI Application Entry Point
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import agent, chat, document, history
from app.core.config import settings
from app.db.postgres import engine, Base
from app.db.redis import close_redis

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown lifecycle."""
    logger.info("Starting up AI Chatbot Backend...")
    # Create all DB tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables ready.")
    
    # Seed default dev user
    from app.db.postgres import AsyncSessionLocal
    from app.models.models import User
    import uuid
    async with AsyncSessionLocal() as session:
        dev_user_id = uuid.UUID("00000000-0000-0000-0000-000000000000")
        existing_user = await session.get(User, dev_user_id)
        if not existing_user:
            dev_user = User(
                id=dev_user_id,
                email="dev@example.com",
                hashed_password="devpasswordhash",
                full_name="Local Dev User"
            )
            session.add(dev_user)
            await session.commit()
            logger.info("Default dev user created.")

    yield
    logger.info("Shutting down...")
    await close_redis()
    await engine.dispose()


app = FastAPI(
    title="AI Chatbot API",
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
)

# ─── Routers ──────────────────────────────────────────────────────────────────
API_PREFIX = "/api/v1"
app.include_router(chat.router, prefix=API_PREFIX)
app.include_router(document.router, prefix=API_PREFIX)
app.include_router(history.router, prefix=API_PREFIX)
app.include_router(agent.router, prefix=API_PREFIX)


@app.get("/health", tags=["Health"])
async def health_check():
    """Health check endpoint for container orchestration."""
    from app.db.redis import get_redis
    redis = await get_redis()
    redis_ok = await redis.ping()
    return {
        "status": "healthy",
        "version": "1.0.0",
        "services": {
            "redis": "ok" if redis_ok else "error",
            "postgres": "ok",  # If we got here, postgres is fine
        },
    }
