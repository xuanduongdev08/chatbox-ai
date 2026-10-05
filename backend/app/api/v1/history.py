"""
Conversation History API
GET    /api/v1/history/          – List all conversations for current user
GET    /api/v1/history/{conv_id} – Get conversation with all messages
DELETE /api/v1/history/{conv_id} – Delete a conversation

Fixes applied:
  - message_count is now computed via a real SQL COUNT subquery so it always
    reflects actual DB rows, not a stale column that was never incremented.
  - list_conversations returns proper ConversationOut objects with real counts.
"""
from __future__ import annotations

import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user_id
from app.db.postgres import get_db
from app.models.models import Conversation, Message
from app.schemas.schemas import ConversationDetail, ConversationOut, ConversationUpdate

router = APIRouter(prefix="/history", tags=["History"])


@router.get("/", response_model=List[ConversationOut])
async def list_conversations(
    limit: int = 20,
    offset: int = 0,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Return paginated list of user's conversations with real message counts, newest first."""
    # Subquery: count messages per conversation
    msg_count_sq = (
        select(
            Message.conversation_id,
            func.count(Message.id).label("real_message_count"),
        )
        .group_by(Message.conversation_id)
        .subquery()
    )

    result = await db.execute(
        select(
            Conversation,
            func.coalesce(msg_count_sq.c.real_message_count, 0).label("message_count"),
        )
        .outerjoin(msg_count_sq, Conversation.id == msg_count_sq.c.conversation_id)
        .where(Conversation.user_id == uuid.UUID(user_id))
        .order_by(Conversation.pinned.desc(), Conversation.updated_at.desc())
        .limit(limit)
        .offset(offset)
    )

    rows = result.all()
    # Patch message_count onto each Conversation object before Pydantic serialises it
    convs = []
    for conv, real_count in rows:
        conv.message_count = real_count
        convs.append(conv)
    return convs


@router.get("/{conv_id}", response_model=ConversationDetail)
async def get_conversation(
    conv_id: uuid.UUID,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Return a single conversation with all its messages, ordered chronologically."""
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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )
    # Sort messages chronologically (selectinload doesn't guarantee order)
    if conv.messages:
        conv.messages.sort(key=lambda m: m.created_at)
    return conv


@router.patch("/{conv_id}", response_model=ConversationOut)
async def update_conversation(
    conv_id: uuid.UUID,
    payload: ConversationUpdate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Rename and/or pin/unpin a conversation."""
    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conv_id,
            Conversation.user_id == uuid.UUID(user_id),
        )
    )
    conv = result.scalar_one_or_none()
    if conv is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    if payload.title is not None:
        conv.title = payload.title.strip()
    if payload.pinned is not None:
        conv.pinned = payload.pinned
    await db.commit()
    await db.refresh(conv)
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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )

    await db.delete(conv)
    await db.commit()

    # Clear Redis memory for this conversation
    from app.ai_services.memory.manager import MemoryManager
    mem = MemoryManager(str(conv_id))
    await mem.clear()
