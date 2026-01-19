import { create } from "zustand";
import { persist } from "zustand/middleware";
import { type AgentType } from "@repo/shared-types";

export interface Message {
    id: string;
    conversationId: string;
    role: "user" | "assistant";
    content: string;
    agentType?: AgentType;
    reasoning?: string;
    createdAt: Date;
    toolCalls?: ToolCall[];
}

export interface ToolCall {
    name: string;
    input: Record<string, unknown>;
    result?: unknown;
}

export interface Conversation {
    id: string;
    userId: string;
    title: string;
    createdAt: Date;
    updatedAt: Date;
}

export type AIStatus =
    | "idle"
    | "thinking"
    | "routing"
    | "tool_calling"
    | "generating";

interface ChatState {
    // State
    conversations: Conversation[];
    activeConversationId: string | null;
    messages: Record<string, Message[]>;
    streamingMessage: string | null;
    streamingReasoning: string | null;
    isStreaming: boolean;
    userId: string | null;

    // AI Status State
    aiStatus: AIStatus;
    currentAgent: string | null;
    currentTool: string | null;
    pendingToolCalls: ToolCall[];

    // Actions
    setUserId: (userId: string) => void;
    setActiveConversation: (id: string | null) => void;
    addConversation: (conversation: Conversation) => void;
    addMessage: (conversationId: string, message: Message) => void;
    setMessages: (conversationId: string, messages: Message[]) => void;
    updateStreamingMessage: (content: string) => void;
    updateStreamingReasoning: (content: string) => void;
    setIsStreaming: (isStreaming: boolean) => void;
    clearStreamingMessage: () => void;
    deleteConversation: (conversationId: string) => void;
    updateConversationTitle: (conversationId: string, title: string) => void;

    // AI Status Actions
    setAIStatus: (status: AIStatus, agent?: string, tool?: string) => void;
    addPendingToolCall: (toolCall: ToolCall) => void;
    updateToolCallResult: (toolName: string, result: unknown) => void;
    resetAIStatus: () => void;
}

export const useChatStore = create<ChatState>()(
    persist(
        (set, get) => ({
            // Initial state
            conversations: [],
            activeConversationId: null,
            messages: {},
            streamingMessage: null,
            streamingReasoning: null,
            isStreaming: false,
            userId: null,

            // AI Status State
            aiStatus: "idle",
            currentAgent: null,
            currentTool: null,
            pendingToolCalls: [],

            // Actions
            setUserId: (userId) => set({ userId }),

            setActiveConversation: (id) => set({ activeConversationId: id }),

            addConversation: (conversation) =>
                set((state) => ({
                    conversations: [conversation, ...state.conversations],
                    activeConversationId: conversation.id,
                })),

            addMessage: (conversationId, message) =>
                set((state) => ({
                    messages: {
                        ...state.messages,
                        [conversationId]: [
                            ...(state.messages[conversationId] || []),
                            message,
                        ],
                    },
                })),

            setMessages: (conversationId, messages) =>
                set((state) => ({
                    messages: {
                        ...state.messages,
                        [conversationId]: messages,
                    },
                })),

            updateStreamingMessage: (content) =>
                set({ streamingMessage: content }),

            updateStreamingReasoning: (content) =>
                set({ streamingReasoning: content }),

            setIsStreaming: (isStreaming) => set({ isStreaming }),

            clearStreamingMessage: () =>
                set({
                    streamingMessage: null,
                    streamingReasoning: null,
                    isStreaming: false,
                    aiStatus: "idle",
                    pendingToolCalls: [],
                }),

            deleteConversation: (conversationId) =>
                set((state) => ({
                    conversations: state.conversations.filter(
                        (c) => c.id !== conversationId
                    ),
                    messages: Object.fromEntries(
                        Object.entries(state.messages).filter(
                            ([id]) => id !== conversationId
                        )
                    ),
                    activeConversationId:
                        state.activeConversationId === conversationId
                            ? null
                            : state.activeConversationId,
                })),

            updateConversationTitle: (conversationId, title) =>
                set((state) => ({
                    conversations: state.conversations.map((c) =>
                        c.id === conversationId ? { ...c, title } : c
                    ),
                })),

            // AI Status Actions
            setAIStatus: (status, agent, tool) =>
                set({
                    aiStatus: status,
                    currentAgent: agent ?? get().currentAgent,
                    currentTool: tool ?? null,
                }),

            addPendingToolCall: (toolCall) =>
                set((state) => ({
                    pendingToolCalls: [...state.pendingToolCalls, toolCall],
                })),

            updateToolCallResult: (toolName, result) =>
                set((state) => ({
                    pendingToolCalls: state.pendingToolCalls.map((tc) =>
                        tc.name === toolName ? { ...tc, result } : tc
                    ),
                })),

            resetAIStatus: () =>
                set({
                    aiStatus: "idle",
                    currentAgent: null,
                    currentTool: null,
                    pendingToolCalls: [],
                }),
        }),
        {
            name: "chat-storage",
            partialize: (state) => ({
                conversations: state.conversations,
                messages: state.messages,
                activeConversationId: state.activeConversationId,
                userId: state.userId,
            }),
        }
    )
);
