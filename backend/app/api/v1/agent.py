"""
Agentic Workflow Execution Endpoint.
POST /api/v1/agent/stream  – streams agent thoughts + final answer via SSE
POST /api/v1/agent/        – non-streaming agent execution
"""
from __future__ import annotations

import json
import uuid

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_services.chains import stream_agent
from app.api.deps import get_current_user_id
from app.db.postgres import get_db
from app.models.models import Conversation, Message
from app.schemas.schemas import AgentRequest

router = APIRouter(prefix="/agent", tags=["Agent"])


async def _agent_sse_generator(
    conversation_id: str,
    message: str,
    tool_names: list,
):
    """Wrap stream_agent into proper SSE format."""
    async for chunk in stream_agent(
        conversation_id=conversation_id,
        user_message=message,
        tool_names=tool_names,
    ):
        yield f"data: {chunk}\n\n"
    yield "data: [DONE]\n\n"


@router.post("/stream")
async def agent_stream(
    request: AgentRequest,
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
        _agent_sse_generator(conv_id, request.message, request.tools),
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
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Non-streaming agent execution. Returns full output after completion."""
    conv_id = str(request.conversation_id or uuid.uuid4())
    steps = []
    final_answer = ""

    async for chunk_str in stream_agent(
        conversation_id=conv_id,
        user_message=request.message,
        tool_names=request.tools,
    ):
        data = json.loads(chunk_str)
        if data["type"] in ("tool_call", "tool_result"):
            steps.append(data)
        elif data["type"] == "done":
            final_answer = data["content"]

    return {
        "conversation_id": conv_id,
        "intermediate_steps": steps,
        "response": final_answer,
    }
