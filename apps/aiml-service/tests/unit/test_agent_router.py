"""Unit tests for /v1/agents/route — verify the classifier resolves
6 sample utterances to the expected agent. The OpenAI chat completion
is mocked via respx so the test is deterministic and offline."""

from __future__ import annotations

import json

import pytest
import respx
from fastapi.testclient import TestClient
from httpx import Response

from app.main import app
from tests.conftest import make_token

JWKS_URL = "https://test.auth0.com/.well-known/jwks.json"
CHAT_URL = "https://api.openai.com/v1/chat/completions"


def _chat_response(payload: dict) -> dict:
    return {
        "id": "chatcmpl-test",
        "object": "chat.completion",
        "model": "gpt-4o-mini",
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": json.dumps(payload)},
                "finish_reason": "stop",
            }
        ],
        "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
    }


CASES: list[tuple[str, str]] = [
    ("I want a refund for order 1234", "billing"),
    ("Where is my order? It's been 5 days.", "order"),
    ("How do I reset my password?", "support"),
    ("My credit card was charged twice for the same invoice.", "billing"),
    ("Can you check the tracking status of my shipment?", "order"),
    ("The website keeps logging me out — what's going on?", "support"),
]


@pytest.mark.parametrize("message,expected", CASES)
@respx.mock
async def test_router_classifies_utterance(jwks_payload, message: str, expected: str):
    respx.get(JWKS_URL).mock(return_value=Response(200, json=jwks_payload))
    respx.post(CHAT_URL).mock(
        return_value=Response(
            200,
            json=_chat_response(
                {"agent": expected, "confidence": 0.92, "reasoning": "test"}
            ),
        )
    )

    with TestClient(app) as client:
        resp = client.post(
            "/v1/agents/route",
            json={"message": message, "history": []},
            headers={"Authorization": f"Bearer {make_token(scopes='aiml:read')}"},
        )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["agent"] == expected
    assert 0.0 <= data["confidence"] <= 1.0
    assert data["reasoning"]


@respx.mock
async def test_router_falls_back_on_invalid_json(jwks_payload):
    """If the model returns garbage, classifier defaults to 'support'."""

    respx.get(JWKS_URL).mock(return_value=Response(200, json=jwks_payload))
    bad = {
        "id": "chatcmpl-test",
        "object": "chat.completion",
        "model": "gpt-4o-mini",
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": "not-json"},
                "finish_reason": "stop",
            }
        ],
        "usage": {"prompt_tokens": 5, "completion_tokens": 1, "total_tokens": 6},
    }
    respx.post(CHAT_URL).mock(return_value=Response(200, json=bad))

    with TestClient(app) as client:
        resp = client.post(
            "/v1/agents/route",
            json={"message": "anything", "history": []},
            headers={"Authorization": f"Bearer {make_token(scopes='aiml:read')}"},
        )
    assert resp.status_code == 200
    assert resp.json()["agent"] == "support"


@respx.mock
async def test_router_unknown_agent_value_falls_back_to_support(jwks_payload):
    respx.get(JWKS_URL).mock(return_value=Response(200, json=jwks_payload))
    respx.post(CHAT_URL).mock(
        return_value=Response(
            200,
            json=_chat_response({"agent": "marketing", "confidence": 0.9, "reasoning": "?"}),
        )
    )

    with TestClient(app) as client:
        resp = client.post(
            "/v1/agents/route",
            json={"message": "x", "history": []},
            headers={"Authorization": f"Bearer {make_token(scopes='aiml:read')}"},
        )
    assert resp.status_code == 200
    assert resp.json()["agent"] == "support"
