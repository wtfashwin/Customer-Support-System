"""OpenAI / Azure OpenAI async client with retries + audit hooks.

Implementation completed in CP5; this module defines the public surface
imported by routes."""

from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass
from typing import Any, Iterable

from openai import AsyncAzureOpenAI, AsyncOpenAI
from openai import APIConnectionError, RateLimitError
from tenacity import (
    AsyncRetrying,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from app.config import settings
from app.core.exceptions import NotConfigured, UpstreamError
from app.core.middleware import record_ai_call


@dataclass
class EmbedResult:
    vectors: list[list[float]]
    model: str
    tokens: int


_client: AsyncOpenAI | AsyncAzureOpenAI | None = None


def _build_client() -> AsyncOpenAI | AsyncAzureOpenAI:
    if settings.openai_provider == "azure":
        if not settings.azure_openai_endpoint or not settings.azure_openai_api_key:
            raise NotConfigured("Azure OpenAI is not configured")
        return AsyncAzureOpenAI(
            api_key=settings.azure_openai_api_key,
            azure_endpoint=settings.azure_openai_endpoint,
            api_version="2024-08-01-preview",
        )
    if not settings.openai_api_key:
        raise NotConfigured("OPENAI_API_KEY is not configured")
    return AsyncOpenAI(api_key=settings.openai_api_key)


def get_client() -> AsyncOpenAI | AsyncAzureOpenAI:
    global _client
    if _client is None:
        _client = _build_client()
    return _client


def reset_client() -> None:
    """Test-only: drop the cached client so settings changes take effect."""

    global _client
    _client = None


_RETRYABLE = (RateLimitError, APIConnectionError)


def _hash_prompt(payload: Any) -> str:
    raw = json.dumps(payload, sort_keys=True, default=str).encode()
    return "sha256:" + hashlib.sha256(raw).hexdigest()[:32]


async def _retry_call(coro_factory):
    async for attempt in AsyncRetrying(
        retry=retry_if_exception_type(_RETRYABLE),
        wait=wait_exponential(multiplier=1, min=1, max=30),
        stop=stop_after_attempt(5),
        reraise=True,
    ):
        with attempt:
            return await coro_factory()


async def embed_texts(texts: list[str]) -> EmbedResult:
    """Embed a list of texts. Identical (model, texts) pairs are cached
    in Redis with TTL = settings.cache_ttl_seconds, so back-to-back calls
    with the same input do not hit OpenAI."""

    from app.services.cache import get_or_set, make_key

    model = settings.openai_embed_model
    cache_key = make_key(model=model, payload={"op": "embed", "texts": texts})

    async def _fetch() -> dict[str, Any]:
        client = get_client()
        started = time.perf_counter()
        try:
            response = await _retry_call(
                lambda: client.embeddings.create(model=model, input=texts)
            )
        except _RETRYABLE as exc:
            record_ai_call(
                model=model,
                prompt_hash=_hash_prompt({"texts": texts}),
                tokens_in=0,
                tokens_out=0,
                latency_ms=int((time.perf_counter() - started) * 1000),
                status="error",
                error=str(exc),
            )
            raise UpstreamError(f"OpenAI embeddings failed: {exc}") from exc

        vectors = [d.embedding for d in response.data]
        tokens = getattr(response.usage, "total_tokens", 0) or 0
        record_ai_call(
            model=model,
            prompt_hash=_hash_prompt({"texts": texts}),
            tokens_in=tokens,
            tokens_out=0,
            latency_ms=int((time.perf_counter() - started) * 1000),
            status="ok",
        )
        return {"vectors": vectors, "model": model, "tokens": tokens}

    payload, _hit = await get_or_set(cache_key, _fetch)
    return EmbedResult(
        vectors=payload["vectors"],
        model=payload["model"],
        tokens=payload["tokens"],
    )


async def chat_complete(
    messages: list[dict[str, Any]],
    *,
    model: str | None = None,
    response_format: dict[str, Any] | None = None,
    temperature: float = 0.0,
) -> dict[str, Any]:
    client = get_client()
    chosen = model or settings.openai_chat_model
    started = time.perf_counter()
    kwargs: dict[str, Any] = {
        "model": chosen,
        "messages": messages,
        "temperature": temperature,
    }
    if response_format is not None:
        kwargs["response_format"] = response_format

    try:
        response = await _retry_call(lambda: client.chat.completions.create(**kwargs))
    except _RETRYABLE as exc:
        record_ai_call(
            model=chosen,
            prompt_hash=_hash_prompt(messages),
            tokens_in=0,
            tokens_out=0,
            latency_ms=int((time.perf_counter() - started) * 1000),
            status="error",
            error=str(exc),
        )
        raise UpstreamError(f"OpenAI chat failed: {exc}") from exc

    content = response.choices[0].message.content or ""
    usage = response.usage
    tokens_in = getattr(usage, "prompt_tokens", 0) or 0
    tokens_out = getattr(usage, "completion_tokens", 0) or 0
    record_ai_call(
        model=chosen,
        prompt_hash=_hash_prompt(messages),
        tokens_in=tokens_in,
        tokens_out=tokens_out,
        latency_ms=int((time.perf_counter() - started) * 1000),
        status="ok",
    )
    return {
        "content": content,
        "model": chosen,
        "tokens_in": tokens_in,
        "tokens_out": tokens_out,
    }


async def chat_stream(
    messages: list[dict[str, Any]],
    *,
    model: str | None = None,
    temperature: float = 0.0,
) -> Iterable[str]:
    client = get_client()
    chosen = model or settings.openai_chat_model
    stream = await client.chat.completions.create(
        model=chosen,
        messages=messages,
        temperature=temperature,
        stream=True,
    )
    async for chunk in stream:
        try:
            delta = chunk.choices[0].delta.content or ""
        except (AttributeError, IndexError):
            delta = ""
        if delta:
            yield delta


async def openai_ping() -> bool:
    client = get_client()
    try:
        await client.embeddings.create(
            model=settings.openai_embed_model,
            input=["ok"],
        )
        return True
    except Exception as exc:
        raise UpstreamError(f"OpenAI ping failed: {exc}") from exc
