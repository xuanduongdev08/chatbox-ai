# 🤖 AI Chatbot System — Production-Ready

A full-stack AI chatbot with **streaming SSE**, **RAG (document retrieval)**, **sliding-window + summary memory**, and **agentic tool calling** (web search, SQL analytics, email).

---

## 🏗️ Architecture

```
React (Vite) ──SSE──► FastAPI ──► LangChain/LangGraph
                                      │
                          ┌───────────┼──────────────┐
                          ▼           ▼               ▼
                       Redis       PostgreSQL       Qdrant
                   (session mem)  (history/users) (vector DB)
```

## 🚀 Quick Start

### 1. Configure environment
```bash
cp .env.example .env
# Fill in OPENAI_API_KEY and other secrets
```

### 2. Start all services
```bash
docker compose up --build
```

Services:
| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| API Docs | http://localhost:8000/docs |
| Qdrant Dashboard | http://localhost:6333/dashboard |

---

## 🔑 Key Features

### 1. Streaming Chat (SSE)
- `POST /api/v1/chat/stream` — streams tokens word-by-word via Server-Sent Events
- Frontend consumes via `fetch` + `ReadableStream` in [`useSSE.js`](frontend/src/hooks/useSSE.js)

### 2. Memory Management
- **Sliding Window**: Last N messages kept in Redis
- **Summary Memory**: When window overflows, a lightweight LLM summarizes the oldest batch
- Configured via `SLIDING_WINDOW_SIZE` and `SUMMARY_TRIGGER_COUNT` env vars

### 3. RAG (Document Retrieval)
- Upload PDF, TXT, or DOCX via `POST /api/v1/documents/upload`
- Chunks indexed into **Qdrant** using `text-embedding-3-small`
- Context injected into system prompt when `enable_rag: true`

### 4. Agentic Tool Calling
- `POST /api/v1/agent/stream` — executes tools, streams thoughts + final answer
- **Tools**: Web Search (Tavily/DuckDuckGo), SQL Query (read-only), Email Sender (SMTP)

### 5. LLM Fallback
- Primary: `gpt-4o` → Fallback: `gpt-4o-mini`
- Retry with exponential backoff via `tenacity`

---

## 📁 Project Structure

```
├── docker-compose.yml
├── .env.example
├── backend/
│   ├── main.py                          # FastAPI app entrypoint
│   ├── requirements.txt
│   ├── Dockerfile
│   └── app/
│       ├── api/v1/
│       │   ├── chat.py                  # SSE chat endpoints
│       │   ├── document.py              # RAG document upload
│       │   ├── history.py               # Conversation history
│       │   └── agent.py                 # Agent execution
│       ├── core/
│       │   ├── config.py                # Pydantic Settings
│       │   └── security.py              # JWT + password hashing
│       ├── ai_services/
│       │   ├── chains.py                # Core LangChain pipeline
│       │   ├── prompts/templates.py     # Prompt templates
│       │   ├── memory/manager.py        # Redis sliding window memory
│       │   ├── rag/pipeline.py          # Qdrant RAG pipeline
│       │   └── agents/tools.py          # Web search, SQL, email tools
│       ├── db/
│       │   ├── postgres.py              # SQLAlchemy 2.0 async engine
│       │   └── redis.py                 # Redis async client
│       ├── models/models.py             # ORM: User, Conversation, Message
│       └── schemas/schemas.py           # Pydantic request/response schemas
└── frontend/
    ├── src/
    │   ├── App.jsx                      # Root component
    │   ├── components/
    │   │   ├── ChatWindow.jsx           # Real-time token rendering
    │   │   ├── MessageInput.jsx         # Input + file upload
    │   │   ├── Sidebar.jsx              # Conversation navigation
    │   │   └── AgentStatus.jsx          # Agent thought visualization
    │   ├── hooks/useSSE.js              # SSE custom hook
    │   └── services/api.js              # Axios API client
    └── Dockerfile
```

---

## 🔧 Development (without Docker)

**Backend:**
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

---

## 🌐 API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/chat/stream` | SSE streaming chat |
| `POST` | `/api/v1/chat/` | Non-streaming chat |
| `POST` | `/api/v1/documents/upload` | Upload & index document |
| `GET` | `/api/v1/history/` | List conversations |
| `GET` | `/api/v1/history/{id}` | Get conversation detail |
| `DELETE` | `/api/v1/history/{id}` | Delete conversation |
| `POST` | `/api/v1/agent/stream` | SSE agent execution |
| `GET` | `/health` | Health check |
