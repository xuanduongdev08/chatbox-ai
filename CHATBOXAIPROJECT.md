# Role & Objective
You are an expert Principal Full-Stack AI Engineer. Your task is to scaffold and implement a production-ready, modular, and extensible AI Chatbot System that supports **Basic Conversational Memory**, **RAG (Retrieval-Augmented Generation)**, and **Agentic Tool Calling**.

---

# Architecture & Tech Stack

## Tech Stack
- **Backend Framework:** Python 3.11+, FastAPI (with `asyncio` & `EventSourceResponse` for Server-Sent Events - SSE).
- **AI Orchestrator:** LangChain / LangGraph.
- **LLM Provider:** OpenAI API (`gpt-4o` / `gpt-4o-mini`) with dynamic fallback handling.
- **Vector Database:** Qdrant or ChromaDB (via Docker).
- **Relational DB & Cache:** PostgreSQL (persisting long-term history & metadata) + Redis (caching active sessions & sliding-window buffer memory).
- **Frontend:** React.js / Next.js + Tailwind CSS (with SSE handling using Custom Hooks or `@microsoft/fetch-event-source`).
- **Containerization:** Docker & Docker Compose.

---

# Project File Structure

Scaffold the repository according to the following layout:

```text
ai-chatbot-project/
├── docker-compose.yml
├── .env.example
├── README.md
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── v1/
│   │   │   │   ├── chat.py         # SSE Streaming Chat Endpoints
│   │   │   │   ├── document.py     # Document Upload & Ingestion Endpoint for RAG
│   │   │   │   ├── history.py      # Conversation History APIs
│   │   │   │   └── agent.py        # Agentic Workflow Execution Endpoint
│   │   │   └── deps.py             # Dependency Injection (DB sessions, auth, service singletons)
│   │   ├── core/
│   │   │   ├── config.py           # Pydantic BaseSettings loading environment variables
│   │   │   └── security.py         # JWT and password hashing utilities
│   │   ├── ai_services/
│   │   │   ├── prompts/            # System & Agent Prompt Templates
│   │   │   ├── memory/             # Sliding Window & Conversation Summary Memory Managers
│   │   │   ├── rag/                # Loaders, Splitters, Embeddings, Vector Store Retriever
│   │   │   ├── agents/             # Tool Definitions (Web Search, SQL Query, Email Sender)
│   │   │   └── chains.py           # LangChain / LangGraph Runnable Pipeline Setup
│   │   ├── db/
│   │   │   ├── postgres.py         # SQLAlchemy 2.0 Async Session Engine
│   │   │   └── redis.py            # Redis Async Client Initialization
│   │   ├── models/                 # SQLAlchemy ORM Models (User, Conversation, Message)
│   │   └── schemas/                # Pydantic Schemas for Requests & Responses
│   ├── main.py                     # Entry point for FastAPI app
│   ├── requirements.txt
│   └── Dockerfile
└── frontend/
    ├── src/
    │   ├── components/
    │   │   ├── ChatWindow.jsx      # Chat UI with Real-time Token Rendering
    │   │   ├── MessageInput.jsx    # Text & File Attachment Input Component
    │   │   ├── Sidebar.jsx         # Chat Session History Navigation
    │   │   └── AgentStatus.jsx     # Visual indicator for Agent Tool execution steps
    │   ├── hooks/
    │   │   └── useSSE.js           # Custom Hook for EventSource / SSE connection
    │   ├── services/
    │   │   └── api.js              # Axios / Fetch client instance
    │   └── App.jsx
    ├── package.json
    ├── Dockerfile
    └── .env