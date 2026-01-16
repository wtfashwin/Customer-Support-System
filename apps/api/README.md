# Customer Support API

A production-grade Hono.js API with multi-agent architecture.

## 🚀 Features

- **Multi-Agent System**: Specialized agents for Support, Order, and Billing
- **Hono RPC**: Type-safe client for frontend
- **Streaming**: Real-time AI responses
- **Context Awareness**: Efficient context management with summarization

## 🛠️ Setup

1. **Environment Variables**
   Copy `.env.example` to `.env` and fill in the values:
   ```bash
   cp .env.example .env
   ```

2. **Database**
   ```bash
   pnpm db:generate
   pnpm db:push
   pnpm db:seed
   ```

3. **Development**
   ```bash
   pnpm dev
   ```

## 🔌 API Client Usage (Hono RPC)

This API exports `AppType` for full type safety in the frontend.

### Installation in Frontend

Ensure `@repo/api` is in your dependencies.

### Usage Example

```typescript
import { hc } from 'hono/client'
import type { AppType } from '@repo/api'

const client = hc<AppType>(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api')

// Type-safe request
const res = await client.chat.$post({
  json: {
    message: "Where is my order?",
    conversationId: "123"
  }
})

if (res.ok) {
  const data = await res.json()
  // data is typed!
}
```

## 🧪 Testing

```bash
pnpm test
```
