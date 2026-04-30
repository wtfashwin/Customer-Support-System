"""Langchain RAG with SSE token streaming (CP7)."""

from __future__ import annotations

import asyncio
import json
import time
from collections.abc import AsyncIterator
from typing import Any

from app.config import settings
from app.core.exceptions import NotConfigured
from app.core.logging import get_logger
from app.core.middleware import record_ai_call

log = get_logger(__name__)

SYSTEM_PROMPT = (
    "You are a customer support assistant. Answer using only the provided sources. "
    "Cite each claim as [source_id]. If the sources do not contain the answer, say "
    "you don't know — do not invent facts."
)


async def stream_rag_query(
    *, query: str, top_k: int = 4, filter: dict[str, Any] | None = None
) -> AsyncIterator[dict[str, str]]:
    """Yield SSE-shaped {"event": ..., "data": ...} dicts for sse_starlette."""

    if not settings.openai_api_key and settings.openai_provider == "openai":
        yield {
            "event": "error",
            "data": json.dumps({"code": "not_configured", "message": "OpenAI not configured"}),
        }
        return

    started = time.perf_counter()
    sources = await _retrieve_sources(query=query, top_k=top_k, filter=filter)
    for src in sources:
        yield {"event": "source", "data": json.dumps(src)}

    context_block = "\n\n".join(f"[{s['id']}] {s['snippet']}" for s in sources) or "(no sources found)"
    user_msg = f"Question: {query}\n\nSources:\n{context_block}"

    from app.services.openai_client import chat_stream

    answer_parts: list[str] = []
    try:
        async for delta in chat_stream(
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ],
        ):
            answer_parts.append(delta)
            yield {"event": "token", "data": json.dumps({"delta": delta})}
    except Exception as exc:
        yield {
            "event": "error",
            "data": json.dumps({"code": "upstream_error", "message": str(exc)}),
        }
        return

    answer = "".join(answer_parts)
    latency_ms = int((time.perf_counter() - started) * 1000)
    record_ai_call(
        model=settings.openai_chat_model,
        prompt_hash="",
        tokens_in=0,
        tokens_out=0,
        latency_ms=latency_ms,
        status="ok",
    )
    yield {
        "event": "done",
        "data": json.dumps(
            {
                "answer": answer,
                "sources": sources,
                "tokens": {"prompt": 0, "completion": 0},
                "latency_ms": latency_ms,
            }
        ),
    }


async def _retrieve_sources(
    *, query: str, top_k: int, filter: dict[str, Any] | None
) -> list[dict[str, Any]]:
    """Retrieve top-k chunks via the langchain PGVector retriever.

    Falls back to an empty list when pgvector / OpenAI aren't reachable so the
    streaming path still produces a meaningful 'sources empty' answer rather
    than 500-ing in dev environments without seed data."""

    try:
        from langchain_openai import OpenAIEmbeddings
        from langchain_postgres import PGVector

        embeddings = OpenAIEmbeddings(
            model=settings.openai_embed_model,
            api_key=settings.openai_api_key,
        )
        store = PGVector(
            connection=settings.sync_database_url,
            collection_name="rag_collection",
            embeddings=embeddings,
            use_jsonb=True,
        )
        retriever_filter = filter or None
        docs = await asyncio.to_thread(
            store.similarity_search_with_score, query, top_k, retriever_filter
        )
        return [
            {
                "id": str(getattr(d, "id", None) or d.metadata.get("id", "")),
                "score": float(score),
                "metadata": d.metadata or {},
                "snippet": (d.page_content or "")[:500],
            }
            for d, score in docs
        ]
    except Exception as exc:
        log.warning("rag_retriever_unavailable", error=str(exc))
        return []
