import respx
from httpx import Response

from app.auth.jwt import verify_token
from app.auth.rbac import require_scopes
from app.core.exceptions import (
    InvalidToken,
    MissingScope,
    TokenExpired,
    Unauthenticated,
)
from tests.conftest import make_token

JWKS_URL = "https://test.auth0.com/.well-known/jwks.json"


@respx.mock
async def test_valid_token_decodes(jwks_payload):
    respx.get(JWKS_URL).mock(return_value=Response(200, json=jwks_payload))
    token = make_token()
    claims = await verify_token(token)
    assert claims["sub"] == "auth0|test-user"
    assert "aiml:read" in claims["scope"]


@respx.mock
async def test_expired_token_raises(jwks_payload):
    respx.get(JWKS_URL).mock(return_value=Response(200, json=jwks_payload))
    token = make_token(exp_offset=-60)
    try:
        await verify_token(token)
    except TokenExpired:
        return
    raise AssertionError("expected TokenExpired")


@respx.mock
async def test_wrong_issuer_raises(jwks_payload):
    respx.get(JWKS_URL).mock(return_value=Response(200, json=jwks_payload))
    token = make_token(iss="https://attacker.example.com/")
    try:
        await verify_token(token)
    except InvalidToken:
        return
    raise AssertionError("expected InvalidToken")


@respx.mock
async def test_wrong_audience_raises(jwks_payload):
    respx.get(JWKS_URL).mock(return_value=Response(200, json=jwks_payload))
    token = make_token(aud="https://other.example.com")
    try:
        await verify_token(token)
    except InvalidToken:
        return
    raise AssertionError("expected InvalidToken")


@respx.mock
async def test_missing_scope_raises(jwks_payload):
    respx.get(JWKS_URL).mock(return_value=Response(200, json=jwks_payload))
    dep = require_scopes("aiml:admin")
    token = make_token(scopes="aiml:read aiml:write")
    try:
        await dep(authorization=f"Bearer {token}")
    except MissingScope:
        return
    raise AssertionError("expected MissingScope")


async def test_missing_authorization_header_raises():
    dep = require_scopes("aiml:read")
    try:
        await dep(authorization=None)
    except Unauthenticated:
        return
    raise AssertionError("expected Unauthenticated")


@respx.mock
async def test_unknown_kid_refreshes_jwks(jwks_payload):
    """If the signing kid isn't in cache, the cache should be refreshed once."""

    route = respx.get(JWKS_URL).mock(return_value=Response(200, json=jwks_payload))
    token = make_token()
    # First call populates cache.
    await verify_token(token)
    # Mutate cache to simulate stale entry; second verify should re-fetch.
    from app.auth.jwt import jwks_cache

    jwks_cache._keys = {"keys": [{"kid": "stale", "kty": "RSA", "n": "x", "e": "AQAB"}]}
    await verify_token(token)
    assert route.call_count >= 2
