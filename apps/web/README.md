# Customer Support Frontend

A modern Next.js 15 application for AI-powered customer support with real-time streaming responses.

## 🚀 Features

- **Real-time Streaming**: Live AI responses with Server-Sent Events
- **Multi-Agent System**: Specialized agents for Support, Orders, and Billing
- **Type-Safe API**: Hono RPC client with full TypeScript inference
- **Modern UI**: Dark-first design with Tailwind CSS and Framer Motion animations
- **State Management**: Zustand with persistence
- **Responsive**: Works beautifully on desktop and mobile

## 🛠️ Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Styling**: Tailwind CSS
- **State**: Zustand
- **Animations**: Framer Motion
- **API Client**: Hono RPC
- **AI**: Groq (via backend)

## 📦 Setup

1. **Install dependencies**:
   ```bash
   pnpm install
   ```

2. **Set environment variables**:
   ```bash
   cp .env.example .env.local
   ```
   
   Update `NEXT_PUBLIC_API_URL` to point to your backend API.

3. **Run development server**:
   ```bash
   pnpm dev
   ```

4. **Open in browser**:
   Navigate to [http://localhost:3000](http://localhost:3000)

## 🎨 Design System

The app uses a custom design system with:
- **Dark-first** color palette
- **Consistent spacing** and typography
- **Smooth animations** for better UX
- **Agent-specific colors** (Support: Green, Order: Blue, Billing: Purple)

## 📁 Project Structure

```
src/
├── app/              # Next.js app router pages
├── components/       # React components
│   ├── chat/        # Chat-specific components
│   ├── layout/      # Layout components
│   └── ui/          # Reusable UI primitives
├── hooks/           # Custom React hooks
├── lib/             # Utilities and API client
└── stores/          # Zustand stores
```

## 🔌 API Integration

The app uses Hono RPC for type-safe API calls. The API client automatically infers types from the backend:

```typescript
import { chatApi } from '@/lib/api-client'

// Fully typed!
const response = await chatApi.sendMessage(conversationId, message, userId)
```

## 🚧 Development

- `pnpm dev` - Start development server
- `pnpm build` - Build for production
- `pnpm start` - Start production server
- `pnpm lint` - Run ESLint

## 📝 License

MIT
