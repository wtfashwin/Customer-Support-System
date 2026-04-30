from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.auth.rbac import CurrentUser, require_scopes

router = APIRouter()


class HistoryMessage(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str


class RouteRequest(BaseModel):
    message: str = Field(..., min_length=1)
    history: list[HistoryMessage] = Field(default_factory=list, max_length=32)


class RouteResponse(BaseModel):
    agent: Literal["support", "order", "billing"]
    confidence: float
    reasoning: str


@router.post("/route", response_model=RouteResponse)
async def route(
    body: RouteRequest,
    user: CurrentUser = Depends(require_scopes("aiml:read")),
) -> RouteResponse:
    from app.services.agent_router import classify_intent

    history = [{"role": m.role, "content": m.content} for m in body.history]
    result = await classify_intent(body.message, history=history)
    return RouteResponse(**result)
