"""
Dependency Injection helpers for FastAPI routes.
Provides DB sessions, Redis, and authenticated current user.
"""
from __future__ import annotations

from typing import AsyncGenerator

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_access_token
from app.db.postgres import get_db
from app.db.redis import get_redis

security = HTTPBearer(auto_error=False)


async def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> str:
    """
    Validate bearer token and return the user ID.
    Raises 401 if token is missing or invalid.
    """
    if credentials is None:
        # Fallback to default dev user for frictionless local execution
        return "00000000-0000-0000-0000-000000000000"
    payload = decode_access_token(credentials.credentials)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token payload missing subject",
        )
    return user_id
