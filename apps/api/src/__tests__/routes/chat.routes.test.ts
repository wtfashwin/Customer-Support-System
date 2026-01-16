import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { prisma } from "@repo/database";

// Simple test for route structure
describe("Chat Routes", () => {
  describe("Route definitions", () => {
    it("should export chatRoutes", async () => {
      const { chatRoutes } = await import("../../routes/chat.routes.js");
      expect(chatRoutes).toBeDefined();
    });
  });

  describe("Authentication", () => {
    it("should require X-User-Id header", async () => {
      const { chatRoutes } = await import("../../routes/chat.routes.js");
      const { errorMiddleware } = await import("../../middleware/error.middleware.js");

      const app = new Hono();
      app.use("*", errorMiddleware);
      app.route("/chat", chatRoutes);

      const res = await app.request("/chat/conversations");
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.error.code).toBe("UNAUTHORIZED");
    });
  });

  describe("Validation", () => {
    it("should validate pagination params", async () => {
      const { chatRoutes } = await import("../../routes/chat.routes.js");
      const { errorMiddleware } = await import("../../middleware/error.middleware.js");

      const mockUser = {
        id: "user-123",
        email: "test@example.com",
        name: "Test User",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock prisma user lookup
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prisma.conversation.findMany).mockResolvedValue([]);
      vi.mocked(prisma.conversation.count).mockResolvedValue(0);

      const app = new Hono();
      app.use("*", errorMiddleware);
      app.route("/chat", chatRoutes);

      // Valid request with auth header
      const res = await app.request("/chat/conversations?page=1&limit=10", {
        headers: { "X-User-Id": "user-123" },
      });

      expect(res.status).toBe(200);
    });

    it("should reject invalid message body", async () => {
      const { chatRoutes } = await import("../../routes/chat.routes.js");
      const { errorMiddleware } = await import("../../middleware/error.middleware.js");

      const mockUser = {
        id: "user-123",
        email: "test@example.com",
        name: "Test User",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockConversation = {
        id: "conv-123",
        userId: "user-123",
        title: "Test",
        status: "active",
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prisma.conversation.findUnique).mockResolvedValue(mockConversation as any);

      const app = new Hono();
      app.use("*", errorMiddleware);
      app.route("/chat", chatRoutes);

      // Empty message should fail validation
      const res = await app.request("/chat/conversations/conv-123/messages", {
        method: "POST",
        headers: {
          "X-User-Id": "user-123",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content: "" }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });
  });
});
