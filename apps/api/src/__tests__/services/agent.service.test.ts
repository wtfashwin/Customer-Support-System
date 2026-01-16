import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentService } from "../../services/agent.service.js";

describe("AgentService", () => {
  let agentService: AgentService;

  beforeEach(() => {
    agentService = new AgentService();
  });

  describe("getAgent", () => {
    it("should return support agent", () => {
      const agent = agentService.getAgent("support");

      expect(agent).toBeDefined();
      expect(agent?.type).toBe("support");
      expect(agent?.name).toBe("Support Agent");
    });

    it("should return order agent", () => {
      const agent = agentService.getAgent("order");

      expect(agent).toBeDefined();
      expect(agent?.type).toBe("order");
      expect(agent?.name).toBe("Order Agent");
    });

    it("should return billing agent", () => {
      const agent = agentService.getAgent("billing");

      expect(agent).toBeDefined();
      expect(agent?.type).toBe("billing");
      expect(agent?.name).toBe("Billing Agent");
    });

    it("should return undefined for unknown agent type", () => {
      const agent = agentService.getAgent("unknown" as any);

      expect(agent).toBeUndefined();
    });
  });

  describe("getAllAgents", () => {
    it("should return all three agents", () => {
      const agents = agentService.getAllAgents();

      expect(agents).toHaveLength(3);
      expect(agents.map((a) => a.type)).toContain("support");
      expect(agents.map((a) => a.type)).toContain("order");
      expect(agents.map((a) => a.type)).toContain("billing");
    });
  });

  describe("Agent capabilities", () => {
    it("support agent should have correct tools", () => {
      const agent = agentService.getAgent("support");
      const tools = agent?.getTools();

      expect(tools).toBeDefined();
      expect(tools?.map((t) => t.name)).toContain("searchKnowledgeBase");
      expect(tools?.map((t) => t.name)).toContain("getUserInfo");
      expect(tools?.map((t) => t.name)).toContain("escalateToHuman");
    });

    it("order agent should have correct tools", () => {
      const agent = agentService.getAgent("order");
      const tools = agent?.getTools();

      expect(tools).toBeDefined();
      expect(tools?.map((t) => t.name)).toContain("getOrderStatus");
      expect(tools?.map((t) => t.name)).toContain("getOrderHistory");
      expect(tools?.map((t) => t.name)).toContain("trackShipment");
      expect(tools?.map((t) => t.name)).toContain("cancelOrder");
    });

    it("billing agent should have correct tools", () => {
      const agent = agentService.getAgent("billing");
      const tools = agent?.getTools();

      expect(tools).toBeDefined();
      expect(tools?.map((t) => t.name)).toContain("getPaymentHistory");
      expect(tools?.map((t) => t.name)).toContain("getInvoice");
      expect(tools?.map((t) => t.name)).toContain("requestRefund");
      expect(tools?.map((t) => t.name)).toContain("updatePaymentMethod");
    });
  });

  describe("getAnthropicTools", () => {
    it("should format tools correctly for Anthropic API", () => {
      const agent = agentService.getAgent("support");
      const anthropicTools = agent?.getAnthropicTools();

      expect(anthropicTools).toBeDefined();
      expect(anthropicTools?.[0]).toHaveProperty("name");
      expect(anthropicTools?.[0]).toHaveProperty("description");
      expect(anthropicTools?.[0]).toHaveProperty("input_schema");
      expect(anthropicTools?.[0].input_schema).toHaveProperty("type", "object");
    });
  });
});
