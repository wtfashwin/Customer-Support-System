"""Redis-backed response cache (CP11)."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Awaitable, Callable
from typing import Any

import redis.asyncio as redis_async

from app.config import settings
from app.core.logging import get_logger

log = get_logger(__name__)

_client: redis_async.Redis | None = None


def get_redis() -> redis_async.Redis:
    global _client
    if _client is None:
        _client = redis_async.from_url(settings.redis_url, decode_responses=True)
    return _client


async def close_redis() -> None:
    global _client
    if _client is not None:
        try:
            await _client.aclose()
        except Exception:
            pass
        _client = None


def make_key(*, model: str, payload: Any) -> str:
    raw = json.dumps({"m": model, "p": payload}, sort_keys=True, default=str).encode()
    return "aiml:" + hashlib.sha256(raw).hexdigest()


async def get_or_set(
    key: str,
    fetch: Callable[[], Awaitable[Any]],
    *,
    ttl: int | None = None,
) -> tuple[Any, bool]:
    """Returns (value, hit). On any Redis error, falls back to direct fetch."""

    ttl = ttl if ttl is not None else settings.cache_ttl_seconds
    try:
        client = get_redis()
        cached = await client.get(key)
        if cached is not None:
            return json.loads(cached), True
    except Exception as exc:
        log.warning("cache_get_failed", error=str(exc))
        return await fetch(), False

    value = await fetch()
    try:
        await client.set(key, json.dumps(value, default=str), ex=ttl)
    except Exception as exc:
        log.warning("cache_set_failed", error=str(exc))
    return value, False
