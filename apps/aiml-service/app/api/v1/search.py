from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.auth.rbac import CurrentUser, require_scopes
from app.config import settings
from app.core.exceptions import NotConfigured

router = APIRouter()


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1)
    index: str | None = None
    top_k: int = Field(5, ge=1, le=50)


class SearchHit(BaseModel):
    id: str
    score: float
    content: str
    highlights: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class SearchResponse(BaseModel):
    hits: list[SearchHit]
    total: int


@router.post("/semantic", response_model=SearchResponse)
async def semantic(
    body: SearchRequest,
    user: CurrentUser = Depends(require_scopes("aiml:read")),
) -> SearchResponse:
    if not settings.azure_search_endpoint or not settings.azure_search_key:
        raise NotConfigured("Azure AI Search is not configured")

    from app.services.azure_search import semantic_search

    hits = await semantic_search(
        query=body.query,
        index=body.index or settings.azure_search_index,
        top_k=body.top_k,
    )
    return SearchResponse(hits=[SearchHit(**h) for h in hits], total=len(hits))
