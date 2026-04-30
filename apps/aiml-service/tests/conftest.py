import base64
import os
import time
from collections.abc import Iterator
from typing import Any

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from jose import jwt as jose_jwt

# Force test environment defaults BEFORE importing app modules.
os.environ.setdefault("AUTH0_DOMAIN", "test.auth0.com")
os.environ.setdefault("AUTH0_AUDIENCE", "https://aiml.test")
os.environ.setdefault("OPENAI_API_KEY", "sk-test")
os.environ.setdefault("OPENAI_PROVIDER", "openai")
os.environ.setdefault(
    "DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/aiml_test"
)
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/15")
os.environ.setdefault("ENVIRONMENT", "test")


def _b64u(value: int) -> str:
    byte_len = (value.bit_length() + 7) // 8
    return base64.urlsafe_b64encode(value.to_bytes(byte_len, "big")).rstrip(b"=").decode()


_KEY_BUNDLE: dict[str, Any] | None = None


def _build_keys() -> dict[str, Any]:
    global _KEY_BUNDLE
    if _KEY_BUNDLE is not None:
        return _KEY_BUNDLE
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = private.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    public = private.public_key()
    numbers = public.public_numbers()
    jwk = {
        "kty": "RSA",
        "kid": "testkey",
        "use": "sig",
        "alg": "RS256",
        "n": _b64u(numbers.n),
        "e": _b64u(numbers.e),
    }
    _KEY_BUNDLE = {"pem": pem, "jwk": jwk}
    return _KEY_BUNDLE


def make_token(
    *,
    sub: str = "auth0|test-user",
    scopes: str = "aiml:read aiml:write",
    aud: str = "https://aiml.test",
    iss: str = "https://test.auth0.com/",
    exp_offset: int = 3600,
    extra: dict[str, Any] | None = None,
) -> str:
    bundle = _build_keys()
    now = int(time.time())
    payload: dict[str, Any] = {
        "sub": sub,
        "iss": iss,
        "aud": aud,
        "iat": now,
        "exp": now + exp_offset,
        "scope": scopes,
    }
    if extra:
        payload.update(extra)
    return jose_jwt.encode(
        payload, bundle["pem"], algorithm="RS256", headers={"kid": "testkey"}
    )


@pytest.fixture(autouse=True)
def _reset_jwks_cache() -> Iterator[None]:
    from app.auth.jwt import jwks_cache

    jwks_cache.clear()
    yield
    jwks_cache.clear()


@pytest.fixture(autouse=True)
def _reset_openai_client() -> Iterator[None]:
    from app.services.openai_client import reset_client

    reset_client()
    yield
    reset_client()


@pytest.fixture
def test_jwk() -> dict[str, Any]:
    return _build_keys()["jwk"]


@pytest.fixture
def jwks_payload(test_jwk) -> dict[str, Any]:
    return {"keys": [test_jwk]}


@pytest.fixture
def auth_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token()}"}


@pytest.fixture
def admin_headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {make_token(scopes='aiml:read aiml:write aiml:admin')}",
    }
