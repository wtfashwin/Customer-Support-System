import time
from typing import Any

import httpx
from jose import jwt
from jose.exceptions import ExpiredSignatureError, JWTError

from app.config import settings
from app.core.exceptions import InvalidToken, TokenExpired, Unauthenticated

_JWKS_CACHE_TTL = 3600  # 1h


class JWKSCache:
    def __init__(self, ttl_seconds: int = _JWKS_CACHE_TTL) -> None:
        self.ttl = ttl_seconds
        self._keys: dict[str, Any] | None = None
        self._fetched_at: float = 0

    async def get(self, http: httpx.AsyncClient | None = None) -> dict[str, Any]:
        now = time.monotonic()
        if self._keys is not None and (now - self._fetched_at) < self.ttl:
            return self._keys
        url = settings.jwks_url
        if not url:
            raise Unauthenticated("Auth0 not configured")
        client = http or httpx.AsyncClient(timeout=5.0)
        try:
            resp = await client.get(url)
            resp.raise_for_status()
            self._keys = resp.json()
            self._fetched_at = now
            return self._keys
        finally:
            if http is None:
                await client.aclose()

    def clear(self) -> None:
        self._keys = None
        self._fetched_at = 0


jwks_cache = JWKSCache()


def _find_key(jwks: dict[str, Any], kid: str) -> dict[str, Any] | None:
    for key in jwks.get("keys", []):
        if key.get("kid") == kid:
            return key
    return None


async def verify_token(token: str, *, http: httpx.AsyncClient | None = None) -> dict[str, Any]:
    """Verify an Auth0 JWT and return its claims.

    Raises InvalidToken / TokenExpired / Unauthenticated on failure."""
    if not token:
        raise Unauthenticated("Missing bearer token")

    if not settings.auth0_domain or not settings.auth0_audience:
        raise Unauthenticated("Auth0 not configured")

    try:
        unverified_header = jwt.get_unverified_header(token)
    except JWTError as exc:
        raise InvalidToken(f"Malformed token header: {exc}") from exc

    kid = unverified_header.get("kid")
    if not kid:
        raise InvalidToken("Missing kid in token header")

    jwks = await jwks_cache.get(http=http)
    key = _find_key(jwks, kid)
    if key is None:
        # Try one refresh in case of key rotation
        jwks_cache.clear()
        jwks = await jwks_cache.get(http=http)
        key = _find_key(jwks, kid)
        if key is None:
            raise InvalidToken("Signing key not found for kid")

    try:
        claims = jwt.decode(
            token,
            key,
            algorithms=[unverified_header.get("alg", "RS256")],
            audience=settings.auth0_audience,
            issuer=settings.auth0_issuer,
        )
    except ExpiredSignatureError as exc:
        raise TokenExpired("Token has expired") from exc
    except JWTError as exc:
        raise InvalidToken(f"Token verification failed: {exc}") from exc

    return claims


def extract_scopes(claims: dict[str, Any]) -> set[str]:
    scope = claims.get("scope") or ""
    if isinstance(scope, list):
        return set(scope)
    return set(s for s in scope.split() if s)
