from datetime import datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Path
from pydantic import BaseModel, Field
from sqlalchemy import asc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.rbac import CurrentUser, require_scopes
from app.core.exceptions import Forbidden, NotFound
from app.db.models import Conversation, Message
from app.db.session import get_db

router = APIRouter()


class CreateConversationRequest(BaseModel):
    title: str | None = Field(default=None, max_length=500)
    metadata: dict[str, Any] = Field(default_factory=dict)


class CreateConversationResponse(BaseModel):
    id: str
    title: str | None
    createdAt: datetime


class MessageItem(BaseModel):
    id: str
    role: str
    content: str
    toolCalls: list[dict[str, Any]] | None
    toolResults: list[dict[str, Any]] | None
    tokensIn: int
    tokensOut: int
    createdAt: datetime


class ConversationDetail(BaseModel):
    id: str
    title: str | None
    createdAt: datetime
    updatedAt: datetime
    messages: list[MessageItem]


@router.post("", response_model=CreateConversationResponse)
async def create_conversation(
    body: CreateConversationRequest,
    user: CurrentUser = Depends(require_scopes("aiml:write")),
    db: AsyncSession = Depends(get_db),
) -> CreateConversationResponse:
    convo = Conversation(
        user_id=user.sub,
        title=body.title,
        convo_metadata=body.metadata,
    )
    db.add(convo)
    await db.commit()
    await db.refresh(convo)
    return CreateConversationResponse(
        id=str(convo.id), title=convo.title, createdAt=convo.created_at
    )


@router.get("/{conversation_id}", response_model=ConversationDetail)
async def get_conversation(
    conversation_id: UUID = Path(...),
    user: CurrentUser = Depends(require_scopes("aiml:read")),
    db: AsyncSession = Depends(get_db),
) -> ConversationDetail:
    convo = await db.get(Conversation, conversation_id)
    if convo is None:
        raise NotFound(f"conversation {conversation_id} not found")
    if convo.user_id != user.sub and "aiml:admin" not in user.scopes:
        raise Forbidden(
            "You do not own this conversation",
            code="conversation_owner_mismatch",
        )

    rows = (
        await db.execute(
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(asc(Message.created_at))
        )
    ).scalars().all()

    return ConversationDetail(
        id=str(convo.id),
        title=convo.title,
        createdAt=convo.created_at,
        updatedAt=convo.updated_at,
        messages=[
            MessageItem(
                id=str(m.id),
                role=m.role,
                content=m.content,
                toolCalls=m.tool_calls,
                toolResults=m.tool_results,
                tokensIn=m.tokens_in,
                tokensOut=m.tokens_out,
                createdAt=m.created_at,
            )
            for m in rows
        ],
    )
