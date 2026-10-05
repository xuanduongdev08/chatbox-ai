"""
Dependency Injection helpers for FastAPI routes.
Provides DB sessions, Redis, and authenticated current user.

Fix applied:
  - Dev user fallback is now gated behind settings.is_production — in production
    mode, missing credentials raise a proper 401 instead of silently succeeding.
"""
from __future__ import annotations

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import settings
from app.core.security import decode_access_token

security = HTTPBearer(auto_error=False)


async def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> str:
    """
    Validate bearer token and return the user ID.

    - In development (is_production=False): falls back to the default dev user
      UUID when no Authorization header is provided.
    - In production (is_production=True): raises 401 when credentials are missing.
    """
    if credentials is None:
        if settings.is_production:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required",
                headers={"WWW-Authenticate": "Bearer"},
            )
        # Local dev convenience: allow requests without a token
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
