"""
Sliding Window + Conversation Summary Memory Manager (Redis-backed).

Strategy:
  1. Keep the last N messages in Redis as the active window (sliding window).
  2. When the message count exceeds SUMMARY_TRIGGER_COUNT, call a lightweight
     LLM to summarize the oldest batch, store the summary, and trim Redis.
  3. The summary is prepended as a "system" context block on each request.

Fixes applied:
  - _summarizer is a module-level singleton instead of per-instance to avoid
    creating a new ChatOpenAI object on every request.
  - Consistent chain pattern: summary_prompt | LLM — result.content is correct
    since no StrOutputParser is appended (matches existing pattern).
"""
from __future__ import annotations

import json
import logging
from functools import lru_cache
from typing import Dict, List, Optional

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

from app.core.config import settings
from app.db.redis import get_redis
from app.ai_services.prompts.templates import summary_prompt

logger = logging.getLogger(__name__)

REDIS_WINDOW_KEY = "chat:window:{conv_id}"
REDIS_SUMMARY_KEY = "chat:summary:{conv_id}"
REDIS_TTL = 60 * 60 * 24 * 7  # 7 days


@lru_cache(maxsize=1)
def _get_summarizer() -> ChatOpenAI:
    """Module-level singleton for the summarizer LLM — created once, reused everywhere."""
    return ChatOpenAI(
        model=settings.openai_fallback_model,
        api_key=settings.openai_api_key,
        temperature=0,
        timeout=30,
        max_retries=1,
    )


def _msg_to_dict(msg: BaseMessage) -> Dict[str, str]:
    return {"role": msg.type, "content": str(msg.content)}


def _dict_to_msg(d: Dict[str, str]) -> BaseMessage:
    role = d["role"]
    content = d["content"]
    if role == "human":
        return HumanMessage(content=content)
    elif role == "ai":
        return AIMessage(content=content)
    else:
        return SystemMessage(content=content)


class MemoryManager:
    """Manages sliding-window + summary memory for a conversation."""

    def __init__(self, conversation_id: str):
        self.conv_id = conversation_id
        self.window_key = REDIS_WINDOW_KEY.format(conv_id=conversation_id)
        self.summary_key = REDIS_SUMMARY_KEY.format(conv_id=conversation_id)

    async def add_messages(self, messages: List[BaseMessage]) -> None:
        """Append messages to the Redis sliding window."""
        redis = await get_redis()
        pipe = redis.pipeline()
        for msg in messages:
            pipe.rpush(self.window_key, json.dumps(_msg_to_dict(msg)))
        pipe.expire(self.window_key, REDIS_TTL)
        await pipe.execute()
        await self._maybe_summarize()

    async def get_history(self) -> List[BaseMessage]:
        """Return the current sliding window as LangChain message objects."""
        redis = await get_redis()
        raw = await redis.lrange(self.window_key, 0, -1)
        messages = [_dict_to_msg(json.loads(r)) for r in raw]
        # Return only the most recent N messages
        return messages[-settings.sliding_window_size :]

    async def get_summary(self) -> Optional[str]:
        """Return the current conversation summary string if one exists."""
        redis = await get_redis()
        value = await redis.get(self.summary_key)
        # redis-py returns bytes or str depending on decode_responses setting
        if isinstance(value, bytes):
            return value.decode("utf-8")
        return value

    async def _maybe_summarize(self) -> None:
        """If window exceeds trigger count, summarize the oldest half and trim."""
        redis = await get_redis()
        count = await redis.llen(self.window_key)
        if count < settings.summary_trigger_count:
            return

        batch_size = settings.summary_trigger_count // 2
        raw_batch = await redis.lrange(self.window_key, 0, batch_size - 1)
        msgs = [_dict_to_msg(json.loads(r)) for r in raw_batch]

        history_text = "\n".join(
            f"{m.type.upper()}: {m.content}" for m in msgs
        )

        try:
            summarizer = _get_summarizer()
            chain = summary_prompt | summarizer
            result = await chain.ainvoke({"history": history_text})
            new_summary: str = result.content  # AIMessage.content — correct without StrOutputParser

            existing = await self.get_summary() or ""
            combined = (existing + "\n\n" + new_summary).strip()

            pipe = redis.pipeline()
            pipe.set(self.summary_key, combined, ex=REDIS_TTL)
            for _ in range(batch_size):
                pipe.lpop(self.window_key)
            await pipe.execute()
            logger.info(
                "Summarized %d messages for conversation %s", batch_size, self.conv_id
            )
        except Exception as exc:
            logger.error("Summarization failed for %s: %s", self.conv_id, exc)

    async def clear(self) -> None:
        """Delete all memory for this conversation."""
        redis = await get_redis()
        await redis.delete(self.window_key, self.summary_key)
