"""LlamaIndex ingestion (CP6). Stub returns NotConfigured if pgvector
extension or OpenAI is unavailable; full implementation in CP6."""

from __future__ import annotations

from typing import Any

from sqlalchemy import text

from app.config import settings
from app.core.exceptions import NotConfigured
from app.core.logging import get_logger
from app.db.session import AsyncSessionLocal

log = get_logger(__name__)


async def ingest_documents(documents: list[dict[str, Any]]) -> dict[str, int]:
    """Chunk + embed + persist into the document_nodes table.

    The implementation uses LlamaIndex's PGVectorStore for the node table and
    sentence-window chunking. Heavy imports are deferred so the service boots
    even when LlamaIndex/OpenAI are not yet configured."""

    if not settings.openai_api_key and settings.openai_provider == "openai":
        raise NotConfigured("OPENAI_API_KEY required for ingestion")

    from llama_index.core import Document, VectorStoreIndex
    from llama_index.core.node_parser import SentenceSplitter
    from llama_index.core.settings import Settings as LISettings
    from llama_index.embeddings.openai import OpenAIEmbedding
    from llama_index.vector_stores.postgres import PGVectorStore
    from sqlalchemy.engine.url import make_url

    url = make_url(settings.sync_database_url)
    vector_store = PGVectorStore.from_params(
        host=url.host or "localhost",
        port=url.port or 5432,
        database=url.database or "postgres",
        user=url.username or "postgres",
        password=url.password or "",
        table_name="document_nodes",
        embed_dim=settings.openai_embed_dim,
    )

    LISettings.embed_model = OpenAIEmbedding(
        model=settings.openai_embed_model,
        api_key=settings.openai_api_key,
    )
    LISettings.node_parser = SentenceSplitter(chunk_size=512, chunk_overlap=64)

    li_docs = [
        Document(
            doc_id=d["id"],
            text=d["text"],
            metadata=d.get("metadata") or {},
        )
        for d in documents
    ]

    index = VectorStoreIndex.from_documents(li_docs, vector_store=vector_store)
    nodes = index.docstore.docs if hasattr(index, "docstore") else {}
    node_count = len(nodes) if nodes else 0
    if node_count == 0:
        # Fall back to a count from the live store.
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                text("SELECT count(*) FROM data_document_nodes")
            )
            node_count = int(result.scalar() or 0)

    return {"ingested": len(documents), "nodes": node_count}
