from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from app.auth.rbac import CurrentUser, require_scopes
from app.config import settings
from app.core.exceptions import ValidationFailed

router = APIRouter()


class IngestDoc(BaseModel):
    id: str
    text: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class IngestRequest(BaseModel):
    documents: list[IngestDoc] = Field(..., min_length=1)


class IngestResponse(BaseModel):
    ingested: int
    nodes: int


class QueryRequest(BaseModel):
    query: str = Field(..., min_length=1)
    top_k: int = Field(4, ge=1, le=20)
    filter: dict[str, Any] | None = None


@router.post("/ingest", response_model=IngestResponse)
async def ingest(
    body: IngestRequest,
    user: CurrentUser = Depends(require_scopes("aiml:write")),
) -> IngestResponse:
    if len(body.documents) > settings.ingest_max_documents:
        raise ValidationFailed(
            f"documents exceeds max {settings.ingest_max_documents}"
        )
    from app.services.llamaindex_index import ingest_documents

    docs = [{"id": d.id, "text": d.text, "metadata": d.metadata} for d in body.documents]
    result = await ingest_documents(docs)
    return IngestResponse(**result)


@router.post("/query")
async def query(
    body: QueryRequest,
    user: CurrentUser = Depends(require_scopes("aiml:read")),
) -> EventSourceResponse:
    from app.services.langchain_rag import stream_rag_query

    return EventSourceResponse(
        stream_rag_query(query=body.query, top_k=body.top_k, filter=body.filter),
    )
