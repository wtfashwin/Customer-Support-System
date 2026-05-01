from typing import Any

from fastapi import APIRouter
from sqlalchemy import text

from app.config import settings
from app.core.exceptions import NotReady
from app.db.session import AsyncSessionLocal

router = APIRouter()


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/ready")
async def ready() -> dict[str, Any]:
    checks: dict[str, str] = {}

    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
        checks["db"] = "ok"
    except Exception as exc:
        checks["db"] = f"fail: {exc.__class__.__name__}"

    try:
        if settings.openai_provider == "openai" and settings.openai_api_key or settings.openai_provider == "azure" and settings.azure_openai_api_key:
            from app.services.openai_client import openai_ping

            await openai_ping()
            checks["openai"] = "ok"
        else:
            checks["openai"] = "skipped"
    except Exception as exc:
        checks["openai"] = f"fail: {exc.__class__.__name__}"

    failed = [name for name, value in checks.items() if value.startswith("fail")]
    if failed:
        raise NotReady(
            "Readiness check failed",
            details={"checks": checks, "failed": failed},
        )
    return {"status": "ok", "checks": checks}
