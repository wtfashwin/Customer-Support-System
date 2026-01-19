import { hc } from "hono/client";
import type { AppType } from "@repo/api";
import { type AgentType } from "@repo/shared-types";

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";

export const apiClient = hc<AppType>(apiUrl);

// Type-safe API wrapper functions
export const chatApi = {
    async createConversation(userId: string, title?: string) {
        const res = await apiClient.chat.conversations.$post({
            json: { title },
        });
        if (!res.ok) throw new Error("Failed to create conversation");
        return res.json();
    },

    async sendMessage(conversationId: string, message: string, userId: string) {
        const res = await apiClient.chat.conversations[":id"].messages.$post({
            param: { id: conversationId },
            json: { content: message },
        });
        if (!res.ok) throw new Error("Failed to send message");
        return res.body; // Returns ReadableStream
    },

    async getConversations(userId: string, page = 1, limit = 20) {
        const res = await apiClient.chat.conversations.$get({
            query: { page: String(page), limit: String(limit) },
        });
        if (!res.ok) throw new Error("Failed to fetch conversations");
        return res.json();
    },

    async getConversation(conversationId: string) {
        const res = await apiClient.chat.conversations[":id"].$get({
            param: { id: conversationId },
        });
        if (!res.ok) throw new Error("Failed to fetch conversation");
        return res.json();
    },

    async getMessages(conversationId: string, page = 1, limit = 50) {
        const res = await apiClient.chat.conversations[":id"].messages.$get({
            param: { id: conversationId },
            query: { page: String(page), limit: String(limit) },
        });
        if (!res.ok) throw new Error("Failed to fetch messages");
        return res.json();
    },

    async deleteConversation(conversationId: string) {
        const res = await apiClient.chat.conversations[":id"].$delete({
            param: { id: conversationId },
        });
        if (!res.ok) throw new Error("Failed to delete conversation");
        return res.json();
    },
};

export const agentsApi = {
    async getAgents() {
        const res = await apiClient.agents.$get();
        if (!res.ok) throw new Error("Failed to fetch agents");
        return res.json();
    },

    async getAgentCapabilities(agentType: AgentType) {
        const res = await apiClient.agents[":type"].capabilities.$get({
            param: { type: agentType },
        });
        if (!res.ok) throw new Error("Failed to fetch agent capabilities");
        return res.json();
    },
};
