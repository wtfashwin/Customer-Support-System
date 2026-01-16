import { vi } from "vitest";

// Mock environment variables
process.env.NODE_ENV = "test";
process.env.ANTHROPIC_API_KEY = "test-api-key";
process.env.GROQ_API_KEY = "test-api-key";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test_db";

// Mock Anthropic SDK
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = {
        create: vi.fn().mockResolvedValue({
          content: [{ type: "text", text: '{"agent": "support", "confidence": 0.9, "reasoning": "Test routing", "entities": []}' }],
          usage: { input_tokens: 100, output_tokens: 50 },
        }),
        stream: vi.fn().mockReturnValue({
          on: vi.fn(),
          finalMessage: vi.fn().mockResolvedValue({
            content: [{ type: "text", text: "Test response" }],
            usage: { input_tokens: 100, output_tokens: 50 },
          }),
        }),
      };
    },
  };
});

// Mock Prisma
vi.mock("@repo/database", () => {
  const mockPrismaClient = {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    conversation: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    message: {
      findMany: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
    order: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    payment: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    knowledgeBase: {
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn().mockResolvedValue([{ result: 1 }]),
  };

  return {
    prisma: mockPrismaClient,
    PrismaClient: vi.fn(() => mockPrismaClient),
  };
});

// Mock Redis
vi.mock("@upstash/redis", () => ({
  Redis: vi.fn(() => ({
    ping: vi.fn().mockResolvedValue("PONG"),
  })),
}));

vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: vi.fn(() => ({
    limit: vi.fn().mockResolvedValue({
      success: true,
      limit: 20,
      remaining: 19,
      reset: Date.now() + 10000,
    }),
  })),
}));
