"""
System & Agent Prompt Templates
"""
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

# ─── Base Chat Prompt ──────────────────────────────────────────────────────────
CHAT_SYSTEM_TEMPLATE = """You are a helpful, concise, and knowledgeable AI assistant.
Today's date: {current_date}.

{rag_context}

{memory_summary}

Always respond clearly and directly. If you don't know something, say so honestly."""

chat_prompt = ChatPromptTemplate.from_messages([
    ("system", CHAT_SYSTEM_TEMPLATE),
    MessagesPlaceholder(variable_name="history"),
    ("human", "{input}"),
])

# ─── RAG Prompt ───────────────────────────────────────────────────────────────
RAG_CONTEXT_TEMPLATE = """Use the following retrieved document context to answer the user's question.
If the context is not relevant, answer from your general knowledge but state so.

--- RETRIEVED CONTEXT ---
{context}
--- END CONTEXT ---"""

# ─── Summary Prompt ───────────────────────────────────────────────────────────
SUMMARY_SYSTEM_PROMPT = """Summarize the following conversation history concisely, 
preserving key facts, decisions, and context that would be needed to continue the conversation.
Keep the summary under 300 words."""

summary_prompt = ChatPromptTemplate.from_messages([
    ("system", SUMMARY_SYSTEM_PROMPT),
    ("human", "Conversation history to summarize:\n\n{history}"),
])

# ─── Agent Prompt ─────────────────────────────────────────────────────────────
AGENT_SYSTEM_TEMPLATE = """You are a powerful AI assistant with access to tools. 
Use them when needed to provide accurate, up-to-date answers.
Today's date: {current_date}.

Available tools:
- web_search: Search the web for current information
- sql_query: Query the analytics database (read-only)
- email_sender: Send email notifications or summaries

Think step-by-step. When using a tool, explain what you're doing and why."""

agent_prompt = ChatPromptTemplate.from_messages([
    ("system", AGENT_SYSTEM_TEMPLATE),
    MessagesPlaceholder(variable_name="history"),
    ("human", "{input}"),
    MessagesPlaceholder(variable_name="agent_scratchpad"),
])
