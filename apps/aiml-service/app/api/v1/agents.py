import json
import uuid
from collections.abc import AsyncIterator
from typing import Any, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from app.auth.rbac import CurrentUser, require_scopes
from app.core.exceptions import Forbidden, NotFound
from app.db.models import Conversation, Message
from app.db.session import AsyncSessionLocal, get_db

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


# -------------------- /v1/agents/run -----------------------------------


class RunRequest(BaseModel):
    message: str = Field(..., min_length=1)
    conversationId: uuid.UUID | None = None
    topK: int = Field(4, ge=1, le=10)
    maxIterations: int = Field(5, ge=1, le=10)


async def _get_or_create_conversation(
    db: AsyncSession, *, user_id: str, conversation_id: uuid.UUID | None
) -> Conversation:
    if conversation_id is not None:
        convo = await db.get(Conversation, conversation_id)
        if convo is None:
            raise NotFound(f"conversation {conversation_id} not found")
        if convo.user_id != user_id:
            raise Forbidden(
                "You do not own this conversation",
                code="conversation_owner_mismatch",
            )
        return convo
    convo = Conversation(user_id=user_id)
    db.add(convo)
    await db.commit()
    await db.refresh(convo)
    return convo


def _truncate_title(text: str) -> str:
    cleaned = " ".join(text.split())
    return cleaned[:80]


@router.post("/run")
async def run_agent(
    body: RunRequest,
    user: CurrentUser = Depends(require_scopes("aiml:tools:invoke")),
    db: AsyncSession = Depends(get_db),
) -> EventSourceResponse:
    convo = await _get_or_create_conversation(
        db, user_id=user.sub, conversation_id=body.conversationId
    )
    convo_id = str(convo.id)
    is_new = convo.title is None

    # Persist the user message immediately so the conversation reflects what
    # was asked even if the stream errors mid-flight.
    user_msg = Message(
        conversation_id=convo.id,
        role="user",
        content=body.message,
    )
    db.add(user_msg)
    if is_new:
        convo.title = _truncate_title(body.message)
    await db.commit()

    return EventSourceResponse(
        _stream_agent_events(
            user_id=user.sub,
            conversation_id=convo_id,
            user_message=body.message,
            top_k=body.topK,
            max_iterations=body.maxIterations,
        )
    )


async def _stream_agent_events(
    *,
    user_id: str,
    conversation_id: str,
    user_message: str,
    top_k: int,
    max_iterations: int,
) -> AsyncIterator[dict[str, str]]:
    """Wrap AgentGraph.run so the assistant message is persisted on success
    OR on failure. The wrapper uses its own AsyncSession because the request-
    scoped one will already be closed by the time SSE tokens are flushed."""

    from app.services.agent_graph import AgentGraph

    graph = AgentGraph(max_iterations=max_iterations)
    answer_parts: list[str] = []
    tool_calls_payload: list[dict[str, Any]] = []
    tokens_in = tokens_out = 0
    final_message_id: str | None = None

    try:
        async for ev in graph.run(
            user_message=user_message,
            user_id=user_id,
            conversation_id=conversation_id,
            top_k=top_k,
        ):
            if ev["event"] == "token":
                try:
                    answer_parts.append(json.loads(ev["data"]).get("delta", ""))
                except json.JSONDecodeError:
                    pass
            elif ev["event"] == "done":
                try:
                    payload = json.loads(ev["data"])
                    tool_calls_payload = payload.get("toolCalls") or []
                    tokens_in = payload.get("tokens", {}).get("prompt", 0)
                    tokens_out = payload.get("tokens", {}).get("completion", 0)
                except json.JSONDecodeError:
                    pass
                # Persist the assistant message + amend the done event with
                # messageId so the client can scope feedback by it.
                final_message_id = await _persist_assistant(
                    conversation_id=conversation_id,
                    answer="".join(answer_parts),
                    tool_calls=tool_calls_payload,
                    tokens_in=tokens_in,
                    tokens_out=tokens_out,
                )
                amended = json.loads(ev["data"])
                amended["messageId"] = final_message_id
                amended["conversationId"] = conversation_id
                yield {"event": "done", "data": json.dumps(amended)}
                continue
            yield ev
    except Exception as exc:
        # Persist whatever we got so the conversation reflects the partial run.
        await _persist_assistant(
            conversation_id=conversation_id,
            answer="".join(answer_parts) or f"[interrupted: {exc.__class__.__name__}]",
            tool_calls=tool_calls_payload,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
        )
        yield {
            "event": "error",
            "data": json.dumps({"code": "internal_error", "message": str(exc)}),
        }


async def _persist_assistant(
    *,
    conversation_id: str,
    answer: str,
    tool_calls: list[dict[str, Any]],
    tokens_in: int,
    tokens_out: int,
) -> str:
    """Open a fresh session and write the assistant Message + bump the
    conversation updated_at. Returns the new message id."""

    msg_id = uuid.uuid4()
    async with AsyncSessionLocal() as session:
        from sqlalchemy import update

        session.add(
            Message(
                id=msg_id,
                conversation_id=uuid.UUID(conversation_id),
                role="assistant",
                content=answer,
                tool_calls=tool_calls or None,
                tool_results=None,
                tokens_in=tokens_in,
                tokens_out=tokens_out,
            )
        )
        await session.execute(
            update(Conversation)
            .where(Conversation.id == uuid.UUID(conversation_id))
            .values()  # ON UPDATE handled by the column default at row write; no-op flush
        )
        await session.commit()
    return str(msg_id)
