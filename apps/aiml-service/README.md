# AIML Service

FastAPI Python service for retrieval-augmented generation (RAG), document
intelligence, semantic search, agent routing, and live handoff. See the
[API contract](../../docs/AIML_API_CONTRACT.md) for the full surface.

## Stack

- Python 3.12, FastAPI, Uvicorn (Gunicorn for production)
- SQLAlchemy 2 async + asyncpg + pgvector + Alembic
- Langchain (RAG retrieval + chat) + LlamaIndex (ingestion/chunking)
- Azure Document Intelligence + Azure AI Search
- Auth0 JWT verification with cached JWKS
- structlog JSON logging, OpenTelemetry tracing

## Quick start

```bash
cd apps/aiml-service
cp .env.example .env  # fill in keys
export DATABASE_URL='postgresql://USER:PASSWORD@localhost:5432/support'
uv sync --frozen
uv run --frozen alembic upgrade head
uv run --frozen uvicorn app.main:app --reload --port 8000
```

Use a fresh development database with pgvector. Alembic owns the Python tables in `public`; the JavaScript application owns `support_app`. Initialize the JavaScript tables with `pnpm db:migrate:deploy` from the repository root when using order/payment lookup tools. These two migration steps can run in either order. Existing databases with JavaScript tables in `public` require a separately reviewed migration; these commands do not move data.

Smoke test (`/ready` calls the provider when a key is configured):

```bash
curl -s localhost:8000/health
curl -s localhost:8000/ready | jq
```

Agentic flow with tool use:

```bash
TOKEN=...  # Auth0 JWT with scope 'aiml:tools:invoke aiml:write'

# Streams: source → tool_call → tool_result → token (×N) → done
curl -N -X POST localhost:8000/v1/agents/run \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"Where is order ORD-1042?","topK":4,"maxIterations":5}'

# List a conversation's messages
curl -s localhost:8000/v1/conversations/<convo-uuid> \
  -H "Authorization: Bearer $TOKEN" | jq
```

## Tests

```bash
uv run pytest                 # unit + mocked integration
uv run pytest -m integration  # requires Postgres (testcontainers)
uv run pytest --cov=app --cov-fail-under=82
```

## Environment

See `.env.example`. Key knobs:

- `OPENAI_PROVIDER=openai|azure` – switches between OpenAI and Azure OpenAI clients.
- `AZURE_DI_*` and `AZURE_SEARCH_*` are optional; when missing, the corresponding routes return `503 not_configured`.
- `AUTH0_DOMAIN` and `AUTH0_AUDIENCE` are required to verify bearer tokens.
