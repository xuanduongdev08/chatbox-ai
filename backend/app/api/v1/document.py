"""
Document Upload & Ingestion Endpoint for RAG.
Supports PDF, TXT, and DOCX files.
POST /api/v1/documents/upload
"""
from __future__ import annotations

import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.ai_services.rag.pipeline import ingest_document
from app.api.deps import get_current_user_id
from app.core.config import settings
from app.schemas.schemas import DocumentUploadResponse

router = APIRouter(prefix="/documents", tags=["Documents"])

ALLOWED_EXTENSIONS = {".pdf", ".txt", ".docx", ".doc"}
MAX_FILE_BYTES = settings.max_file_size_mb * 1024 * 1024


@router.post("/upload", response_model=DocumentUploadResponse)
async def upload_document(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
):
    """
    Upload a PDF, TXT, or DOCX document to be processed and indexed into
    the vector database for RAG retrieval.
    """
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported file type '{ext}'. Allowed: {ALLOWED_EXTENSIONS}",
        )

    # Read and validate file size
    content = await file.read()
    if len(content) > MAX_FILE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum size of {settings.max_file_size_mb} MB",
        )

    # Save to upload directory
    os.makedirs(settings.upload_dir, exist_ok=True)
    safe_name = f"{uuid.uuid4().hex}_{file.filename}"
    file_path = os.path.join(settings.upload_dir, safe_name)

    with open(file_path, "wb") as f:
        f.write(content)

    # Ingest into vector DB
    try:
        chunk_count = await ingest_document(
            file_path=file_path,
            source_name=file.filename or safe_name,
        )
    except Exception as exc:
        os.remove(file_path)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Document ingestion failed: {exc}",
        )

    return DocumentUploadResponse(
        filename=file.filename or safe_name,
        chunk_count=chunk_count,
        collection=settings.qdrant_collection_name,
        message=f"Successfully indexed {chunk_count} chunks into '{settings.qdrant_collection_name}'.",
    )


@router.get("/health")
async def documents_health(user_id: str = Depends(get_current_user_id)):
    """Check that the vector DB collection is accessible."""
    from app.ai_services.rag.pipeline import _get_qdrant_client, _ensure_collection
    try:
        client = _get_qdrant_client()
        _ensure_collection(client)
        return {"status": "ok", "collection": settings.qdrant_collection_name}
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc))
