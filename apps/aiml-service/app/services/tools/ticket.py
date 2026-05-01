"""create_support_ticket tool — writes an aiml_tickets row owned by the
calling user. Optionally linked to the active conversation."""

from __future__ import annotations

import uuid
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.db.models import SupportTicket
from app.db.session import AsyncSessionLocal
from app.services.tools import Tool

Priority = Literal["low", "normal", "high", "urgent"]


class CreateTicketArgs(BaseModel):
    summary: str = Field(..., min_length=5, max_length=2000)
    priority: Priority = "normal"


class CreateTicketResult(BaseModel):
    ticketId: str
    status: str


class CreateSupportTicketTool(Tool[CreateTicketArgs, CreateTicketResult]):
    name = "create_support_ticket"
    description = (
        "Create a support ticket for the user when their issue cannot be resolved "
        "automatically. Always include a clear, one-paragraph summary that captures "
        "what the user wants and what was already tried."
    )
    Args = CreateTicketArgs
    Result = CreateTicketResult

    async def run(  # type: ignore[override]
        self, args: CreateTicketArgs, *, context: dict[str, Any] | None = None
    ) -> CreateTicketResult:
        ctx = context or {}
        ticket_id = uuid.uuid4()
        async with AsyncSessionLocal() as session:
            row = SupportTicket(
                id=ticket_id,
                user_id=ctx.get("user_id") or "anonymous",
                conversation_id=uuid.UUID(ctx["conversation_id"]) if ctx.get("conversation_id") else None,
                summary=args.summary,
                priority=args.priority,
                status="open",
            )
            session.add(row)
            await session.commit()
        return CreateTicketResult(ticketId=str(ticket_id), status="open")
