import { describe, it, expect, vi, beforeEach } from "vitest";
import { ContextService } from "../../services/context.service.js";

// Create a testable instance
const contextService = new ContextService();

describe("ContextService", () => {
  describe("extractEntities", () => {
    it("should extract order numbers from messages", () => {
      const messages = [
        { id: "1", conversationId: "c1", role: "user", content: "Where is my order ORD-1234?", createdAt: new Date() },
        { id: "2", conversationId: "c1", role: "assistant", content: "Let me check ORD-1234 for you.", createdAt: new Date() },
      ] as any;

      const entities = contextService.extractEntities(messages);

      expect(entities.orderNumbers).toContain("ORD-1234");
      expect(entities.orderNumbers).toHaveLength(1);
    });

    it("should extract invoice numbers from messages", () => {
      const messages = [
        { id: "1", conversationId: "c1", role: "user", content: "I have a question about INV-5678", createdAt: new Date() },
      ] as any;

      const entities = contextService.extractEntities(messages);

      expect(entities.invoiceNumbers).toContain("INV-5678");
    });

    it("should extract tracking IDs from messages", () => {
      const messages = [
        { id: "1", conversationId: "c1", role: "user", content: "My tracking is TRK-ABC123", createdAt: new Date() },
      ] as any;

      const entities = contextService.extractEntities(messages);

      expect(entities.trackingIds).toContain("TRK-ABC123");
    });

    it("should extract monetary amounts from messages", () => {
      const messages = [
        { id: "1", conversationId: "c1", role: "user", content: "I was charged $99.99", createdAt: new Date() },
      ] as any;

      const entities = contextService.extractEntities(messages);

      expect(entities.amounts).toContain("$99.99");
    });

    it("should deduplicate entities", () => {
      const messages = [
        { id: "1", conversationId: "c1", role: "user", content: "ORD-1234 ORD-1234 ORD-1234", createdAt: new Date() },
      ] as any;

      const entities = contextService.extractEntities(messages);

      expect(entities.orderNumbers).toHaveLength(1);
    });

    it("should handle messages with no entities", () => {
      const messages = [
        { id: "1", conversationId: "c1", role: "user", content: "Hello, I need help", createdAt: new Date() },
      ] as any;

      const entities = contextService.extractEntities(messages);

      expect(entities.orderNumbers).toHaveLength(0);
      expect(entities.invoiceNumbers).toHaveLength(0);
      expect(entities.trackingIds).toHaveLength(0);
      expect(entities.amounts).toHaveLength(0);
    });
  });

  describe("estimateTokens", () => {
    it("should estimate tokens based on character count", () => {
      const messages = [
        { id: "1", conversationId: "c1", role: "user", content: "a".repeat(100), createdAt: new Date() },
      ] as any;

      const tokens = contextService.estimateTokens(messages);

      // 100 chars / 4 = 25 tokens
      expect(tokens).toBe(25);
    });

    it("should sum tokens across multiple messages", () => {
      const messages = [
        { id: "1", conversationId: "c1", role: "user", content: "a".repeat(100), createdAt: new Date() },
        { id: "2", conversationId: "c1", role: "assistant", content: "b".repeat(100), createdAt: new Date() },
      ] as any;

      const tokens = contextService.estimateTokens(messages);

      // 200 chars / 4 = 50 tokens
      expect(tokens).toBe(50);
    });

    it("should handle empty messages", () => {
      const messages = [] as any;

      const tokens = contextService.estimateTokens(messages);

      expect(tokens).toBe(0);
    });
  });
});
