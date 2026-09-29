"""
RAG Pipeline: Document loading, splitting, embedding, and retrieval.
Supports PDF, TXT, and DOCX files with Qdrant as the vector store.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import List

from langchain_community.document_loaders import (
    PyPDFLoader,
    TextLoader,
    Docx2txtLoader,
)
from langchain_community.vectorstores import Qdrant
from langchain_core.documents import Document
from langchain_openai import OpenAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from qdrant_client import AsyncQdrantClient, QdrantClient
from qdrant_client.http.models import Distance, VectorParams

from app.core.config import settings

logger = logging.getLogger(__name__)

EMBEDDING_DIMENSION = 1536          # text-embedding-3-small
CHUNK_SIZE = 1000
CHUNK_OVERLAP = 150


def _get_embeddings() -> OpenAIEmbeddings:
    return OpenAIEmbeddings(
        model="text-embedding-3-small",
        api_key=settings.openai_api_key,
    )


def _get_qdrant_client() -> QdrantClient:
    return QdrantClient(url=settings.qdrant_url)


def _ensure_collection(client: QdrantClient) -> None:
    """Create Qdrant collection if it doesn't already exist."""
    collections = [c.name for c in client.get_collections().collections]
    if settings.qdrant_collection_name not in collections:
        client.create_collection(
            collection_name=settings.qdrant_collection_name,
            vectors_config=VectorParams(
                size=EMBEDDING_DIMENSION,
                distance=Distance.COSINE,
            ),
        )
        logger.info("Created Qdrant collection: %s", settings.qdrant_collection_name)


def _load_file(file_path: str) -> List[Document]:
    """Load a file by extension into LangChain documents."""
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


async def ingest_document(file_path: str, source_name: str) -> int:
    """
    Process and index a document into Qdrant.
    Returns the number of chunks indexed.
    """
    docs = _load_file(file_path)

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        add_start_index=True,
    )
    chunks = splitter.split_documents(docs)

    # Tag each chunk with source metadata
    for chunk in chunks:
        chunk.metadata["source_name"] = source_name

    embeddings = _get_embeddings()
    client = _get_qdrant_client()
    _ensure_collection(client)

    vectorstore = Qdrant(
        client=client,
        collection_name=settings.qdrant_collection_name,
        embeddings=embeddings,
    )
    await vectorstore.aadd_documents(chunks)
    logger.info("Indexed %d chunks from '%s'", len(chunks), source_name)
    return len(chunks)


async def retrieve_context(query: str, top_k: int = 5) -> str:
    """
    Retrieve the most relevant document chunks for a query.
    Returns a formatted context string for injection into the prompt.
    """
    embeddings = _get_embeddings()
    client = _get_qdrant_client()
    _ensure_collection(client)

    vectorstore = Qdrant(
        client=client,
        collection_name=settings.qdrant_collection_name,
        embeddings=embeddings,
    )
    retriever = vectorstore.as_retriever(
        search_type="similarity",
        search_kwargs={"k": top_k},
    )
    docs = await retriever.ainvoke(query)

    if not docs:
        return ""

    context_parts = []
    for i, doc in enumerate(docs, 1):
        source = doc.metadata.get("source_name", "unknown")
        context_parts.append(f"[Source {i}: {source}]\n{doc.page_content}")

    return "\n\n".join(context_parts)
