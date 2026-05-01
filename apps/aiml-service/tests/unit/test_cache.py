"""Unit tests for the Redis-backed response cache. Uses fakeredis so
the test runs without a live Redis instance."""

from __future__ import annotations

import pytest
import fakeredis.aioredis

from app.services import cache as cache_module


@pytest.fixture
async def fake_redis(monkeypatch):
    fake = fakeredis.aioredis.FakeRedis(decode_responses=True)
    monkeypatch.setattr(cache_module, "_client", fake)
    yield fake
    await fake.flushdb()
    await fake.aclose()
    monkeypatch.setattr(cache_module, "_client", None)


async def test_cache_hit_skips_fetch(fake_redis):
    calls = {"n": 0}

    async def fetch():
        calls["n"] += 1
        return {"value": "expensive", "n": calls["n"]}

    key = cache_module.make_key(model="test", payload={"q": "hello"})

    first, hit = await cache_module.get_or_set(key, fetch, ttl=60)
    assert hit is False
    assert first == {"value": "expensive", "n": 1}

    second, hit = await cache_module.get_or_set(key, fetch, ttl=60)
    assert hit is True
    assert second == {"value": "expensive", "n": 1}
    assert calls["n"] == 1, "fetch must not be called on cache hit"


async def test_cache_miss_falls_back_to_fetch_on_redis_error(monkeypatch):
    """When Redis is unavailable, get_or_set should still return a value."""

    class BrokenRedis:
        async def get(self, *_args, **_kwargs):
            raise RuntimeError("redis down")

        async def set(self, *_args, **_kwargs):
            raise RuntimeError("redis down")

    monkeypatch.setattr(cache_module, "_client", BrokenRedis())

    async def fetch():
        return {"ok": True}

    key = cache_module.make_key(model="x", payload={"a": 1})
    value, hit = await cache_module.get_or_set(key, fetch, ttl=10)
    assert value == {"ok": True}
    assert hit is False


def test_make_key_is_deterministic():
    a = cache_module.make_key(model="m", payload={"q": "hi", "k": 1})
    b = cache_module.make_key(model="m", payload={"k": 1, "q": "hi"})
    assert a == b
    c = cache_module.make_key(model="m2", payload={"q": "hi"})
    assert a != c
    assert a.startswith("aiml:")
