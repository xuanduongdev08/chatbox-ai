"""
Agentic Workflow Execution Endpoint.
POST /api/v1/agent/stream  – streams agent thoughts + final answer via SSE
POST /api/v1/agent/        – non-streaming agent execution

Fixes applied:
  - Assistant response is now persisted to Postgres via BackgroundTasks after
    stream ends (was never written before — caused orphan user messages in DB).
  - message_count on the Conversation is incremented for both turns.
"""
from __future__ import annotations

import json
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_services.chains import stream_agent
from app.api.deps import get_current_user_id
from app.db.postgres import AsyncSessionLocal, get_db
from app.models.models import Conversation, Message
from app.schemas.schemas import AgentRequest

router = APIRouter(prefix="/agent", tags=["Agent"])


async def _persist_assistant_message(conversation_id: str, content: str) -> None:
    """Background task: write the agent final answer to Postgres."""
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
            from sqlalchemy import select
            result = await db.execute(
                select(Conversation).where(Conversation.id == uuid.UUID(conversation_id))
            )
            conv = result.scalar_one_or_none()
            if conv is not None:
                conv.message_count = (conv.message_count or 0) + 2
            await db.commit()
        except Exception as exc:
            await db.rollback()
            import logging
            logging.getLogger(__name__).error(
                "Failed to persist agent response for %s: %s", conversation_id, exc
            )


async def _agent_sse_generator(
    conversation_id: str,
    message: str,
    tool_names: list,
    background_tasks: BackgroundTasks,
):
    """Wrap stream_agent into proper SSE format and schedule DB persistence."""
    final_content = ""
    async for chunk in stream_agent(
        conversation_id=conversation_id,
        user_message=message,
        tool_names=tool_names,
    ):
        try:
            parsed = json.loads(chunk)
            if parsed.get("type") == "done":
                final_content = parsed.get("content", "")
        except (json.JSONDecodeError, AttributeError):
            pass
        yield f"data: {chunk}\n\n"

    background_tasks.add_task(_persist_assistant_message, conversation_id, final_content)
    yield "data: [DONE]\n\n"


@router.post("/stream")
async def agent_stream(
    request: AgentRequest,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """
    Execute the agentic workflow and stream intermediate steps + final answer.
    The SSE stream contains tool_call, tool_result, token, and done events.
    """
    conv_id = str(request.conversation_id or uuid.uuid4())

    if not request.conversation_id:
        conv = Conversation(
            id=uuid.UUID(conv_id),
            user_id=uuid.UUID(user_id),
            title=request.message[:60],
            message_count=0,
        )
        db.add(conv)
        await db.flush()

    user_msg = Message(
        conversation_id=uuid.UUID(conv_id),
        role="user",
        content=request.message,
    )
    db.add(user_msg)
    await db.commit()

    return StreamingResponse(
        _agent_sse_generator(conv_id, request.message, request.tools or [], background_tasks),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "X-Conversation-Id": conv_id,
        },
    )


@router.post("/", response_model=dict)
async def agent_complete(
    request: AgentRequest,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Non-streaming agent execution. Returns full output after completion."""
    conv_id = str(request.conversation_id or uuid.uuid4())

    if not request.conversation_id:
        conv = Conversation(
            id=uuid.UUID(conv_id),
            user_id=uuid.UUID(user_id),
            title=request.message[:60],
            message_count=0,
        )
        db.add(conv)
        await db.flush()

    user_msg = Message(
        conversation_id=uuid.UUID(conv_id),
        role="user",
        content=request.message,
    )
    db.add(user_msg)
    await db.commit()

    steps = []
    final_answer = ""

    async for chunk_str in stream_agent(
        conversation_id=conv_id,
        user_message=request.message,
        tool_names=request.tools,
    ):
        try:
            data = json.loads(chunk_str)
            if data["type"] in ("tool_call", "tool_result"):
                steps.append(data)
            elif data["type"] == "done":
                final_answer = data.get("content", "")
        except (json.JSONDecodeError, KeyError):
            pass

    background_tasks.add_task(_persist_assistant_message, conv_id, final_answer)

    return {
        "conversation_id": conv_id,
        "intermediate_steps": steps,
        "response": final_answer,
    }
