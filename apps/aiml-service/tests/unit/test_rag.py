"""Unit tests for /v1/rag/query SSE streaming.

The retriever and the OpenAI streaming chat are stubbed so the test
exercises the SSE event sequence end-to-end without any network calls."""

from __future__ import annotations

import json

import respx
from fastapi.testclient import TestClient
from httpx import Response

from app.main import app
from tests.conftest import make_token

JWKS_URL = "https://test.auth0.com/.well-known/jwks.json"


def _parse_sse(body: str) -> list[tuple[str, dict]]:
    """Return list of (event_name, parsed_data_dict) from an SSE stream body."""

    events: list[tuple[str, dict]] = []
    current_event = "message"
    current_data: list[str] = []
    for raw_line in body.splitlines():
        if not raw_line:
            if current_data:
                joined = "\n".join(current_data)
                try:
                    payload = json.loads(joined)
                except json.JSONDecodeError:
                    payload = {"raw": joined}
                events.append((current_event, payload))
            current_event = "message"
            current_data = []
            continue
        if raw_line.startswith("event:"):
            current_event = raw_line.split(":", 1)[1].strip()
        elif raw_line.startswith("data:"):
            current_data.append(raw_line.split(":", 1)[1].lstrip())
    if current_data:
        try:
            payload = json.loads("\n".join(current_data))
        except json.JSONDecodeError:
            payload = {"raw": "\n".join(current_data)}
        events.append((current_event, payload))
    return events


@respx.mock
async def test_query_streams_token_then_done(jwks_payload, monkeypatch):
    respx.get(JWKS_URL).mock(return_value=Response(200, json=jwks_payload))

    async def fake_retrieve(*, query: str, top_k: int, filter):
        return [
            {"id": "src-1", "score": 0.91, "metadata": {"src": "kb"}, "snippet": "Refunds within 30 days."}
        ]

    async def fake_stream(messages, **kwargs):
        for tok in ("Refunds ", "are ", "available."):
            yield tok

    import app.services.langchain_rag as rag_module
    import app.services.openai_client as openai_module

    monkeypatch.setattr(rag_module, "_retrieve_sources", fake_retrieve)
    monkeypatch.setattr(openai_module, "chat_stream", fake_stream)

    with TestClient(app) as client, client.stream(
        "POST",
        "/v1/rag/query",
        json={"query": "refund?", "top_k": 1},
        headers={"Authorization": f"Bearer {make_token(scopes='aiml:read')}"},
    ) as resp:
        assert resp.status_code == 200
        body = b"".join(resp.iter_bytes()).decode()

    events = _parse_sse(body)
    names = [e[0] for e in events]
    assert names.count("source") == 1
    assert names.count("token") == 3
    assert names.count("done") == 1
    # done payload contains assembled answer
    done = next(p for n, p in events if n == "done")
    assert done["answer"] == "Refunds are available."
    assert done["sources"][0]["id"] == "src-1"


@respx.mock
async def test_query_requires_read_scope(jwks_payload):
    respx.get(JWKS_URL).mock(return_value=Response(200, json=jwks_payload))
    with TestClient(app) as client:
        resp = client.post(
            "/v1/rag/query",
            json={"query": "x"},
            headers={"Authorization": f"Bearer {make_token(scopes='aiml:write')}"},
        )
    # Token has only aiml:write, route requires aiml:read -> 403.
    assert resp.status_code == 403


@respx.mock
async def test_query_emits_error_event_when_stream_fails(jwks_payload, monkeypatch):
    respx.get(JWKS_URL).mock(return_value=Response(200, json=jwks_payload))

    async def fake_retrieve(*, query, top_k, filter):
        return []

    async def boom(messages, **kwargs):
        if False:
            yield ""  # make this an async generator
        raise RuntimeError("upstream blew up")

    import app.services.langchain_rag as rag_module
    import app.services.openai_client as openai_module

    monkeypatch.setattr(rag_module, "_retrieve_sources", fake_retrieve)
    monkeypatch.setattr(openai_module, "chat_stream", boom)

    with TestClient(app) as client, client.stream(
        "POST",
        "/v1/rag/query",
        json={"query": "refund?"},
        headers={"Authorization": f"Bearer {make_token(scopes='aiml:read')}"},
    ) as resp:
        body = b"".join(resp.iter_bytes()).decode()

    events = _parse_sse(body)
    error = next((p for n, p in events if n == "error"), None)
    assert error is not None
    assert "blew up" in error.get("message", "")
