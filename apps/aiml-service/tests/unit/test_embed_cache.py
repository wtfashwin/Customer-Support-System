"""Verify /v1/embed cached responses do not re-hit OpenAI."""

from __future__ import annotations

import fakeredis.aioredis
import pytest
import respx
from fastapi.testclient import TestClient
from httpx import Response

from app.main import app
from app.services import cache as cache_module
from tests.conftest import make_token

JWKS_URL = "https://test.auth0.com/.well-known/jwks.json"
EMBED_URL = "https://api.openai.com/v1/embeddings"


def _embed_response(vectors: list[list[float]]) -> dict:
    return {
        "object": "list",
        "model": "text-embedding-3-small",
        "data": [{"object": "embedding", "embedding": v, "index": i} for i, v in enumerate(vectors)],
        "usage": {"prompt_tokens": 4, "total_tokens": 4},
    }


@pytest.fixture
async def fake_redis(monkeypatch):
    fake = fakeredis.aioredis.FakeRedis(decode_responses=True)
    monkeypatch.setattr(cache_module, "_client", fake)
    yield fake
    await fake.flushdb()
    await fake.aclose()
    monkeypatch.setattr(cache_module, "_client", None)


@respx.mock
async def test_identical_embed_call_hits_cache(jwks_payload, fake_redis):
    respx.get(JWKS_URL).mock(return_value=Response(200, json=jwks_payload))
    vectors = [[0.5] * 1536]
    route = respx.post(EMBED_URL).mock(return_value=Response(200, json=_embed_response(vectors)))

    headers = {"Authorization": f"Bearer {make_token(scopes='aiml:write')}"}
    body = {"texts": ["same input"]}

    with TestClient(app) as client:
        resp1 = client.post("/v1/embed", json=body, headers=headers)
        resp2 = client.post("/v1/embed", json=body, headers=headers)

    assert resp1.status_code == 200
    assert resp2.status_code == 200
    assert resp1.json() == resp2.json()
    assert route.call_count == 1, "second call should be served from Redis"
