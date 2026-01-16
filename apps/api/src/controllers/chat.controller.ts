/// <reference types="undici-types" />
import type { Context } from "hono";
import { chatService } from "../services/chat.service.js";
import { getCurrentUser } from "../middleware/auth.middleware.js";
import {
  successResponse,
  paginatedResponse,
  createStreamResponse,
  noContentResponse,
} from "../utils/response.js";

export const chatController = {
  // Create a new conversation
  async createConversation(c: any) {
    const user = getCurrentUser(c);
    const body = c.req.valid("json");

    const conversation = await chatService.createConversation(
      user.id,
      body?.title
    );

    // If initial message provided, send it
    if (body?.initialMessage) {
      const stream = await chatService.sendMessage(
        conversation.id,
        user.id,
        body.initialMessage
      );

      // Return streaming response
      return createStreamResponse(c, stream);
    }

    return successResponse(c, { conversation }, 201);
  },

  // Get user's conversations
  async getConversations(c: any) {
    const user = getCurrentUser(c);
    const query = c.req.valid("query");

    const result = await chatService.getUserConversations(user.id, {
      page: Number(query?.page) || 1,
      limit: Number(query?.limit) || 20,
    });

    return paginatedResponse(c, result.data, result.pagination);
  },

  // Get a specific conversation
  async getConversation(c: any) {
    const user = getCurrentUser(c);
    const params = c.req.valid("param");

    const conversation = await chatService.getConversation(params.id, user.id);

    return successResponse(c, { conversation });
  },

  // Get messages in a conversation
  async getMessages(c: any) {
    const user = getCurrentUser(c);
    const params = c.req.valid("param");
    const query = c.req.valid("query");

    const result = await chatService.getConversationMessages(
      params.id,
      user.id,
      {
        page: Number(query?.page) || 1,
        limit: Number(query?.limit) || 50,
      }
    );

    return paginatedResponse(c, result.data, result.pagination);
  },

  // Send a message (streaming response)
  async sendMessage(c: any) {
    const user = getCurrentUser(c);
    const params = c.req.valid("param");
    const body = c.req.valid("json");

    const stream = await chatService.sendMessage(
      params.id,
      user.id,
      body.content
    );

    return createStreamResponse(c, stream);
  },

  // Update conversation
  async updateConversation(c: any) {
    const user = getCurrentUser(c);
    const params = c.req.valid("param");
    const body = c.req.valid("json");

    const conversation = await chatService.updateConversation(
      params.id,
      user.id,
      body
    );

    return successResponse(c, { conversation });
  },

  // Delete conversation
  async deleteConversation(c: any) {
    const user = getCurrentUser(c);
    const params = c.req.valid("param");

    await chatService.deleteConversation(params.id, user.id);

    return noContentResponse(c);
  },
};
