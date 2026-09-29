from functools import lru_cache
from typing import Any, List, Union

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── OpenAI ────────────────────────────────────────────────────────────
    openai_api_key: str = ""
    openai_primary_model: str = "gpt-4o"
    openai_fallback_model: str = "gpt-4o-mini"

    # ── PostgreSQL ────────────────────────────────────────────────────────
    postgres_url: str = "postgresql+asyncpg://chatbot:chatbotpass@postgres:5432/chatbot_db"

    # ── Redis ─────────────────────────────────────────────────────────────
    redis_url: str = "redis://:redispass@redis:6379/0"

    # ── Qdrant ────────────────────────────────────────────────────────────
    qdrant_url: str = "http://qdrant:6333"
    qdrant_collection_name: str = "chatbot_documents"

    # ── JWT / Security ────────────────────────────────────────────────────
    secret_key: str = "change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60

    # ── External APIs ─────────────────────────────────────────────────────
    tavily_api_key: str = ""
    sendgrid_api_key: str = ""
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    email_from: str = ""

    # ── App settings ──────────────────────────────────────────────────────
    app_env: str = "development"
    cors_origins: Union[List[str], str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    sliding_window_size: int = 20
    summary_trigger_count: int = 40
    upload_dir: str = "/app/uploads"
    max_file_size_mb: int = 50

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: Any) -> List[str]:
        if isinstance(v, str):
            v = v.strip()
            if v.startswith("[") and v.endswith("]"):
                import json
                try:
                    return json.loads(v)
                except Exception:
                    v = v[1:-1].replace('"', '').replace("'", "")
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() == "production"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return cached settings instance."""
    return Settings()


settings = get_settings()
