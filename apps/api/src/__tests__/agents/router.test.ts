import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

// Hoist the generateText mock so vi.mock() (which is itself hoisted) can
// reference the same function instance the per-test setup overrides.
const { mockGenerateText } = vi.hoisted(() => ({ mockGenerateText: vi.fn() }));

// Production code (apps/api/src/services/agent.service.ts) routes via
// `generateText` from the Vercel AI SDK + Groq, not the Anthropic SDK.
// Mock that exact entry point and preserve the rest of the module so other
// `ai` exports (CoreMessage type, streamText used elsewhere) remain real.
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    generateText: mockGenerateText,
  };
});

import { AgentService } from "../../services/agent.service.js";

describe("AgentService - Routing", () => {
  let agentService: AgentService;

  beforeAll(() => {
    process.env.GROQ_API_KEY = "mock-key";
    agentService = new AgentService();
  });

  beforeEach(() => {
    mockGenerateText.mockReset();
  });

  it("should route order query to Order Agent", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify({
        agent: "order",
        confidence: 0.9,
        reasoning: "User mentions order number",
        entities: ["ORD-1234"],
      }),
    });

    const decision = await agentService.routeMessage(
      "Where is my order ORD-1234?",
      [],
    );

    expect(decision.agent).toBe("order");
    expect(decision.confidence).toBe(0.9);
    expect(decision.entities).toContain("ORD-1234");
  });

  it("should route billing query to Billing Agent", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify({
        agent: "billing",
        confidence: 0.95,
        reasoning: "User mentions refund and invoice",
        entities: ["INV-5678"],
      }),
    });

    const decision = await agentService.routeMessage(
      "I need a refund for invoice INV-5678",
      [],
    );

    expect(decision.agent).toBe("billing");
    expect(decision.confidence).toBeGreaterThan(0.9);
  });

  it("should default to Support Agent when confidence is low", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify({
        agent: "order",
        confidence: 0.4,
        reasoning: "Unclear query",
        entities: [],
      }),
    });

    const decision = await agentService.routeMessage(
      "Hello, I need help with something",
      [],
    );

    expect(decision.agent).toBe("support");
    expect(decision.reasoning).toContain("Low confidence");
  });
});
