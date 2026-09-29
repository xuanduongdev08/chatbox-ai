"""
Core LangChain / LangGraph pipeline setup.

Provides:
  - get_chat_llm()         → Primary LLM with fallback
  - build_chat_chain()     → Basic RAG-aware streaming chain
  - build_agent_executor() → LangGraph agent with tools
  - stream_chat()          → Async generator yielding SSE tokens
  - stream_agent()         → Async generator yielding agent thoughts + final answer
"""
from __future__ import annotations

import asyncio
import logging
from datetime import date
from typing import AsyncGenerator, List, Optional

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough
from langchain_openai import ChatOpenAI
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

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


# ─── LLM Factory with fallback ────────────────────────────────────────────────

def get_chat_llm(streaming: bool = True, fallback: bool = False) -> ChatOpenAI:
    """Return primary or fallback LLM instance."""
    model = settings.openai_fallback_model if fallback else settings.openai_primary_model
    return ChatOpenAI(
        model=model,
        api_key=settings.openai_api_key,
        streaming=streaming,
        temperature=0.7,
        request_timeout=60,
        max_retries=0,  # we handle retries via tenacity
    )


# ─── Retry decorator ─────────────────────────────────────────────────────────

def _with_retry(func):
    """Decorator: exponential backoff retry, then fallback model."""
    return retry(
        retry=retry_if_exception_type((Exception,)),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=30),
        reraise=True,
    )(func)


# ─── Streaming Chat Pipeline ──────────────────────────────────────────────────

async def stream_chat(
    conversation_id: str,
    user_message: str,
    enable_rag: bool = False,
) -> AsyncGenerator[str, None]:
    """
    Async generator that yields SSE-compatible tokens from the chat pipeline.

    Yields:
        JSON-serialisable dict strings with type and content.
    """
    import json

    memory = MemoryManager(conversation_id)
    history = await memory.get_history()
    summary = await memory.get_summary()

    # Build RAG context if enabled
    rag_context_block = ""
    if enable_rag:
        raw_context = await retrieve_context(user_message)
        if raw_context:
            rag_context_block = RAG_CONTEXT_TEMPLATE.format(context=raw_context)

    # Build memory summary block
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
    try:
        async for chunk in chain.astream(prompt_vars):
            full_response += chunk
            yield json.dumps({"type": "token", "content": chunk})
    except Exception as exc:
        logger.warning("Primary model failed, falling back: %s", exc)
        llm_fallback = get_chat_llm(streaming=True, fallback=True)
        chain_fallback = chat_prompt | llm_fallback | StrOutputParser()
        async for chunk in chain_fallback.astream(prompt_vars):
            full_response += chunk
            yield json.dumps({"type": "token", "content": chunk})

    # Persist to memory
    await memory.add_messages([
        HumanMessage(content=user_message),
        AIMessage(content=full_response),
    ])

    yield json.dumps({"type": "done", "content": full_response})


# ─── Agent Streaming Pipeline ─────────────────────────────────────────────────

async def stream_agent(
    conversation_id: str,
    user_message: str,
    tool_names: Optional[List[str]] = None,
) -> AsyncGenerator[str, None]:
    """
    Async generator that yields agent thoughts, tool calls, tool results,
    and the final answer as SSE events.
    """
    import json
    from langchain.agents import AgentExecutor, create_openai_tools_agent

    memory = MemoryManager(conversation_id)
    history = await memory.get_history()
    tools = get_tools(tool_names)

    llm = get_chat_llm(streaming=False)  # Agent doesn't stream internally
    agent = create_openai_tools_agent(llm=llm, tools=tools, prompt=agent_prompt)
    executor = AgentExecutor(
        agent=agent,
        tools=tools,
        verbose=False,
        max_iterations=8,
        return_intermediate_steps=True,
    )

    try:
        result = await executor.ainvoke({
            "input": user_message,
            "history": history,
            "current_date": date.today().isoformat(),
        })

        # Stream intermediate steps
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

        # Stream final answer word-by-word
        final_answer = result.get("output", "")
        words = final_answer.split()
        for i, word in enumerate(words):
            sep = " " if i < len(words) - 1 else ""
            yield json.dumps({"type": "token", "content": word + sep})
            await asyncio.sleep(0.015)

        # Persist to memory
        await memory.add_messages([
            HumanMessage(content=user_message),
            AIMessage(content=final_answer),
        ])

        yield json.dumps({"type": "done", "content": final_answer})

    except Exception as exc:
        logger.error("Agent execution failed: %s", exc)
        yield json.dumps({"type": "error", "content": f"Agent error: {exc}"})
