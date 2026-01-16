import { useState, useEffect, useCallback } from "react";
import { useChatStore } from "@/stores/chatStore";
import { chatApi } from "@/lib/api-client";

export function useConversations() {
    const { userId, conversations, addConversation, setMessages, deleteConversation: deleteConversationStore } = useChatStore();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Fetch conversations on mount
    const fetchConversations = useCallback(async () => {
        if (!userId) return;

        setLoading(true);
        setError(null);

        try {
            const data = await chatApi.getConversations(userId);
            // Update store with fetched conversations
            // Note: In a real app, you'd want to merge rather than replace
            data.conversations.forEach((conv: any) => {
                addConversation({
                    id: conv.id,
                    userId: conv.userId,
                    title: conv.title,
                    createdAt: new Date(conv.createdAt),
                    updatedAt: new Date(conv.updatedAt),
                });
            });
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Failed to fetch conversations"
            );
        } finally {
            setLoading(false);
        }
    }, [userId, addConversation]);

    // Create new conversation
    const createConversation = useCallback(
        async (title?: string) => {
            if (!userId) {
                setError("User ID not set");
                return null;
            }

            setError(null);

            try {
                const data = await chatApi.createConversation(userId, title);
                const newConv = {
                    id: data.conversation.id,
                    userId: data.conversation.userId,
                    title: data.conversation.title,
                    createdAt: new Date(data.conversation.createdAt),
                    updatedAt: new Date(data.conversation.updatedAt),
                };
                addConversation(newConv);
                return newConv;
            } catch (err) {
                setError(
                    err instanceof Error ? err.message : "Failed to create conversation"
                );
                return null;
            }
        },
        [userId, addConversation]
    );

    // Load messages for a conversation
    const loadMessages = useCallback(
        async (conversationId: string) => {
            setLoading(true);
            setError(null);

            try {
                const data = await chatApi.getMessages(conversationId);
                const formattedMessages = data.messages.map((msg: any) => ({
                    id: msg.id,
                    conversationId: msg.conversationId,
                    role: msg.role,
                    content: msg.content,
                    agentType: msg.agentType,
                    createdAt: new Date(msg.createdAt),
                    toolCalls: msg.toolCalls,
                }));
                setMessages(conversationId, formattedMessages);
            } catch (err) {
                setError(
                    err instanceof Error ? err.message : "Failed to load messages"
                );
            } finally {
                setLoading(false);
            }
        },
        [setMessages]
    );

    // Delete conversation
    const deleteConversation = useCallback(
        async (conversationId: string) => {
            setError(null);

            try {
                await chatApi.deleteConversation(conversationId);
                deleteConversationStore(conversationId);
            } catch (err) {
                setError(
                    err instanceof Error ? err.message : "Failed to delete conversation"
                );
            }
        },
        [deleteConversationStore]
    );

    return {
        conversations,
        loading,
        error,
        fetchConversations,
        createConversation,
        loadMessages,
        deleteConversation,
    };
}
