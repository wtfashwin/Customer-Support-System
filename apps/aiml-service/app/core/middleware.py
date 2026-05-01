import time
import uuid
from contextvars import ContextVar
from dataclasses import dataclass, field
from typing import Any

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp

from app.core.logging import get_logger, request_id_ctx, route_ctx, user_id_ctx

log = get_logger(__name__)


@dataclass
class AuditContext:
    """Per-request audit accumulator. Services append AI-call metadata here;
    AuditMiddleware persists rows after the response."""

    user_id: str = ""
    route: str = ""
    request_id: str = ""
    calls: list[dict[str, Any]] = field(default_factory=list)
    status_code: int = 0


audit_ctx: ContextVar[AuditContext | None] = ContextVar("audit_ctx", default=None)


def get_audit_context() -> AuditContext | None:
    return audit_ctx.get()


def record_ai_call(**fields: Any) -> None:
    ctx = audit_ctx.get()
    if ctx is None:
        return
    ctx.calls.append(fields)


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Any) -> Response:
        rid = request.headers.get("x-request-id") or str(uuid.uuid4())
        token_rid = request_id_ctx.set(rid)
        token_route = route_ctx.set(request.url.path)
        try:
            response = await call_next(request)
        finally:
            request_id_ctx.reset(token_rid)
            route_ctx.reset(token_route)
        response.headers["x-request-id"] = rid
        return response


class AuditMiddleware(BaseHTTPMiddleware):
    """Builds an AuditContext for each request, persists AI-call rows after
    the response is returned. DB write is best-effort: failures are logged
    but never block the response."""

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next: Any) -> Response:
        ctx = AuditContext(
            request_id=request_id_ctx.get(""),
            route=request.url.path,
        )
        token = audit_ctx.set(ctx)
        start = time.perf_counter()
        try:
            response = await call_next(request)
            ctx.status_code = response.status_code
            return response
        finally:
            elapsed_ms = int((time.perf_counter() - start) * 1000)
            ctx.user_id = user_id_ctx.get("") or ctx.user_id
            await _persist_audit(ctx, elapsed_ms)
            audit_ctx.reset(token)


async def _persist_audit(ctx: AuditContext, request_latency_ms: int) -> None:
    if not ctx.calls:
        return
    try:
        from app.db.models import AiAuditLog
        from app.db.session import AsyncSessionLocal

        async with AsyncSessionLocal() as session:
            for call in ctx.calls:
                row = AiAuditLog(
                    user_id=ctx.user_id or "anonymous",
                    route=ctx.route,
                    model=call.get("model", "unknown"),
                    prompt_hash=call.get("prompt_hash", ""),
                    tokens_in=call.get("tokens_in", 0),
                    tokens_out=call.get("tokens_out", 0),
                    cost_usd=call.get("cost_usd"),
                    latency_ms=call.get("latency_ms", request_latency_ms),
                    status=call.get("status", "ok"),
                    error=call.get("error"),
                )
                session.add(row)
            await session.commit()
    except Exception as exc:  # pragma: no cover - best-effort
        log.warning("audit_persist_failed", error=str(exc))
