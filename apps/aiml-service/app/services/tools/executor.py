"""Validates tool args, runs the tool, and writes one AiAuditLog row per call.

The executor never raises on tool-level failure: bad args or runtime errors
become a `ToolInvocation` with `ok=False`. The caller turns that into a
`tool_result` SSE event."""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from typing import Any

from app.core.exceptions import AIMLError
from app.core.logging import get_logger
from app.core.middleware import record_ai_call
from app.services.tools import Tool, ToolRegistry, default_registry

log = get_logger(__name__)


@dataclass
class ToolInvocation:
    call_id: str
    name: str
    args: dict[str, Any]
    ok: bool = False
    result: dict[str, Any] | None = None
    error: str | None = None
    latency_ms: int = 0
    extras: dict[str, Any] = field(default_factory=dict)


class ToolExecutor:
    def __init__(self, registry: ToolRegistry | None = None) -> None:
        self.registry = registry or default_registry

    async def invoke(
        self,
        name: str,
        raw_args: dict[str, Any],
        *,
        user_id: str,
        conversation_id: str | uuid.UUID | None,
        call_id: str | None = None,
    ) -> ToolInvocation:
        cid = call_id or str(uuid.uuid4())
        started = time.perf_counter()
        invocation = ToolInvocation(call_id=cid, name=name, args=raw_args)

        try:
            tool: Tool = self.registry.get(name)
        except KeyError:
            invocation.error = f"unknown tool: {name}"
            invocation.latency_ms = int((time.perf_counter() - started) * 1000)
            self._audit(invocation, user_id=user_id)
            return invocation

        try:
            args = tool.parse_args(raw_args)
        except AIMLError as exc:
            invocation.error = str(exc.message)
            invocation.latency_ms = int((time.perf_counter() - started) * 1000)
            self._audit(invocation, user_id=user_id)
            return invocation

        # Some tools want context (conversation_id, user_id) without polluting
        # their public Args schema. They opt in by accepting a `context` kwarg.
        run_kwargs: dict[str, Any] = {}
        if "context" in tool.run.__code__.co_varnames:
            run_kwargs["context"] = {
                "user_id": user_id,
                "conversation_id": str(conversation_id) if conversation_id else None,
            }

        try:
            result = await tool.run(args, **run_kwargs)  # type: ignore[arg-type]
            invocation.ok = True
            invocation.result = result.model_dump(mode="json")
        except AIMLError as exc:
            invocation.error = exc.message
        except Exception as exc:
            log.warning("tool_run_failed", tool=name, error=str(exc))
            invocation.error = f"{exc.__class__.__name__}: {exc}"

        invocation.latency_ms = int((time.perf_counter() - started) * 1000)
        self._audit(invocation, user_id=user_id)
        return invocation

    def _audit(self, inv: ToolInvocation, *, user_id: str) -> None:
        record_ai_call(
            route=f"tool:{inv.name}",
            model=f"tool:{inv.name}",
            prompt_hash="",
            tokens_in=0,
            tokens_out=0,
            latency_ms=inv.latency_ms,
            status="ok" if inv.ok else "error",
            error=inv.error,
        )
