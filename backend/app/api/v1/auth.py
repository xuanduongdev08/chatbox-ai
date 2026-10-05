"""
Authentication API
POST /api/v1/auth/register – create account with email + password
POST /api/v1/auth/login    – email + password login
POST /api/v1/auth/google   – sign in / sign up with a Google ID token
GET  /api/v1/auth/me       – current user profile
GET  /api/v1/auth/config   – public auth config (Google client id)
"""
from __future__ import annotations

import logging
import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.core.config import settings
from app.core.security import create_access_token, hash_password, verify_password
from app.db.postgres import get_db
from app.models.models import User
from app.schemas.schemas import GoogleLogin, Token, UserCreate, UserLogin, UserOut

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["Auth"])

GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"


def _issue_token(user: User) -> Token:
    token = create_access_token({"sub": str(user.id), "email": user.email})
    return Token(access_token=token, user=UserOut.model_validate(user))


@router.get("/config")
async def auth_config():
    """Public config used by the login page."""
    return {"google_client_id": settings.google_client_id or None}


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
async def register(payload: UserCreate, db: AsyncSession = Depends(get_db)):
    email = payload.email.lower()
    existing = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Email đã được đăng ký")

    user = User(
        id=uuid.uuid4(),
        email=email,
        hashed_password=hash_password(payload.password),
        full_name=(payload.full_name or email.split("@")[0]).strip(),
        auth_provider="local",
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return _issue_token(user)


@router.post("/login", response_model=Token)
async def login(payload: UserLogin, db: AsyncSession = Depends(get_db)):
    email = payload.email.lower()
    user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()

    if user is None or not user.hashed_password:
        # Google-only accounts have no password
        detail = (
            "Tài khoản này đăng ký bằng Google, hãy chọn 'Đăng nhập với Google'"
            if user is not None and user.google_id
            else "Email hoặc mật khẩu không đúng"
        )
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail=detail)

    if not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Email hoặc mật khẩu không đúng")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Tài khoản đã bị vô hiệu hoá")
    return _issue_token(user)


@router.post("/google", response_model=Token)
async def google_login(payload: GoogleLogin, db: AsyncSession = Depends(get_db)):
    if not settings.google_client_id:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Đăng nhập Google chưa được cấu hình (thiếu GOOGLE_CLIENT_ID)",
        )

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(GOOGLE_TOKENINFO_URL, params={"id_token": payload.credential})
    except httpx.HTTPError as exc:
        logger.error("Google tokeninfo request failed: %s", exc)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail="Không thể kết nối tới Google")

    if resp.status_code != 200:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Google token không hợp lệ")

    info = resp.json()
    if info.get("aud") != settings.google_client_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Google token sai client")
    if str(info.get("email_verified")).lower() != "true":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Email Google chưa được xác minh")

    google_id = info["sub"]
    email = info["email"].lower()

    user = (await db.execute(select(User).where(User.google_id == google_id))).scalar_one_or_none()
    if user is None:
        # Link to an existing local account with same email, otherwise create
        user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
        if user is None:
            user = User(
                id=uuid.uuid4(),
                email=email,
                hashed_password=None,
                full_name=info.get("name") or email.split("@")[0],
                google_id=google_id,
                avatar_url=info.get("picture"),
                auth_provider="google",
            )
            db.add(user)
        else:
            user.google_id = google_id
            user.avatar_url = user.avatar_url or info.get("picture")
    else:
        user.avatar_url = info.get("picture") or user.avatar_url

    await db.commit()
    await db.refresh(user)
    return _issue_token(user)


@router.get("/me", response_model=UserOut)
async def me(user_id: str = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    user = await db.get(User, uuid.UUID(user_id))
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Người dùng không tồn tại")
    return user
