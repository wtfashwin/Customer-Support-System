"""Unit tests for /v1/search/semantic with Azure AI Search mocked."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest
import respx
from fastapi.testclient import TestClient
from httpx import Response

from app.main import app
from tests.conftest import make_token

JWKS_URL = "https://test.auth0.com/.well-known/jwks.json"
EMBED_URL = "https://api.openai.com/v1/embeddings"


@pytest.fixture
def configure_search(monkeypatch):
    monkeypatch.setenv("AZURE_SEARCH_ENDPOINT", "https://search.example.com")
    monkeypatch.setenv("AZURE_SEARCH_KEY", "k")
    monkeypatch.setenv("AZURE_SEARCH_INDEX", "test-index")
    from app.config import get_settings

    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@respx.mock
async def test_semantic_search_returns_hits(jwks_payload, monkeypatch, configure_search):
    respx.get(JWKS_URL).mock(return_value=Response(200, json=jwks_payload))
    respx.post(EMBED_URL).mock(
        return_value=Response(
            200,
            json={
                "object": "list",
                "model": "text-embedding-3-small",
                "data": [{"object": "embedding", "embedding": [0.1] * 1536, "index": 0}],
                "usage": {"prompt_tokens": 1, "total_tokens": 1},
            },
        )
    )

    fake_client = MagicMock()
    fake_client.search.return_value = iter(
        [
            {
                "id": "doc-1",
                "@search.score": 0.91,
                "content": "Refunds are processed within 5 business days.",
                "@search.highlights": {"content": ["Refunds"]},
                "category": "billing",
            }
        ]
    )

    import app.services.azure_search as search_module

    monkeypatch.setattr(search_module, "_client", lambda index: fake_client)

    with TestClient(app) as client:
        resp = client.post(
            "/v1/search/semantic",
            json={"query": "refund timeline", "top_k": 3},
            headers={"Authorization": f"Bearer {make_token(scopes='aiml:read')}"},
        )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["total"] == 1
    hit = data["hits"][0]
    assert hit["id"] == "doc-1"
    assert hit["score"] == 0.91
    assert hit["highlights"] == ["Refunds"]
    assert hit["metadata"] == {"category": "billing"}


@respx.mock
async def test_semantic_search_503_when_not_configured(jwks_payload, monkeypatch):
    respx.get(JWKS_URL).mock(return_value=Response(200, json=jwks_payload))
    monkeypatch.setenv("AZURE_SEARCH_ENDPOINT", "")
    monkeypatch.setenv("AZURE_SEARCH_KEY", "")
    from app.config import get_settings

    get_settings.cache_clear()
    try:
        with TestClient(app) as client:
            resp = client.post(
                "/v1/search/semantic",
                json={"query": "x"},
                headers={"Authorization": f"Bearer {make_token(scopes='aiml:read')}"},
            )
        assert resp.status_code == 503
        assert resp.json()["error"]["code"] == "not_configured"
    finally:
        get_settings.cache_clear()


@respx.mock
async def test_semantic_search_requires_read_scope(jwks_payload, configure_search):
    respx.get(JWKS_URL).mock(return_value=Response(200, json=jwks_payload))
    with TestClient(app) as client:
        resp = client.post(
            "/v1/search/semantic",
            json={"query": "x"},
            headers={"Authorization": f"Bearer {make_token(scopes='other:scope')}"},
        )
    assert resp.status_code == 403
