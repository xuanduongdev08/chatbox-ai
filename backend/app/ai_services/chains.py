"""
Core LangChain pipeline setup.

Provides:
  - get_chat_llm()    → Primary LLM with fallback
  - stream_chat()     → Async generator yielding SSE tokens
  - stream_agent()    → Async generator yielding agent thoughts + final answer
"""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import date
from typing import AsyncGenerator, List, Optional

from langchain.agents import AgentExecutor, create_openai_tools_agent
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.output_parsers import StrOutputParser
from langchain_openai import ChatOpenAI

from app.ai_services.agents.tools import get_tools
from app.ai_services.memory.manager import MemoryManager
from app.ai_services.prompts.templates import (
    RAG_CONTEXT_TEMPLATE,
    agent_prompt,
    chat_prompt,
)
from app.ai_services.rag.pipeline import retrieve_context
from app.core.config import settings

logger = logging.getLogger(__name__)


# ─── LLM Factory ──────────────────────────────────────────────────────────────

def get_chat_llm(streaming: bool = True, fallback: bool = False) -> ChatOpenAI:
    """
    Return an LLM instance based on configured provider.

    Provider selection (settings.llm_provider):
      "openai" → standard OpenAI API
      "groq"   → Groq cloud (free tier, OpenAI-compatible via base_url)
    """
    provider = settings.llm_provider.lower()

    if provider == "groq":
        # Groq uses OpenAI-compatible API — just swap base_url and api_key
        model = settings.groq_model
        return ChatOpenAI(
            model=model,
            api_key=settings.groq_api_key,
            base_url="https://api.groq.com/openai/v1",
            streaming=streaming,
            temperature=0.7,
            timeout=60,
            max_retries=2,
        )

    # Default: OpenAI
    model = settings.openai_fallback_model if fallback else settings.openai_primary_model
    return ChatOpenAI(
        model=model,
        api_key=settings.openai_api_key,
        streaming=streaming,
        temperature=0.7,
        timeout=60,
        max_retries=2,
    )


# ─── Streaming Chat Pipeline ──────────────────────────────────────────────────

async def stream_chat(
    conversation_id: str,
    user_message: str,
    enable_rag: bool = False,
) -> AsyncGenerator[str, None]:
    """
    Async generator that yields SSE-compatible JSON token strings.

    Yields:
        JSON strings: {"type": "token"|"done"|"error", "content": str}
    """
    memory = MemoryManager(conversation_id)
    history = await memory.get_history()
    summary = await memory.get_summary()

    # Build RAG context block
    rag_context_block = ""
    if enable_rag:
        try:
            raw_context = await retrieve_context(user_message)
            if raw_context:
                rag_context_block = RAG_CONTEXT_TEMPLATE.format(context=raw_context)
        except Exception as exc:
            logger.warning("RAG retrieval failed, continuing without context: %s", exc)

    memory_summary_block = (
        f"Previous conversation summary:\n{summary}" if summary else ""
    )

    prompt_vars = {
        "current_date": date.today().isoformat(),
        "rag_context": rag_context_block,
        "memory_summary": memory_summary_block,
        "history": history,
        "input": user_message,
    }

    llm = get_chat_llm(streaming=True)
    chain = chat_prompt | llm | StrOutputParser()

    full_response = ""
    stream_ok = False

    try:
        async for chunk in chain.astream(prompt_vars):
            full_response += chunk
            stream_ok = True
            yield json.dumps({"type": "token", "content": chunk})
    except Exception as exc:
        logger.warning("Primary model failed, falling back: %s", exc)
        # Fix: reset full_response so partial primary content is not concatenated
        full_response = ""
        try:
            llm_fallback = get_chat_llm(streaming=True, fallback=True)
            chain_fallback = chat_prompt | llm_fallback | StrOutputParser()
            async for chunk in chain_fallback.astream(prompt_vars):
                full_response += chunk
                yield json.dumps({"type": "token", "content": chunk})
        except Exception as fallback_exc:
            logger.error("Fallback model also failed: %s", fallback_exc)
            yield json.dumps({"type": "error", "content": f"AI service unavailable: {fallback_exc}"})
            return

    # Persist both turns to Redis memory
    if full_response:
        try:
            await memory.add_messages([
                HumanMessage(content=user_message),
                AIMessage(content=full_response),
            ])
        except Exception as exc:
            logger.error("Memory persistence failed: %s", exc)

    yield json.dumps({"type": "done", "content": full_response})


# ─── Agent Streaming Pipeline ─────────────────────────────────────────────────

async def stream_agent(
    conversation_id: str,
    user_message: str,
    tool_names: Optional[List[str]] = None,
) -> AsyncGenerator[str, None]:
    """
    Async generator yielding agent thoughts, tool calls, tool results,
    and the final answer as SSE JSON events.
    """
    memory = MemoryManager(conversation_id)
    history = await memory.get_history()
    tools = get_tools(tool_names)

    # Agent uses non-streaming LLM since it processes tool results before answering
    llm = get_chat_llm(streaming=False)
    agent = create_openai_tools_agent(llm=llm, tools=tools, prompt=agent_prompt)
    executor = AgentExecutor(
        agent=agent,
        tools=tools,
        verbose=False,
        max_iterations=8,
        return_intermediate_steps=True,
    )

    final_answer = ""
    try:
        result = await executor.ainvoke({
            "input": user_message,
            "history": history,
            "current_date": date.today().isoformat(),
        })

        # Emit intermediate steps first
        for action, observation in result.get("intermediate_steps", []):
            yield json.dumps({
                "type": "tool_call",
                "content": f"Using tool: **{action.tool}**\nInput: {action.tool_input}",
                "tool_name": action.tool,
            })
            await asyncio.sleep(0.05)
            yield json.dumps({
                "type": "tool_result",
                "content": str(observation)[:1000],
                "tool_name": action.tool,
            })
            await asyncio.sleep(0.05)

        # Stream final answer word-by-word for smooth UX
        final_answer = result.get("output", "")
        words = final_answer.split()
        for i, word in enumerate(words):
            sep = " " if i < len(words) - 1 else ""
            yield json.dumps({"type": "token", "content": word + sep})
            await asyncio.sleep(0.015)

        # Persist to Redis memory
        if final_answer:
            try:
                await memory.add_messages([
                    HumanMessage(content=user_message),
                    AIMessage(content=final_answer),
                ])
            except Exception as exc:
                logger.error("Agent memory persistence failed: %s", exc)

        yield json.dumps({"type": "done", "content": final_answer})

    except Exception as exc:
        logger.error("Agent execution failed: %s", exc)
        # Fix: persist an error placeholder so conversation history stays consistent
        try:
            await memory.add_messages([
                HumanMessage(content=user_message),
                AIMessage(content=f"[Agent error: {exc}]"),
            ])
        except Exception:
            pass
        yield json.dumps({"type": "error", "content": f"Agent error: {exc}"})
