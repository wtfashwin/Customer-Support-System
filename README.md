# Customer Support System

A customer support application for streaming conversations with support, order, and billing agents, plus a separate service for document search and tool-based workflows.

## What it does

- Displays streaming chat responses and tool activity in a Next.js interface.
- Routes conversations through a Hono API and stores conversation history in PostgreSQL.
- Uses specialized support, order, and billing agents with Groq models.
- Provides a FastAPI service for retrieval-augmented generation, document ingestion, embeddings, conversation memory, and agent tool use.
- Includes database-backed order/payment lookup tools and optional Azure document/search integrations.

## Project status

This is an implemented monorepo with test suites and deployment configuration. The order and payment models are demo data; external commerce and payment systems are not connected. The JavaScript chat flow and Python agent workflow are separate surfaces with different configuration and authentication requirements.

## Built with

Next.js 15, React 19, TypeScript, Hono, Prisma, PostgreSQL, pnpm, Turborepo, Python 3.12, FastAPI, SQLAlchemy/Alembic, pgvector, LangChain, LlamaIndex, and LangGraph.

## Start the web and API

Requirements: Node.js 22 or later, pnpm 10.28.0, PostgreSQL, and a Groq API key. Redis/Upstash configuration is optional for the JavaScript rate-limiting path.

From the repository root:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

Set `DATABASE_URL` and `GROQ_API_KEY` in `apps/api/.env`. Keep `NEXT_PUBLIC_API_URL=http://localhost:3001/api` in the web environment for local use. Use a plain PostgreSQL URL without the Prisma-only `?schema=public` parameter when sharing the database with Python. Export the same URL in your shell so Prisma commands can read it:

```bash
export DATABASE_URL='postgresql://USER:PASSWORD@localhost:5432/support'
pnpm install
pnpm db:generate
pnpm db:push
pnpm db:seed
pnpm build
pnpm dev
```

Use a disposable development database for schema push and sample seeding. The initial build creates the workspace packages consumed by the API. Open `http://localhost:3000`; the API defaults to port 3001. `GET /health` is liveness, while `GET /api/health/ready` checks database readiness.

Start a conversation in the chat interface and ask about one of the sample orders or invoices from the database seed.

## Start the Python service

This service is started separately from `pnpm dev`. It requires Python 3.12, uv, PostgreSQL with pgvector support, Redis, an OpenAI or Azure OpenAI configuration, and Auth0 configuration for authenticated routes.

```bash
cd apps/aiml-service
cp .env.example .env
export DATABASE_URL='postgresql://USER:PASSWORD@localhost:5432/support'
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --port 8000
```

Fill in the service environment before running migrations or requests. Shell environment variables override `.env`; keep the exported URL compatible with SQLAlchemy and asyncpg. Use the same underlying database as the TypeScript application when exercising order/payment lookup tools. Alembic manages the vector column that Prisma does not model. Set `AIML_SERVICE_URL=http://localhost:8000` in the API environment to use the Hono proxy routes.

See [the AIML service guide](apps/aiml-service/README.md) and [API contract](docs/AIML_API_CONTRACT.md) for bearer-token scopes, ingestion, RAG queries, and streamed `/api/agent/run` requests. Azure Document Intelligence and Azure AI Search need their own configured accounts; unavailable optional integrations return configuration errors. Model and Azure service usage may incur charges.

## Structure

| Path | Purpose |
| --- | --- |
| `apps/web/` | Chat interface and local UI state |
| `apps/api/` | Hono API, chat agents, and Python-service proxies |
| `apps/aiml-service/` | FastAPI document, RAG, and agent workflows |
| `packages/database/` | Prisma schema, client, and sample data |
| `packages/shared-types/` | Shared TypeScript types |
| `docs/AIML_API_CONTRACT.md` | Python endpoints and proxy contract |

## Available checks

```bash
pnpm test
pnpm lint
pnpm build
pnpm --filter @repo/api test
```

For Python checks, run from `apps/aiml-service`:

```bash
uv run pytest
uv run pytest -m integration
uv run pytest --cov=app
uv run python tests/eval/run_eval.py --mode dry --threshold 0.6
```

The Python suite has integration and credential-dependent paths. The dry evaluation is a local harness check, not a measurement of a live model's quality. Root pnpm commands cover workspace packages and do not run the Python suite.

## Deployment and limits

`railway.toml` defines the API build/start command and `/health` probe. `vercel.json` configures the web deployment. Provision the database, provider credentials, and Python service separately before using those configurations. A liveness response alone does not establish database or provider readiness.

## License

The previous README states MIT, but no license file is included. The owner needs to clarify and add the intended license.
