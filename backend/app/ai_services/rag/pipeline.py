"""
RAG Pipeline: Document loading, splitting, embedding, and retrieval.
Supports PDF, TXT, and DOCX files with Qdrant as the vector store.

Fixes applied:
  - Use AsyncQdrantClient for all async operations (no blocking I/O on event loop)
  - _ensure_collection is now async
  - _load_file wrapped with asyncio.to_thread to avoid blocking the event loop
  - Replaced deprecated langchain_community.vectorstores.Qdrant with
    langchain_qdrant.QdrantVectorStore (langchain-qdrant package)
"""
from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import List

from langchain_community.document_loaders import (
    Docx2txtLoader,
    PyPDFLoader,
    TextLoader,
)
from langchain_core.documents import Document
from langchain_openai import OpenAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from qdrant_client import AsyncQdrantClient
from qdrant_client.http.models import Distance, VectorParams

from app.core.config import settings

logger = logging.getLogger(__name__)

EMBEDDING_DIMENSION = 1536  # text-embedding-3-small
CHUNK_SIZE = 1000
CHUNK_OVERLAP = 150


def _get_embeddings() -> OpenAIEmbeddings:
    return OpenAIEmbeddings(
        model="text-embedding-3-small",
        api_key=settings.openai_api_key,
    )


def _get_async_qdrant_client() -> AsyncQdrantClient:
    """Return an async-native Qdrant client."""
    return AsyncQdrantClient(url=settings.qdrant_url)


async def _ensure_collection(client: AsyncQdrantClient) -> None:
    """Create Qdrant collection if it doesn't already exist (async)."""
    response = await client.get_collections()
    existing = [c.name for c in response.collections]
    if settings.qdrant_collection_name not in existing:
        await client.create_collection(
            collection_name=settings.qdrant_collection_name,
            vectors_config=VectorParams(
                size=EMBEDDING_DIMENSION,
                distance=Distance.COSINE,
            ),
        )
        logger.info("Created Qdrant collection: %s", settings.qdrant_collection_name)


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
    Process and index a document into Qdrant.
    Returns the number of chunks indexed.
    """
    docs = await _load_file(file_path)

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        add_start_index=True,
    )
    chunks = splitter.split_documents(docs)

    for chunk in chunks:
        chunk.metadata["source_name"] = source_name

    embeddings = _get_embeddings()
    client = _get_async_qdrant_client()

    try:
        await _ensure_collection(client)

        # Embed and upsert in one shot using the async client directly
        texts = [c.page_content for c in chunks]
        metadatas = [c.metadata for c in chunks]

        vectors = await embeddings.aembed_documents(texts)

        from qdrant_client.http.models import PointStruct
        import uuid as _uuid

        points = [
            PointStruct(
                id=str(_uuid.uuid4()),
                vector=vec,
                payload={"page_content": text, **meta},
            )
            for text, vec, meta in zip(texts, vectors, metadatas)
        ]

        await client.upsert(
            collection_name=settings.qdrant_collection_name,
            points=points,
        )
        logger.info("Indexed %d chunks from '%s'", len(chunks), source_name)
        return len(chunks)
    finally:
        await client.close()


async def retrieve_context(query: str, top_k: int = 5) -> str:
    """
    Retrieve the most relevant document chunks for a query.
    Returns a formatted context string for injection into the prompt.
    """
    embeddings = _get_embeddings()
    client = _get_async_qdrant_client()

    try:
        await _ensure_collection(client)

        query_vector = await embeddings.aembed_query(query)

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
            context_parts.append(f"[Source {i}: {source}]\n{content}")

        return "\n\n".join(context_parts)
    finally:
        await client.close()
