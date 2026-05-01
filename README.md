# Customer Support System - Complete Monorepo

A production-ready AI-powered customer support system with multi-agent architecture, real-time streaming, and modern UI.

## 🏗️ Architecture

This is a **pnpm workspace monorepo** with:

- **Backend**: Hono.js API with Groq AI integration
- **Frontend**: Next.js 15 with streaming chat interface
- **Database**: PostgreSQL with Prisma ORM
- **Deployment**: Railway (API) + Vercel (Frontend)

## 📦 Project Structure

```
.
├── apps/
│   ├── api/          # Hono backend with multi-agent system
│   └── web/          # Next.js frontend
├── packages/
│   └── database/     # Shared Prisma schema & client
├── .claude/          # Development specifications
├── turbo.json        # Turborepo configuration
└── pnpm-workspace.yaml
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and pnpm
- PostgreSQL database (or use Neon)
- Groq API key ([get one here](https://console.groq.com))

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Setup Environment Variables

**API (`apps/api/.env`)**:
```bash
DATABASE_URL="postgresql://..."
GROQ_API_KEY="gsk_..."
UPSTASH_REDIS_REST_URL="https://..."  # Optional
UPSTASH_REDIS_REST_TOKEN="..."        # Optional
FRONTEND_URL="http://localhost:3000"
PORT=3001
NODE_ENV="development"
```

**Frontend (`apps/web/.env.local`)**:
```bash
NEXT_PUBLIC_API_URL="http://localhost:3001/api"
```

### 3. Setup Database

```bash
# Generate Prisma client
pnpm --filter=@repo/database db:generate

# Push schema to database
pnpm --filter=@repo/database db:push

# Seed with sample data
pnpm --filter=@repo/database db:seed
```

### 4. Run Development Servers

```bash
# Run both API and web concurrently
pnpm dev

# Or run individually:
pnpm --filter=@repo/api dev
pnpm --filter=@repo/web dev
```

- **Frontend**: http://localhost:3000
- **API**: http://localhost:3001
- **API Health**: http://localhost:3001/api/health

## 🎯 Features

### Backend
- ✅ **Multi-Agent System**: Support, Order, and Billing agents
- ✅ **Groq AI Integration**: Fast LLM inference with llama-3.3-70b
- ✅ **Real-time Streaming**: Server-Sent Events for live responses
- ✅ **Tool Calling**: Agents can query database and execute actions
- ✅ **Context Management**: Automatic conversation summarization
- ✅ **Type-Safe API**: Hono RPC for full type inference
- ✅ **Rate Limiting**: Upstash Redis integration
- ✅ **Comprehensive Tests**: Unit and integration tests

### Frontend
- ✅ **Modern UI**: Dark-first design with Tailwind CSS
- ✅ **Smooth Animations**: Framer Motion for delightful UX
- ✅ **Real-time Chat**: Streaming responses with visual feedback
- ✅ **State Management**: Zustand with localStorage persistence
- ✅ **Responsive Design**: Works on desktop and mobile
- ✅ **Type-Safe Client**: Hono RPC client with auto-completion
- ✅ **Error Handling**: Graceful error states and recovery

## 🧪 Testing

```bash
# Run all tests
pnpm test

# Run API tests only
pnpm --filter=@repo/api test
```

## 📦 Building for Production

```bash
# Build all packages
pnpm build

# Build specific package
pnpm --filter=@repo/api build
pnpm --filter=@repo/web build
```

## 🚀 Deployment

### Backend (Railway)

1. Connect your Railway project
2. Set environment variables
3. Deploy:
   ```bash
   # Railway will use railway.toml configuration
   railway up
   ```

### Frontend (Vercel)

1. Connect your Vercel project
2. Set `NEXT_PUBLIC_API_URL` to your Railway API URL
3. Deploy:
   ```bash
   vercel --prod
   ```

## 📚 Documentation

- [Backend Specification](.claude/backend_developer.md)
- [Frontend Specification](FRONTEND_SPEC.md)
- [API Documentation](apps/api/README.md)
- [Frontend Documentation](apps/web/README.md)

## 🛠️ Tech Stack

### Backend
- **Runtime**: Node.js with Hono.js
- **AI**: Groq SDK (llama-3.3-70b-versatile)
- **Database**: PostgreSQL + Prisma
- **Caching**: Upstash Redis
- **Validation**: Zod
- **Testing**: Vitest

### Frontend
- **Framework**: Next.js 15 (App Router)
- **Styling**: Tailwind CSS
- **State**: Zustand
- **Animations**: Framer Motion
- **Type Safety**: TypeScript + Hono RPC

## 🤖 AIML Service

A Python 3.12 FastAPI service at `apps/aiml-service` adds RAG, document
intelligence, semantic search, agent routing, **agentic workflows with
tool use** (`/v1/agents/run`), conversation memory, and live handoff.
Hono proxies under `/api/rag/*` and `/api/agent/*` after attaching the
Auth0 JWT.

### Quick start

```bash
cd apps/aiml-service
cp .env.example .env  # set OPENAI_API_KEY, AUTH0_*, DATABASE_URL
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --port 8000
```

### Smoke test through Hono

```bash
# AIML service direct
curl -s localhost:8000/health
curl -s -X POST localhost:8000/v1/embed \
  -H "Authorization: Bearer $AUTH0_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"texts":["hello world"]}'

# Hono proxy (forwards Authorization)
curl -N -X POST localhost:3001/api/rag/query \
  -H "Authorization: Bearer $AUTH0_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"What is your refund policy?","top_k":3}'

# Agentic flow with tool use — streams tool_call/tool_result/token/done
curl -N -X POST localhost:3001/api/agent/run \
  -H "Authorization: Bearer $AUTH0_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"Where is order ORD-1042?","topK":4}'
```

### Tests

```bash
cd apps/aiml-service
uv run pytest --cov=app           # 69 tests, 86% coverage, gate at 82%
uv run python tests/eval/run_eval.py --mode dry --threshold 0.6
```

### Full surface

See [docs/AIML_API_CONTRACT.md](docs/AIML_API_CONTRACT.md) for the
authoritative contract — endpoints, scopes, error envelope, SSE event
names, and Hono proxy mapping.

## 📝 License

MIT

## 🤝 Contributing

This is a complete, production-ready system. Feel free to fork and customize for your needs!
