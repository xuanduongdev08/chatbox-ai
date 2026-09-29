"""
Conversation History API
GET  /api/v1/history/              – List all conversations for current user
GET  /api/v1/history/{conv_id}     – Get conversation with all messages
DELETE /api/v1/history/{conv_id}   – Delete a conversation
"""
from __future__ import annotations

import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user_id
from app.db.postgres import get_db
from app.models.models import Conversation, Message
from app.schemas.schemas import ConversationDetail, ConversationOut

router = APIRouter(prefix="/history", tags=["History"])


@router.get("/", response_model=List[ConversationOut])
async def list_conversations(
    limit: int = 20,
    offset: int = 0,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Return paginated list of user's conversations, newest first."""
    result = await db.execute(
        select(Conversation)
        .where(Conversation.user_id == uuid.UUID(user_id))
        .order_by(Conversation.updated_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return result.scalars().all()


@router.get("/{conv_id}", response_model=ConversationDetail)
async def get_conversation(
    conv_id: uuid.UUID,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Return a single conversation with all its messages."""
    result = await db.execute(
        select(Conversation)
        .options(selectinload(Conversation.messages))
        .where(
            Conversation.id == conv_id,
            Conversation.user_id == uuid.UUID(user_id),
        )
    )
    conv = result.scalar_one_or_none()
    if conv is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    return conv


@router.delete("/{conv_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    conv_id: uuid.UUID,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Delete a conversation and all its messages. Also clears Redis memory."""
    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conv_id,
            Conversation.user_id == uuid.UUID(user_id),
        )
    )
    conv = result.scalar_one_or_none()
    if conv is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    await db.delete(conv)
    await db.commit()

    # Clear Redis memory for this conversation
    from app.ai_services.memory.manager import MemoryManager
    mem = MemoryManager(str(conv_id))
    await mem.clear()
