import respx
from fastapi.testclient import TestClient
from httpx import Response

from app.main import app
from tests.conftest import make_token

JWKS_URL = "https://test.auth0.com/.well-known/jwks.json"
EMBED_URL = "https://api.openai.com/v1/embeddings"


def _embedding_response(vectors: list[list[float]], tokens: int = 8) -> dict:
    return {
        "object": "list",
        "model": "text-embedding-3-small",
        "data": [{"object": "embedding", "embedding": v, "index": i} for i, v in enumerate(vectors)],
        "usage": {"prompt_tokens": tokens, "total_tokens": tokens},
    }


@respx.mock
async def test_embed_route_returns_vectors(jwks_payload):
    respx.get(JWKS_URL).mock(return_value=Response(200, json=jwks_payload))
    vectors = [[0.1] * 1536, [0.2] * 1536]
    respx.post(EMBED_URL).mock(
        return_value=Response(200, json=_embedding_response(vectors))
    )

    with TestClient(app) as client:
        resp = client.post(
            "/v1/embed",
            json={"texts": ["hello", "world"]},
            headers={"Authorization": f"Bearer {make_token(scopes='aiml:write')}"},
        )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert len(data["vectors"]) == 2
    assert len(data["vectors"][0]) == 1536
    assert data["model"] == "text-embedding-3-small"
    assert data["tokens"] == 8


@respx.mock
async def test_embed_requires_write_scope(jwks_payload):
    respx.get(JWKS_URL).mock(return_value=Response(200, json=jwks_payload))
    with TestClient(app) as client:
        resp = client.post(
            "/v1/embed",
            json={"texts": ["hello"]},
            headers={"Authorization": f"Bearer {make_token(scopes='aiml:read')}"},
        )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "missing_scope"


@respx.mock
async def test_embed_validates_max_items(jwks_payload):
    respx.get(JWKS_URL).mock(return_value=Response(200, json=jwks_payload))
    with TestClient(app) as client:
        resp = client.post(
            "/v1/embed",
            json={"texts": ["x"] * 257},
            headers={"Authorization": f"Bearer {make_token(scopes='aiml:write')}"},
        )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "validation_failed"


@respx.mock
async def test_embed_validates_max_chars(jwks_payload):
    respx.get(JWKS_URL).mock(return_value=Response(200, json=jwks_payload))
    with TestClient(app) as client:
        resp = client.post(
            "/v1/embed",
            json={"texts": ["x" * 8193]},
            headers={"Authorization": f"Bearer {make_token(scopes='aiml:write')}"},
        )
    assert resp.status_code == 400


async def test_embed_requires_auth():
    with TestClient(app) as client:
        resp = client.post("/v1/embed", json={"texts": ["hi"]})
    assert resp.status_code == 401


@respx.mock
async def test_embed_retries_on_rate_limit(jwks_payload):
    respx.get(JWKS_URL).mock(return_value=Response(200, json=jwks_payload))
    vectors = [[0.5] * 1536]
    route = respx.post(EMBED_URL).mock(
        side_effect=[
            Response(429, json={"error": {"message": "rate limited", "type": "rate_limit_error"}}),
            Response(200, json=_embedding_response(vectors)),
        ]
    )

    with TestClient(app) as client:
        resp = client.post(
            "/v1/embed",
            json={"texts": ["hi"]},
            headers={"Authorization": f"Bearer {make_token(scopes='aiml:write')}"},
        )
    assert resp.status_code == 200
    assert route.call_count == 2
