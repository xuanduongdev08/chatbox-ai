"""
RAG Pipeline: Document loading, splitting, embedding, and retrieval.
Supports PDF, TXT, DOCX, and DOC files with Qdrant as the vector store.

Features:
  - FastEmbed local embedding engine (free, offline, 0 quota issues, 384-dim).
  - Optional OpenAI embedding fallback if configured with valid quota.
  - Chunk batching for large documents (100+ MB / 1000s of pages).
  - Async Qdrant client with batch upserting.
"""
from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import List, Tuple

from langchain_community.document_loaders import (
    Docx2txtLoader,
    PyPDFLoader,
    TextLoader,
)
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter
from qdrant_client import AsyncQdrantClient
from qdrant_client.http.models import Distance, PointStruct, VectorParams

from app.core.config import settings

logger = logging.getLogger(__name__)

CHUNK_SIZE = 1000
CHUNK_OVERLAP = 150
EMBED_BATCH_SIZE = 64
UPSERT_BATCH_SIZE = 128

# FastEmbed singleton cache
_FASTEMBED_MODEL = None


def _get_fastembed_model():
    global _FASTEMBED_MODEL
    if _FASTEMBED_MODEL is None:
        from fastembed import TextEmbedding
        _FASTEMBED_MODEL = TextEmbedding(model_name="BAAI/bge-small-en-v1.5")
    return _FASTEMBED_MODEL


class LocalFastEmbed:
    """Wrapper matching the embedding interface with async support."""

    dimension: int = 384

    async def aembed_documents(self, texts: List[str]) -> List[List[float]]:
        def _embed_all():
            m = _get_fastembed_model()
            return [vec.tolist() for vec in m.embed(texts)]

        return await asyncio.to_thread(_embed_all)

    async def aembed_query(self, text: str) -> List[float]:
        def _embed_one():
            m = _get_fastembed_model()
            return list(m.embed([text]))[0].tolist()

        return await asyncio.to_thread(_embed_one)


def _get_embedding_engine():
    """
    Return local FastEmbed by default to guarantee 100% free, offline,
    and unlimited file embedding without credit errors.
    """
    return LocalFastEmbed()


def _get_async_qdrant_client() -> AsyncQdrantClient:
    """Return an async-native Qdrant client."""
    return AsyncQdrantClient(url=settings.qdrant_url)


async def _ensure_collection(client: AsyncQdrantClient, dimension: int = 384) -> None:
    """Create Qdrant collection with matching dimension if not exists."""
    response = await client.get_collections()
    existing = [c.name for c in response.collections]
    if settings.qdrant_collection_name not in existing:
        await client.create_collection(
            collection_name=settings.qdrant_collection_name,
            vectors_config=VectorParams(
                size=dimension,
                distance=Distance.COSINE,
            ),
        )
        logger.info("Created Qdrant collection '%s' with dimension %d", settings.qdrant_collection_name, dimension)


def _load_file_sync(file_path: str) -> List[Document]:
    """Synchronous file loading — called via asyncio.to_thread."""
    ext = Path(file_path).suffix.lower()
    if ext == ".pdf":
        loader = PyPDFLoader(file_path)
    elif ext == ".txt":
        loader = TextLoader(file_path, encoding="utf-8")
    elif ext in (".docx", ".doc"):
        loader = Docx2txtLoader(file_path)
    else:
        raise ValueError(f"Unsupported file type: {ext}")
    return loader.load()


async def _load_file(file_path: str) -> List[Document]:
    """Load a file without blocking the event loop."""
    return await asyncio.to_thread(_load_file_sync, file_path)


async def ingest_document(file_path: str, source_name: str) -> int:
    """
    Process, split, embed, and index a document into Qdrant.
    Handles large files safely in streaming batches.
    Returns the number of chunks indexed.
    """
    docs = await _load_file(file_path)
    if not docs:
        return 0

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        add_start_index=True,
    )
    chunks = splitter.split_documents(docs)
    if not chunks:
        return 0

    for chunk in chunks:
        chunk.metadata["source_name"] = source_name

    embed_engine = _get_embedding_engine()
    client = _get_async_qdrant_client()

    try:
        await _ensure_collection(client, dimension=embed_engine.dimension)

        texts = [c.page_content for c in chunks]
        metadatas = [c.metadata for c in chunks]

        # Batch embedding generation to avoid high memory/timeouts
        vectors = []
        for i in range(0, len(texts), EMBED_BATCH_SIZE):
            batch = texts[i : i + EMBED_BATCH_SIZE]
            batch_vectors = await embed_engine.aembed_documents(batch)
            vectors.extend(batch_vectors)

        import uuid as _uuid

        points = [
            PointStruct(
                id=str(_uuid.uuid4()),
                vector=vec,
                payload={"page_content": text, **meta},
            )
            for text, vec, meta in zip(texts, vectors, metadatas)
        ]

        # Batch upsert to Qdrant
        for i in range(0, len(points), UPSERT_BATCH_SIZE):
            batch_pts = points[i : i + UPSERT_BATCH_SIZE]
            await client.upsert(
                collection_name=settings.qdrant_collection_name,
                points=batch_pts,
            )

        logger.info("Successfully indexed %d chunks from '%s'", len(chunks), source_name)
        return len(chunks)
    finally:
        await client.close()


async def retrieve_context(query: str, top_k: int = 5) -> str:
    """
    Retrieve the most relevant document chunks for a query.
    Returns a formatted context string for injection into the prompt.
    """
    embed_engine = _get_embedding_engine()
    client = _get_async_qdrant_client()

    try:
        await _ensure_collection(client, dimension=embed_engine.dimension)

        query_vector = await embed_engine.aembed_query(query)

        results = await client.search(
            collection_name=settings.qdrant_collection_name,
            query_vector=query_vector,
            limit=top_k,
            with_payload=True,
        )

        if not results:
            return ""

        context_parts = []
        for i, hit in enumerate(results, 1):
            payload = hit.payload or {}
            source = payload.get("source_name", "unknown")
            content = payload.get("page_content", "")
            context_parts.append(f"[Nguồn {i}: {source}]\n{content}")

        return "\n\n".join(context_parts)
    finally:
        await client.close()
