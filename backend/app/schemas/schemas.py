from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, EmailStr, Field


# ─── Auth Schemas ──────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: Optional[str] = None


class UserOut(BaseModel):
    id: uuid.UUID
    email: str
    full_name: Optional[str] = None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    user_id: Optional[str] = None


# ─── Chat Schemas ──────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    conversation_id: Optional[uuid.UUID] = None
    message: str = Field(min_length=1, max_length=8000)
    enable_rag: bool = False
    enable_agent: bool = False


class MessageOut(BaseModel):
    id: uuid.UUID
    role: Literal["user", "assistant", "system", "tool"]
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ─── Conversation Schemas ──────────────────────────────────────────────────────

class ConversationOut(BaseModel):
    id: uuid.UUID
    title: Optional[str] = None
    message_count: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ConversationDetail(ConversationOut):
    messages: List[MessageOut] = []


# ─── Document Schemas ──────────────────────────────────────────────────────────

class DocumentUploadResponse(BaseModel):
    filename: str
    chunk_count: int
    collection: str
    message: str


# ─── Agent Schemas ─────────────────────────────────────────────────────────────

class AgentRequest(BaseModel):
    conversation_id: Optional[uuid.UUID] = None
    message: str = Field(min_length=1, max_length=8000)
    tools: List[str] = Field(default_factory=lambda: ["web_search", "sql_query", "email_sender"])


class AgentThought(BaseModel):
    type: Literal["thought", "tool_call", "tool_result", "final_answer"]
    content: str
    tool_name: Optional[str] = None


# ─── Generic Response ──────────────────────────────────────────────────────────

class HealthCheck(BaseModel):
    status: str
    version: str
    services: dict
