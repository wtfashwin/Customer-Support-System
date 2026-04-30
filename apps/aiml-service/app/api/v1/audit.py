import base64
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.rbac import CurrentUser, require_scopes
from app.db.models import AiAuditLog
from app.db.session import get_db

router = APIRouter()


class AuditItem(BaseModel):
    id: str
    userId: str
    route: str
    model: str
    promptHash: str
    tokensIn: int
    tokensOut: int
    costUsd: float | None
    latencyMs: int
    status: str
    error: str | None
    createdAt: datetime


class AuditPage(BaseModel):
    items: list[AuditItem]
    nextCursor: str | None


def _encode_cursor(created_at: datetime, id_: str) -> str:
    raw = f"{created_at.isoformat()}|{id_}"
    return base64.urlsafe_b64encode(raw.encode()).decode()


def _decode_cursor(cursor: str) -> tuple[datetime, str]:
    raw = base64.urlsafe_b64decode(cursor.encode()).decode()
    ts, id_ = raw.split("|", 1)
    return datetime.fromisoformat(ts), id_


@router.get("/logs", response_model=AuditPage)
async def list_logs(
    user: CurrentUser = Depends(require_scopes("aiml:admin")),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(50, ge=1, le=200),
    cursor: str | None = None,
    userId: str | None = None,
    route: str | None = None,
) -> AuditPage:
    stmt = select(AiAuditLog).order_by(desc(AiAuditLog.created_at), desc(AiAuditLog.id)).limit(limit + 1)
    if userId:
        stmt = stmt.where(AiAuditLog.user_id == userId)
    if route:
        stmt = stmt.where(AiAuditLog.route == route)
    if cursor:
        ts, id_ = _decode_cursor(cursor)
        stmt = stmt.where(AiAuditLog.created_at < ts)

    rows = (await db.execute(stmt)).scalars().all()
    has_more = len(rows) > limit
    rows = rows[:limit]

    items = [
        AuditItem(
            id=str(r.id),
            userId=r.user_id,
            route=r.route,
            model=r.model,
            promptHash=r.prompt_hash,
            tokensIn=r.tokens_in,
            tokensOut=r.tokens_out,
            costUsd=float(r.cost_usd) if r.cost_usd is not None else None,
            latencyMs=r.latency_ms,
            status=r.status,
            error=r.error,
            createdAt=r.created_at,
        )
        for r in rows
    ]
    next_cursor = None
    if has_more and rows:
        last = rows[-1]
        next_cursor = _encode_cursor(last.created_at, str(last.id))
    return AuditPage(items=items, nextCursor=next_cursor)
