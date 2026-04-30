from typing import Any


class AIMLError(Exception):
    """Base error with structured envelope payload."""

    code: str = "internal_error"
    status_code: int = 500

    def __init__(self, message: str, *, code: str | None = None, status_code: int | None = None,
                 details: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.message = message
        if code is not None:
            self.code = code
        if status_code is not None:
            self.status_code = status_code
        self.details = details or {}


class ValidationFailed(AIMLError):
    code = "validation_failed"
    status_code = 400


class Unauthenticated(AIMLError):
    code = "unauthenticated"
    status_code = 401


class TokenExpired(Unauthenticated):
    code = "token_expired"


class InvalidToken(Unauthenticated):
    code = "invalid_token"


class Forbidden(AIMLError):
    code = "forbidden"
    status_code = 403


class MissingScope(Forbidden):
    code = "missing_scope"


class NotFound(AIMLError):
    code = "not_found"
    status_code = 404


class PayloadTooLarge(AIMLError):
    code = "payload_too_large"
    status_code = 413


class UnsupportedMediaType(AIMLError):
    code = "unsupported_media_type"
    status_code = 415


class RateLimited(AIMLError):
    code = "rate_limited"
    status_code = 429


class UpstreamError(AIMLError):
    code = "upstream_error"
    status_code = 502


class NotReady(AIMLError):
    code = "not_ready"
    status_code = 503


class NotConfigured(AIMLError):
    code = "not_configured"
    status_code = 503
