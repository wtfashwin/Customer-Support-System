"""Unit-level coverage for /v1/rag/ingest. Stubs the heavy LlamaIndex
pipeline so CI doesn't need pgvector. The full integration test that
hits a real Postgres lives in tests/integration/test_ingest.py and is
gated on the `integration` marker."""

import respx
from fastapi.testclient import TestClient
from httpx import Response

from app.main import app
from tests.conftest import make_token

JWKS_URL = "https://test.auth0.com/.well-known/jwks.json"


@respx.mock
async def test_ingest_route_calls_service(jwks_payload, monkeypatch):
    respx.get(JWKS_URL).mock(return_value=Response(200, json=jwks_payload))

    captured: dict = {}

    async def fake_ingest(documents):
        captured["docs"] = documents
        return {"ingested": len(documents), "nodes": len(documents) * 3}

    import app.services.llamaindex_index as li_module

    monkeypatch.setattr(li_module, "ingest_documents", fake_ingest)

    body = {
        "documents": [
            {"id": "doc-1", "text": "hello world", "metadata": {"src": "faq"}},
            {"id": "doc-2", "text": "another doc", "metadata": {}},
        ]
    }

    with TestClient(app) as client:
        resp = client.post(
            "/v1/rag/ingest",
            json=body,
            headers={"Authorization": f"Bearer {make_token(scopes='aiml:write')}"},
        )
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"ingested": 2, "nodes": 6}
    assert captured["docs"][0]["id"] == "doc-1"


@respx.mock
async def test_ingest_requires_write_scope(jwks_payload):
    respx.get(JWKS_URL).mock(return_value=Response(200, json=jwks_payload))
    with TestClient(app) as client:
        resp = client.post(
            "/v1/rag/ingest",
            json={"documents": [{"id": "x", "text": "y", "metadata": {}}]},
            headers={"Authorization": f"Bearer {make_token(scopes='aiml:read')}"},
        )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "missing_scope"


@respx.mock
async def test_ingest_validates_doc_count(jwks_payload, monkeypatch):
    respx.get(JWKS_URL).mock(return_value=Response(200, json=jwks_payload))

    async def fake_ingest(documents):
        return {"ingested": len(documents), "nodes": len(documents)}

    import app.services.llamaindex_index as li_module

    monkeypatch.setattr(li_module, "ingest_documents", fake_ingest)

    over_limit = {"documents": [{"id": str(i), "text": "x", "metadata": {}} for i in range(101)]}
    with TestClient(app) as client:
        resp = client.post(
            "/v1/rag/ingest",
            json=over_limit,
            headers={"Authorization": f"Bearer {make_token(scopes='aiml:write')}"},
        )
    assert resp.status_code == 400


@respx.mock
async def test_ingest_rejects_empty_documents(jwks_payload):
    respx.get(JWKS_URL).mock(return_value=Response(200, json=jwks_payload))
    with TestClient(app) as client:
        resp = client.post(
            "/v1/rag/ingest",
            json={"documents": []},
            headers={"Authorization": f"Bearer {make_token(scopes='aiml:write')}"},
        )
    # Empty list violates pydantic min_length=1.
    assert resp.status_code in (400, 422)
