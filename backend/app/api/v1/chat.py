"""
SSE Streaming Chat Endpoint
POST /api/v1/chat/stream  – streams tokens via Server-Sent Events
POST /api/v1/chat/        – non-streaming single-turn chat

Fixes applied:
  - Assistant response is now persisted to Postgres via BackgroundTasks after
    the stream completes, so GET /history returns full conversation turns.
  - message_count on the Conversation is incremented for both user + assistant.
"""
from __future__ import annotations

import json
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_services.chains import stream_chat
from app.api.deps import get_current_user_id
from app.db.postgres import AsyncSessionLocal, get_db
from app.models.models import Conversation, Message
from app.schemas.schemas import ChatRequest

router = APIRouter(prefix="/chat", tags=["Chat"])


async def _persist_assistant_message(conversation_id: str, content: str) -> None:
    """Background task: write the assistant reply to Postgres and bump message_count."""
    if not content:
        return
    async with AsyncSessionLocal() as db:
        try:
            msg = Message(
                conversation_id=uuid.UUID(conversation_id),
                role="assistant",
                content=content,
            )
            db.add(msg)
            # Increment message_count on parent conversation
            from sqlalchemy import select
            result = await db.execute(
                select(Conversation).where(Conversation.id == uuid.UUID(conversation_id))
            )
            conv = result.scalar_one_or_none()
            if conv is not None:
                conv.message_count = (conv.message_count or 0) + 2  # +1 user, +1 assistant
            await db.commit()
        except Exception as exc:
            await db.rollback()
            import logging
            logging.getLogger(__name__).error(
                "Failed to persist assistant message for %s: %s", conversation_id, exc
            )


async def _sse_generator(
    conversation_id: str,
    message: str,
    enable_rag: bool,
    background_tasks: BackgroundTasks,
    model: str | None = None,
):
    """Wrap stream_chat into proper SSE format and schedule DB persistence."""
    final_content = ""
    async for chunk in stream_chat(
        conversation_id=conversation_id,
        user_message=message,
        enable_rag=enable_rag,
        model=model,
    ):
        # Capture the final full response from the `done` event
        try:
            parsed = json.loads(chunk)
            if parsed.get("type") == "done":
                final_content = parsed.get("content", "")
        except (json.JSONDecodeError, AttributeError):
            pass
        yield f"data: {chunk}\n\n"

    # Persist assistant message after stream ends
    background_tasks.add_task(_persist_assistant_message, conversation_id, final_content)
    yield "data: [DONE]\n\n"


@router.post("/stream")
async def chat_stream(
    request: ChatRequest,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """
    Stream chat response as Server-Sent Events (SSE).
    Creates a new conversation if conversation_id is not provided.
    """
    conv_id = str(request.conversation_id or uuid.uuid4())

    title_text = request.message.strip() or (request.attachments and request.attachments[0].get("name")) or "Cuộc trò chuyện mới"

    if not request.conversation_id:
        conv = Conversation(
            id=uuid.UUID(conv_id),
            user_id=uuid.UUID(user_id),
            title=title_text[:60],
            message_count=0,
        )
        db.add(conv)
        await db.flush()

    user_msg_content = request.message
    if not user_msg_content and request.attachments:
        names = ", ".join([a.get("name", "tệp") for a in request.attachments])
        user_msg_content = f"Tệp đính kèm: {names}"

    # Persist user message immediately (before streaming)
    user_msg = Message(
        conversation_id=uuid.UUID(conv_id),
        role="user",
        content=user_msg_content,
        attachments=json.dumps(request.attachments) if request.attachments else None,
    )
    db.add(user_msg)
    await db.commit()

    prompt_message = request.message
    if request.attachments:
        notes = ", ".join([a.get("name", "tệp") for a in request.attachments])
        if prompt_message:
            prompt_message = f"[Tài liệu/Hình ảnh đính kèm: {notes}]\n{prompt_message}"
        else:
            prompt_message = f"[Tài liệu/Hình ảnh đính kèm: {notes}] Hãy phân tích nội dung tệp này."

    return StreamingResponse(
        _sse_generator(conv_id, prompt_message, request.enable_rag, background_tasks, request.model),
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
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """
    Non-streaming single-turn chat. Returns the full response at once.
    Useful for automated pipelines or testing.
    """
    conv_id = str(request.conversation_id or uuid.uuid4())

    title_text = request.message.strip() or (request.attachments and request.attachments[0].get("name")) or "Cuộc trò chuyện mới"

    if not request.conversation_id:
        conv = Conversation(
            id=uuid.UUID(conv_id),
            user_id=uuid.UUID(user_id),
            title=title_text[:60],
            message_count=0,
        )
        db.add(conv)
        await db.flush()

    user_msg_content = request.message
    if not user_msg_content and request.attachments:
        names = ", ".join([a.get("name", "tệp") for a in request.attachments])
        user_msg_content = f"Tệp đính kèm: {names}"

    user_msg = Message(
        conversation_id=uuid.UUID(conv_id),
        role="user",
        content=user_msg_content,
        attachments=json.dumps(request.attachments) if request.attachments else None,
    )
    db.add(user_msg)
    await db.commit()

    prompt_message = request.message
    if request.attachments:
        notes = ", ".join([a.get("name", "tệp") for a in request.attachments])
        if prompt_message:
            prompt_message = f"[Tài liệu/Hình ảnh đính kèm: {notes}]\n{prompt_message}"
        else:
            prompt_message = f"[Tài liệu/Hình ảnh đính kèm: {notes}] Hãy phân tích nội dung tệp này."

    full_response = ""
    async for chunk_str in stream_chat(
        conversation_id=conv_id,
        user_message=prompt_message,
        enable_rag=request.enable_rag,
        model=request.model,
    ):
        try:
            data = json.loads(chunk_str)
            if data.get("type") == "done":
                full_response = data.get("content", "")
        except (json.JSONDecodeError, AttributeError):
            pass

    background_tasks.add_task(_persist_assistant_message, conv_id, full_response)

    return {
        "conversation_id": conv_id,
        "response": full_response,
    }
