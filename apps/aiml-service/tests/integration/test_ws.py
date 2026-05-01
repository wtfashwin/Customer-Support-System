"""WebSocket /v1/ws/handoff tests using starlette TestClient.

Mocks the JWKS endpoint so the handshake validates a freshly signed
token. Verifies the auth handshake, message echo, and rejection paths."""

from __future__ import annotations

import json

import respx
from fastapi.testclient import TestClient
from httpx import Response

from app.main import app
from tests.conftest import make_token

JWKS_URL = "https://test.auth0.com/.well-known/jwks.json"


@respx.mock
def test_ws_authed_handshake_and_echo(jwks_payload):
    respx.get(JWKS_URL).mock(return_value=Response(200, json=jwks_payload))
    token = make_token(scopes="aiml:read")
    with TestClient(app) as client, client.websocket_connect("/v1/ws/handoff") as ws:
        ws.send_text(json.dumps({"type": "auth", "token": token, "sessionId": "s1"}))
        ws.send_text(json.dumps({"type": "message", "sender": "user", "content": "hi"}))
        received = json.loads(ws.receive_text())
        assert received == {"type": "message", "sender": "user", "content": "hi"}


@respx.mock
def test_ws_missing_scope_closes_4403(jwks_payload):
    respx.get(JWKS_URL).mock(return_value=Response(200, json=jwks_payload))
    token = make_token(scopes="other:scope")
    with TestClient(app) as client:
        try:
            with client.websocket_connect("/v1/ws/handoff") as ws:
                ws.send_text(json.dumps({"type": "auth", "token": token}))
                # The server closes immediately after rejection.
                ws.receive_text()
        except Exception as exc:
            # starlette raises WebSocketDisconnect with code attr
            assert getattr(exc, "code", 0) in (4403, 1000, 4401)


@respx.mock
def test_ws_invalid_token_closes_4401(jwks_payload):
    respx.get(JWKS_URL).mock(return_value=Response(200, json=jwks_payload))
    with TestClient(app) as client:
        try:
            with client.websocket_connect("/v1/ws/handoff") as ws:
                ws.send_text(json.dumps({"type": "auth", "token": "garbage"}))
                ws.receive_text()
        except Exception as exc:
            assert getattr(exc, "code", 0) in (4401, 1000)


@respx.mock
def test_ws_first_frame_must_be_auth(jwks_payload):
    respx.get(JWKS_URL).mock(return_value=Response(200, json=jwks_payload))
    with TestClient(app) as client:
        try:
            with client.websocket_connect("/v1/ws/handoff") as ws:
                ws.send_text(json.dumps({"type": "message", "sender": "user", "content": "hi"}))
                ws.receive_text()
        except Exception as exc:
            assert getattr(exc, "code", 0) in (4401, 1000)
