# AIML Service API Contract

**Owner:** Dev 1 (`apps/aiml-service`)
**Consumers:** Dev 2 (Hono auth proxy, Helm/Compose), Web client (via Hono `/api/rag/*`).
**Status:** Authoritative — any change requires a follow-up PR updating this doc.
**Base URL (in-cluster):** `http://aiml-service:8000`
**Base URL (Hono proxy):** `https://<api-host>/api/rag/*`

This document is the single source of truth for the Python FastAPI AIML service exposed at `apps/aiml-service`. Dev 2 wires Helm, Docker Compose, and Auth0 middleware against this contract; the Hono API proxies a subset under `/api/rag/*` after attaching/forwarding the bearer token.

---

## 1. Conventions

### 1.1 Versioning

- All routes (except `/health` and `/ready`) are prefixed with `/v1`.
- Breaking changes ship under a new prefix (`/v2`); additive changes stay on `/v1`.

### 1.2 Authentication

Every `/v1/*` endpoint requires:

```
Authorization: Bearer <Auth0 JWT>
```

The service validates:

| Claim | Rule |
| --- | --- |
| `iss` | Must equal `https://${AUTH0_DOMAIN}/` |
| `aud` | Must contain `${AUTH0_AUDIENCE}` |
| `exp` | Must be in the future |
| Signature | Verified against JWKS at `https://${AUTH0_DOMAIN}/.well-known/jwks.json` (cached 1h) |

JWKS keys are cached in-process for 1 hour. Signing-key rotations are picked up on cache expiry or 401 retry.

### 1.3 Authorization (scopes)

Scopes are read from the JWT `scope` claim (space-delimited string, per RFC 8693 §4.2).

| Scope | Purpose |
| --- | --- |
| `aiml:read` | Read-only inference/query routes |
| `aiml:write` | Routes that ingest data or mutate state |
| `aiml:admin` | Audit log access and admin views |

A route declared as `aiml:write` requires that scope **and only that scope** unless explicitly noted; it does not implicitly grant `aiml:read`.

### 1.4 Request ID

Every request has a `x-request-id` header. The service:

1. Reads the inbound header if present, otherwise generates a UUIDv4.
2. Echoes it on the response.
3. Includes it in every structured log line and the error envelope.

### 1.5 Error envelope

All non-2xx JSON responses use:

```json
{
  "error": {
    "code": "string_enum",
    "message": "Human-readable description",
    "requestId": "uuid"
  }
}
```

| HTTP | `code` examples | When |
| --- | --- | --- |
| 400 | `invalid_request`, `validation_failed` | Body/query/path validation |
| 401 | `unauthenticated`, `invalid_token`, `token_expired` | JWT issues |
| 403 | `forbidden`, `missing_scope` | Scope enforcement |
| 404 | `not_found` | Unknown resource |
| 413 | `payload_too_large` | Multipart upload over limit |
| 415 | `unsupported_media_type` | Wrong content-type |
| 429 | `rate_limited` | Upstream or local throttling |
| 500 | `internal_error` | Unhandled exception |
| 502 | `upstream_error` | OpenAI / Azure failure after retries |
| 503 | `not_ready` | Readiness check failing |

### 1.6 SSE event names (streaming routes)

Streaming endpoints use `text/event-stream` with the following named events:

| Event | Payload | When |
| --- | --- | --- |
| `token` | `{ "delta": "string" }` | Per token of the model output |
| `source` | `{ "id": "string", "score": float, "metadata": object, "snippet": "string" }` | Once per retrieved source, before any `token` |
| `done` | `{ "answer": "string", "sources": [...], "tokens": { "prompt": int, "completion": int }, "latency_ms": int }` | Final summary |
| `error` | `{ "code": "string", "message": "string" }` | Recoverable streaming error; client should close |

All payloads are JSON-encoded in the SSE `data:` field.

### 1.7 Limits

| Resource | Limit |
| --- | --- |
| `/v1/embed` `texts` count | 256 |
| `/v1/embed` per-item length | 8192 chars |
| `/v1/document/analyze` upload size | 20 MB |
| `/v1/rag/ingest` documents per request | 100 |
| Chat history length (`/v1/agents/route`) | 32 messages |
| Default request timeout | 60s (300s for `/v1/document/analyze`) |

---

## 2. Endpoints

### 2.1 `GET /health` — liveness

- **Auth:** none
- **Response 200:** `{ "status": "ok" }`
- **Use:** Kubernetes liveness probe.

### 2.2 `GET /ready` — readiness

- **Auth:** none
- Performs a `SELECT 1` against Postgres and a 1-token OpenAI ping.
- **Response 200:**
  ```json
  { "status": "ok", "checks": { "db": "ok", "openai": "ok" } }
  ```
- **Response 503:** `{ "status": "degraded", "checks": { ... }, "error": { ... } }` (uses error envelope semantics).

### 2.3 `POST /v1/embed`

- **Scope:** `aiml:write`
- **Request:**
  ```json
  { "texts": ["string", "..."] }
  ```
- **Response 200:**
  ```json
  {
    "vectors": [[0.0123, ...]],
    "model": "text-embedding-3-small",
    "tokens": 128
  }
  ```
- Vectors are 1536-dim with `text-embedding-3-small`.

### 2.4 `POST /v1/rag/ingest`

- **Scope:** `aiml:write`
- **Request:**
  ```json
  {
    "documents": [
      {
        "id": "doc-1",
        "text": "Long-form text...",
        "metadata": { "source": "faq", "tags": ["billing"] }
      }
    ]
  }
  ```
- **Response 200:**
  ```json
  { "ingested": 1, "nodes": 7 }
  ```
- Chunks via `SentenceSplitter(chunk_size=512, chunk_overlap=64)`, embeds with the configured model, persists to `pgvector`.

### 2.5 `POST /v1/rag/query`

- **Scope:** `aiml:read`
- **Request:**
  ```json
  {
    "query": "How do I get a refund?",
    "top_k": 4,
    "filter": { "tags": ["billing"] }
  }
  ```
- **Response:** `text/event-stream`. Sequence:
  1. Zero or more `source` events (one per retrieved chunk).
  2. Zero or more `token` events (streaming model output).
  3. Exactly one `done` event.
- Errors after stream start are emitted as an `error` event then the stream closes.

### 2.6 `POST /v1/document/analyze`

- **Scope:** `aiml:write`
- **Request:** `multipart/form-data`
  - `file`: PDF or image (`application/pdf`, `image/png`, `image/jpeg`, `image/tiff`).
  - Max size: 20 MB.
- **Response 200:**
  ```json
  {
    "text": "Concatenated page text",
    "pages": [{ "page": 1, "text": "...", "width": 612, "height": 792 }],
    "tables": [{ "page": 1, "rows": [["..."]] }],
    "key_value_pairs": [{ "key": "Invoice Number", "value": "INV-001", "confidence": 0.97 }],
    "model": "prebuilt-layout"
  }
  ```
- Uses Azure Document Intelligence `prebuilt-layout`.

### 2.7 `POST /v1/search/semantic`

- **Scope:** `aiml:read`
- **Request:**
  ```json
  { "query": "string", "index": "customer-support", "top_k": 5 }
  ```
- **Response 200:**
  ```json
  {
    "hits": [
      {
        "id": "doc-1",
        "score": 0.87,
        "content": "...",
        "highlights": ["..."],
        "metadata": { "source": "kb" }
      }
    ],
    "total": 5
  }
  ```
- Hybrid (keyword + vector) via Azure AI Search semantic configuration `default`.

### 2.8 `POST /v1/agents/route`

- **Scope:** `aiml:read`
- **Request:**
  ```json
  {
    "message": "I want a refund for order 1234",
    "history": [
      { "role": "user", "content": "..." },
      { "role": "assistant", "content": "..." }
    ]
  }
  ```
- **Response 200:**
  ```json
  {
    "agent": "billing",
    "confidence": 0.93,
    "reasoning": "Refund-related → billing."
  }
  ```
- `agent` ∈ `{"support", "order", "billing"}`.

### 2.9 `POST /v1/feedback`

- **Scope:** `aiml:write`
- **Request:**
  ```json
  { "messageId": "msg-123", "rating": 5, "comment": "Helpful" }
  ```
- `rating` is an integer 1–5; `comment` optional.
- **Response 200:** `{ "id": "fb-abc", "createdAt": "ISO8601" }`

### 2.10 `GET /v1/audit/logs`

- **Scope:** `aiml:admin`
- **Query params:** `limit` (default 50, max 200), `cursor` (opaque), `userId`, `route`, `from`, `to` (ISO8601).
- **Response 200:**
  ```json
  {
    "items": [
      {
        "id": "uuid",
        "userId": "auth0|...",
        "route": "/v1/rag/query",
        "model": "gpt-4o-mini",
        "promptHash": "sha256:...",
        "tokensIn": 412,
        "tokensOut": 87,
        "costUsd": 0.000123,
        "latencyMs": 842,
        "status": "ok",
        "error": null,
        "createdAt": "ISO8601"
      }
    ],
    "nextCursor": "opaque-or-null"
  }
  ```

### 2.11 `WS /v1/ws/handoff`

- **Scope:** `aiml:read`
- **Handshake:** Client opens WebSocket. The first text message MUST be a JSON frame:
  ```json
  { "type": "auth", "token": "Bearer-style-or-raw-jwt", "sessionId": "uuid" }
  ```
- Server validates the JWT and scope. On failure, closes with code 4401 (`unauthenticated`) or 4403 (`missing_scope`).
- After auth, both sides exchange JSON frames:
  ```json
  { "type": "message", "sender": "agent|user|system", "content": "..." }
  { "type": "typing", "sender": "agent|user", "isTyping": true }
  { "type": "presence", "sender": "agent|user", "status": "online|offline" }
  ```
- Server-initiated close codes: `1000` normal, `4408` idle timeout (5 min no traffic), `4500` server error.

---

## 3. Hono proxy mapping (`apps/api`)

Hono exposes a strict subset under `/api/rag/*`. Auth is the same Auth0 JWT — Hono validates it and forwards the `Authorization` header to the AIML service unchanged.

| Hono route | Method | Proxies to | Notes |
| --- | --- | --- | --- |
| `/api/rag/query` | POST | `POST /v1/rag/query` | SSE pass-through |
| `/api/rag/ingest` | POST | `POST /v1/rag/ingest` | JSON pass-through |
| `/api/rag/document/analyze` | POST | `POST /v1/document/analyze` | multipart pass-through |

Other AIML endpoints are reached by internal services only and are not proxied.

---

## 4. Environment configuration

The service reads configuration from environment variables (`pydantic-settings`).

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres URL; service rewrites to `postgresql+asyncpg://` internally |
| `REDIS_URL` | yes | Used for response cache |
| `OPENAI_PROVIDER` | yes | `openai` or `azure` |
| `OPENAI_API_KEY` | conditionally | Required when `OPENAI_PROVIDER=openai` |
| `AZURE_OPENAI_ENDPOINT` | conditionally | Required when `OPENAI_PROVIDER=azure` |
| `AZURE_OPENAI_API_KEY` | conditionally | Required when `OPENAI_PROVIDER=azure` |
| `OPENAI_CHAT_MODEL` | yes | Default `gpt-4o-mini` |
| `OPENAI_EMBED_MODEL` | yes | Default `text-embedding-3-small` |
| `AZURE_DI_ENDPOINT` | for `/v1/document/analyze` | Azure Document Intelligence |
| `AZURE_DI_KEY` | for `/v1/document/analyze` | |
| `AZURE_SEARCH_ENDPOINT` | for `/v1/search/semantic` | |
| `AZURE_SEARCH_KEY` | for `/v1/search/semantic` | |
| `AUTH0_DOMAIN` | yes | e.g. `tenant.auth0.com` |
| `AUTH0_AUDIENCE` | yes | API identifier in Auth0 |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | no | Disables tracing if unset |
| `LOG_LEVEL` | no | Default `INFO` |

Routes that depend on Azure services return `503` with `code: "not_configured"` if the relevant env vars are missing, instead of crashing on startup.

---

## 5. Observability

- **Logs:** structured JSON via `structlog`, including `request_id`, `route`, `user_id`, `tokens_in`, `tokens_out`, `latency_ms`, `status`.
- **Tracing:** OpenTelemetry FastAPI + httpx instrumentation. Spans are exported when `OTEL_EXPORTER_OTLP_ENDPOINT` is set.
- **Audit log:** Every AI call writes one row to `AiAuditLog` (see `packages/database/prisma/schema.prisma`). Surfaced via `GET /v1/audit/logs`.

---

## 6. Change log

| Date | Change |
| --- | --- |
| 2026-05-01 | Initial contract published. |
