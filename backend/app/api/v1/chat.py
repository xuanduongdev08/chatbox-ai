"""
SSE Streaming Chat Endpoint
POST /api/v1/chat/stream  – streams tokens via Server-Sent Events
POST /api/v1/chat/        – non-streaming single-turn chat
"""
from __future__ import annotations

import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_services.chains import stream_chat
from app.api.deps import get_current_user_id
from app.db.postgres import get_db
from app.models.models import Conversation, Message
from app.schemas.schemas import ChatRequest, ConversationOut

router = APIRouter(prefix="/chat", tags=["Chat"])


async def _sse_generator(conversation_id: str, message: str, enable_rag: bool):
    """Wrap stream_chat into proper SSE format."""
    async for chunk in stream_chat(
        conversation_id=conversation_id,
        user_message=message,
        enable_rag=enable_rag,
    ):
        yield f"data: {chunk}\n\n"
    yield "data: [DONE]\n\n"


@router.post("/stream")
async def chat_stream(
    request: ChatRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """
    Stream chat response as Server-Sent Events (SSE).
    Creates a new conversation if conversation_id is not provided.
    """
    # Resolve or create conversation
    conv_id = str(request.conversation_id or uuid.uuid4())
    if not request.conversation_id:
        conv = Conversation(
            id=uuid.UUID(conv_id),
            user_id=uuid.UUID(user_id),
            title=request.message[:60],
        )
        db.add(conv)
        await db.flush()

    # Persist user message
    user_msg = Message(
        conversation_id=uuid.UUID(conv_id),
        role="user",
        content=request.message,
    )
    db.add(user_msg)
    await db.commit()

    return StreamingResponse(
        _sse_generator(conv_id, request.message, request.enable_rag),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "X-Conversation-Id": conv_id,
        },
    )


@router.post("/", response_model=dict)
async def chat_complete(
    request: ChatRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """
    Non-streaming single-turn chat. Returns the full response at once.
    Useful for automated pipelines or testing.
    """
    conv_id = str(request.conversation_id or uuid.uuid4())

    full_response = ""
    async for chunk_str in stream_chat(
        conversation_id=conv_id,
        user_message=request.message,
        enable_rag=request.enable_rag,
    ):
        data = json.loads(chunk_str)
        if data["type"] == "done":
            full_response = data["content"]
            break

    return {
        "conversation_id": conv_id,
        "response": full_response,
    }
