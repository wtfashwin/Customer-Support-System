import type { Context } from "hono";
import { chatService } from "../services/chat.service.js";
import { getCurrentUser } from "../middleware/auth.middleware.js";
import {
  getValidatedBody,
  getValidatedQuery,
  getValidatedParams,
} from "../middleware/validation.middleware.js";
import type {
  SendMessageInput,
  CreateConversationInput,
  PaginationInput,
  ConversationIdInput,
  UpdateConversationInput,
} from "../utils/validation.js";
import {
  successResponse,
  paginatedResponse,
  createStreamResponse,
  noContentResponse,
} from "../utils/response.js";

export const chatController = {
  // Create a new conversation
  async createConversation(c: Context) {
    const user = getCurrentUser(c);
    const body = getValidatedBody<CreateConversationInput>(c);

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
  async getConversations(c: Context) {
    const user = getCurrentUser(c);
    const query = getValidatedQuery<PaginationInput>(c);

    const result = await chatService.getUserConversations(user.id, {
      page: query?.page || 1,
      limit: query?.limit || 20,
    });

    return paginatedResponse(c, result.data, result.pagination);
  },

  // Get a specific conversation
  async getConversation(c: Context) {
    const user = getCurrentUser(c);
    const params = getValidatedParams<ConversationIdInput>(c);

    const conversation = await chatService.getConversation(params.id, user.id);

    return successResponse(c, { conversation });
  },

  // Get messages in a conversation
  async getMessages(c: Context) {
    const user = getCurrentUser(c);
    const params = getValidatedParams<ConversationIdInput>(c);
    const query = getValidatedQuery<PaginationInput>(c);

    const result = await chatService.getConversationMessages(
      params.id,
      user.id,
      {
        page: query?.page || 1,
        limit: query?.limit || 50,
      }
    );

    return paginatedResponse(c, result.data, result.pagination);
  },

  // Send a message (streaming response)
  async sendMessage(c: Context) {
    const user = getCurrentUser(c);
    const params = getValidatedParams<ConversationIdInput>(c);
    const body = getValidatedBody<SendMessageInput>(c);

    const stream = await chatService.sendMessage(
      params.id,
      user.id,
      body.content
    );

    return createStreamResponse(c, stream);
  },

  // Update conversation
  async updateConversation(c: Context) {
    const user = getCurrentUser(c);
    const params = getValidatedParams<ConversationIdInput>(c);
    const body = getValidatedBody<UpdateConversationInput>(c);

    const conversation = await chatService.updateConversation(
      params.id,
      user.id,
      body
    );

    return successResponse(c, { conversation });
  },

  // Delete conversation
  async deleteConversation(c: Context) {
    const user = getCurrentUser(c);
    const params = getValidatedParams<ConversationIdInput>(c);

    await chatService.deleteConversation(params.id, user.id);

    return noContentResponse(c);
  },
};
