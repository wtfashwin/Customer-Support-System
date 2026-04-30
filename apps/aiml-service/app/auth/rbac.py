from dataclasses import dataclass
from typing import Any

from fastapi import Header

from app.auth.jwt import extract_scopes, verify_token
from app.core.exceptions import MissingScope, Unauthenticated
from app.core.logging import user_id_ctx


@dataclass
class CurrentUser:
    sub: str
    scopes: set[str]
    claims: dict[str, Any]


async def _resolve_user(authorization: str | None) -> CurrentUser:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise Unauthenticated("Missing bearer token")
    token = authorization.split(None, 1)[1].strip()
    claims = await verify_token(token)
    sub = str(claims.get("sub", ""))
    user_id_ctx.set(sub)
    return CurrentUser(sub=sub, scopes=extract_scopes(claims), claims=claims)


def require_scopes(*required: str):
    """Returns a FastAPI dependency that asserts all required scopes are present."""

    needed = set(required)

    async def _dep(authorization: str | None = Header(default=None)) -> CurrentUser:
        user = await _resolve_user(authorization)
        if needed and not needed.issubset(user.scopes):
            missing = sorted(needed - user.scopes)
            raise MissingScope(f"Missing required scope(s): {', '.join(missing)}")
        return user

    return _dep


async def require_user(authorization: str | None = Header(default=None)) -> CurrentUser:
    """Use when an endpoint just needs an authenticated principal, not a specific scope."""
    return await _resolve_user(authorization)
