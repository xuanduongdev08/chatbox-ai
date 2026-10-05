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
    avatar_url: Optional[str] = None
    auth_provider: str = "local"
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)


class GoogleLogin(BaseModel):
    credential: str  # Google ID token (JWT) from Google Identity Services


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: Optional[UserOut] = None


class TokenData(BaseModel):
    user_id: Optional[str] = None


class ConversationUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    pinned: Optional[bool] = None


# ─── Chat Schemas ──────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    conversation_id: Optional[uuid.UUID] = None
    message: str = Field(default="", max_length=8000)
    enable_rag: bool = False
    enable_agent: bool = False
    model: Optional[str] = None
    attachments: Optional[List[dict]] = None


class MessageOut(BaseModel):
    id: uuid.UUID
    role: Literal["user", "assistant", "system", "tool"]
    content: str
    attachments: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ─── Conversation Schemas ──────────────────────────────────────────────────────

class ConversationOut(BaseModel):
    id: uuid.UUID
    title: Optional[str] = None
    pinned: bool = False
    message_count: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ConversationDetail(ConversationOut):
    messages: List[MessageOut] = []


# ─── Document Schemas ──────────────────────────────────────────────────────────

class DocumentUploadResponse(BaseModel):
    filename: str
    safe_name: Optional[str] = None
    file_type: str = "document"  # "document" | "image"
    url: Optional[str] = None
    chunk_count: int = 0
    collection: str
    message: str


# ─── Agent Schemas ─────────────────────────────────────────────────────────────

class AgentRequest(BaseModel):
    conversation_id: Optional[uuid.UUID] = None
    message: str = Field(min_length=1, max_length=8000)
    tools: List[str] = Field(default_factory=lambda: ["web_search", "sql_query", "email_sender"])
    model: Optional[str] = None


class AgentThought(BaseModel):
    type: Literal["thought", "tool_call", "tool_result", "final_answer"]
    content: str
    tool_name: Optional[str] = None


# ─── Generic Response ──────────────────────────────────────────────────────────

class HealthCheck(BaseModel):
    status: str
    version: str
    services: dict
