"""Azure AI Search hybrid retrieval (CP9)."""

from __future__ import annotations

import asyncio
from typing import Any

from app.config import settings
from app.core.exceptions import NotConfigured, UpstreamError


def _client(index: str):
    from azure.core.credentials import AzureKeyCredential
    from azure.search.documents import SearchClient

    if not settings.azure_search_endpoint or not settings.azure_search_key:
        raise NotConfigured("Azure AI Search credentials missing")

    return SearchClient(
        endpoint=settings.azure_search_endpoint,
        index_name=index,
        credential=AzureKeyCredential(settings.azure_search_key),
    )


async def semantic_search(*, query: str, index: str, top_k: int = 5) -> list[dict[str, Any]]:
    from azure.search.documents.models import VectorizedQuery

    from app.services.openai_client import embed_texts

    embed_result = await embed_texts([query])
    vector = embed_result.vectors[0]

    def _run() -> list[dict[str, Any]]:
        try:
            client = _client(index)
            results = client.search(
                search_text=query,
                top=top_k,
                query_type="semantic",
                semantic_configuration_name="default",
                vector_queries=[
                    VectorizedQuery(
                        vector=vector,
                        k_nearest_neighbors=top_k,
                        fields="content_vector",
                    )
                ],
            )
            hits: list[dict[str, Any]] = []
            for r in results:
                hits.append(
                    {
                        "id": str(r.get("id") or r.get("@search.documentKey", "")),
                        "score": float(r.get("@search.score", 0.0)),
                        "content": r.get("content", ""),
                        "highlights": r.get("@search.highlights", {}).get("content", []),
                        "metadata": {
                            k: v
                            for k, v in r.items()
                            if not k.startswith("@search.") and k not in {"content", "id"}
                        },
                    }
                )
            return hits
        except NotConfigured:
            raise
        except Exception as exc:
            raise UpstreamError(f"Azure Search failed: {exc}") from exc

    return await asyncio.to_thread(_run)
