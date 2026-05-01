"""search_knowledge_base tool — calls Azure AI Search if configured,
otherwise falls back to pgvector retrieval (langchain_rag._retrieve_sources)."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from app.config import settings
from app.services.tools import Tool


class KBHit(BaseModel):
    id: str
    snippet: str
    score: float
    metadata: dict[str, Any] = Field(default_factory=dict)


class SearchKBArgs(BaseModel):
    query: str = Field(..., min_length=1)
    topK: int = Field(4, ge=1, le=10)


class SearchKBResult(BaseModel):
    hits: list[KBHit]


class SearchKnowledgeBaseTool(Tool[SearchKBArgs, SearchKBResult]):
    name = "search_knowledge_base"
    description = (
        "Search the customer-support knowledge base for an answer to a "
        "natural-language question. Use for policy questions, how-to guides, "
        "and general support content not tied to a specific order/invoice."
    )
    Args = SearchKBArgs
    Result = SearchKBResult

    async def run(self, args: SearchKBArgs) -> SearchKBResult:
        if settings.azure_search_endpoint and settings.azure_search_key:
            from app.services.azure_search import semantic_search

            raw_hits = await semantic_search(
                query=args.query, index=settings.azure_search_index, top_k=args.topK
            )
            return SearchKBResult(
                hits=[
                    KBHit(
                        id=h["id"],
                        snippet=(h.get("content") or "")[:500],
                        score=float(h.get("score", 0.0)),
                        metadata=h.get("metadata") or {},
                    )
                    for h in raw_hits
                ]
            )

        # Fallback: pgvector retriever from the RAG service.
        from app.services.langchain_rag import _retrieve_sources

        sources = await _retrieve_sources(query=args.query, top_k=args.topK, filter=None)
        return SearchKBResult(
            hits=[
                KBHit(
                    id=s["id"],
                    snippet=s.get("snippet", ""),
                    score=float(s.get("score", 0.0)),
                    metadata=s.get("metadata") or {},
                )
                for s in sources
            ]
        )
