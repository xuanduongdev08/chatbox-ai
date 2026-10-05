"""
Model catalogue API
GET /api/v1/models – list chat models the user can pick from (Groq).
"""
from __future__ import annotations

import logging
import time
from typing import List

import httpx
from fastapi import APIRouter, Depends

from app.api.deps import get_current_user_id
from app.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/models", tags=["Models"])

GROQ_MODELS_URL = "https://api.groq.com/openai/v1/models"
_EXCLUDE = ("whisper", "guard", "tts", "orpheus", "prompt-guard", "safeguard", "embed", "distil-whisper")
_CACHE: dict = {"ts": 0.0, "data": []}
_TTL = 600  # seconds


def _label(model_id: str) -> str:
    name = model_id.split("/")[-1]
    return name.replace("-", " ").replace("_", " ").title().replace("Gpt Oss", "GPT-OSS").replace("Llama", "Llama")


def _fallback() -> List[dict]:
    ids = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "openai/gpt-oss-120b", "openai/gpt-oss-20b"]
    return [{"id": i, "label": _label(i), "owner": i.split("/")[0] if "/" in i else "groq"} for i in ids]


async def _fetch_groq() -> List[dict]:
    if not settings.groq_api_key:
        return _fallback()
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(GROQ_MODELS_URL, headers={"Authorization": f"Bearer {settings.groq_api_key}"})
        resp.raise_for_status()
    items = []
    for m in resp.json().get("data", []):
        mid = m.get("id", "")
        if not mid or not m.get("active", True) or any(x in mid.lower() for x in _EXCLUDE):
            continue
        items.append({"id": mid, "label": _label(mid), "owner": m.get("owned_by", "groq"),
                      "context_window": m.get("context_window")})
    items.sort(key=lambda x: x["id"])
    return items or _fallback()


@router.get("/")
async def list_models(_: str = Depends(get_current_user_id)):
    now = time.time()
    if not _CACHE["data"] or now - _CACHE["ts"] > _TTL:
        try:
            _CACHE["data"] = await _fetch_groq()
            _CACHE["ts"] = now
        except Exception as exc:
            logger.warning("Could not fetch Groq models: %s", exc)
            if not _CACHE["data"]:
                _CACHE["data"] = _fallback()
    return {"default": settings.groq_model, "models": _CACHE["data"]}
