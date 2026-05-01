"""escalate_to_human tool — pushes a frame onto the WebSocket handoff
queue keyed by conversation_id. The /v1/ws/handoff session that's
listening for this conversation receives the frame on its next read."""

from __future__ import annotations

import asyncio
from typing import Any

from pydantic import BaseModel, Field

from app.core.logging import get_logger
from app.services.tools import Tool

log = get_logger(__name__)

# Per-conversation handoff queues. Populated lazily; the WS handler in
# app/api/v1/ws.py drains them on the read side. Bounded so a runaway
# agent can't blow memory.
_HANDOFF_QUEUES: dict[str, asyncio.Queue[dict[str, Any]]] = {}
_QUEUE_MAX = 64


def get_handoff_queue(conversation_id: str) -> asyncio.Queue[dict[str, Any]]:
    if conversation_id not in _HANDOFF_QUEUES:
        _HANDOFF_QUEUES[conversation_id] = asyncio.Queue(maxsize=_QUEUE_MAX)
    return _HANDOFF_QUEUES[conversation_id]


class EscalateArgs(BaseModel):
    reason: str = Field(..., min_length=5, max_length=2000)


class EscalateResult(BaseModel):
    queued: bool
    channel: str


class EscalateToHumanTool(Tool[EscalateArgs, EscalateResult]):
    name = "escalate_to_human"
    description = (
        "Hand the conversation off to a human agent over the WebSocket "
        "handoff channel. Use only when the user explicitly asks for a human "
        "or when the issue is unsafe / out of scope to auto-resolve."
    )
    Args = EscalateArgs
    Result = EscalateResult

    async def run(  # type: ignore[override]
        self, args: EscalateArgs, *, context: dict[str, Any] | None = None
    ) -> EscalateResult:
        ctx = context or {}
        convo = ctx.get("conversation_id") or "global"
        queue = get_handoff_queue(convo)
        try:
            queue.put_nowait(
                {
                    "type": "handoff",
                    "reason": args.reason,
                    "user_id": ctx.get("user_id"),
                    "conversation_id": convo,
                }
            )
        except asyncio.QueueFull:
            log.warning("handoff_queue_full", conversation_id=convo)
            return EscalateResult(queued=False, channel="ws-handoff")
        return EscalateResult(queued=True, channel="ws-handoff")
