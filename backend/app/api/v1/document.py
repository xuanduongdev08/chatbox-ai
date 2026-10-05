"""
Document & Image Upload & Ingestion Endpoint for DGXAI.
Supports PDF, TXT, DOCX, DOC and all standard Image formats (PNG, JPG, WEBP, GIF, SVG).
POST /api/v1/documents/upload
GET  /api/v1/documents/file/{filename}
"""
from __future__ import annotations

import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse

from app.ai_services.rag.pipeline import ingest_document
from app.api.deps import get_current_user_id
from app.core.config import settings
from app.schemas.schemas import DocumentUploadResponse

router = APIRouter(prefix="/documents", tags=["Documents"])

DOCUMENT_EXTENSIONS = {".pdf", ".txt", ".docx", ".doc", ".md", ".csv", ".json"}
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".svg", ".ico", ".tiff"}
ALLOWED_EXTENSIONS = DOCUMENT_EXTENSIONS | IMAGE_EXTENSIONS


@router.post("/upload", response_model=DocumentUploadResponse)
async def upload_document(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
):
    """
    Upload a document (PDF, TXT, DOCX, MD, CSV, JSON) or image (PNG, JPG, WEBP, etc.).
    - Documents are indexed into Qdrant for RAG.
    - Images are stored safely with NO file size limits and made available for chat preview and context.
    Streams directly to disk with unlimited capacity.
    """
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Định dạng tệp '{ext}' không được hỗ trợ. Các định dạng cho phép: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    is_image = ext in IMAGE_EXTENSIONS
    file_type = "image" if is_image else "document"

    # Images have NO file size limit; documents have generous 2GB limit (or none if max_file_size_mb <= 0)
    max_mb = settings.max_file_size_mb
    max_bytes = None if is_image else (max_mb * 1024 * 1024 if max_mb > 0 else None)

    # Prepare safe upload path
    os.makedirs(settings.upload_dir, exist_ok=True)
    safe_name = f"{uuid.uuid4().hex}_{file.filename}"
    file_path = os.path.join(settings.upload_dir, safe_name)

    # Stream write in 1MB chunks to safely handle arbitrarily large files
    total_bytes = 0
    try:
        with open(file_path, "wb") as f:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                total_bytes += len(chunk)
                if max_bytes and total_bytes > max_bytes:
                    f.close()
                    if os.path.exists(file_path):
                        os.remove(file_path)
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail=f"Dung lượng tệp vượt quá giới hạn cho phép ({max_mb} MB).",
                    )
                f.write(chunk)
    except HTTPException:
        raise
    except Exception as exc:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi khi lưu tệp: {exc}",
        )

    file_url = f"/api/v1/documents/file/{safe_name}"

    # If it is an image, we don't need text splitting into Qdrant (unless OCR is added)
    if is_image:
        return DocumentUploadResponse(
            filename=file.filename or safe_name,
            safe_name=safe_name,
            file_type="image",
            url=file_url,
            chunk_count=0,
            collection=settings.qdrant_collection_name,
            message=f"Đã tải lên hình ảnh '{file.filename}' thành công.",
        )

    # If it is a document, ingest into Qdrant for RAG
    try:
        chunk_count = await ingest_document(
            file_path=file_path,
            source_name=file.filename or safe_name,
        )
    except Exception as exc:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Xử lý và lập chỉ mục tài liệu thất bại: {exc}",
        )

    return DocumentUploadResponse(
        filename=file.filename or safe_name,
        safe_name=safe_name,
        file_type="document",
        url=file_url,
        chunk_count=chunk_count,
        collection=settings.qdrant_collection_name,
        message=f"Đã lập chỉ mục thành công {chunk_count} đoạn từ '{file.filename}'.",
    )


@router.get("/file/{filename}")
async def get_uploaded_file(filename: str):
    """Serve uploaded file or image directly for preview and download."""
    # Prevent directory traversal
    clean_name = os.path.basename(filename)
    file_path = os.path.join(settings.upload_dir, clean_name)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Tệp không tồn tại")
    return FileResponse(file_path)


@router.get("/health")
async def documents_health(user_id: str = Depends(get_current_user_id)):
    """Check that the vector DB collection is accessible."""
    from app.ai_services.rag.pipeline import _get_async_qdrant_client, _ensure_collection
    try:
        client = _get_async_qdrant_client()
        await _ensure_collection(client)
        await client.close()
        return {"status": "ok", "collection": settings.qdrant_collection_name}
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc))
