import { useState, useCallback } from "react";
import { useChatStore } from "@/stores/chatStore";
import { chatApi } from "@/lib/api-client";
import { parseSSEStream } from "@/lib/streaming";
import { nanoid } from "nanoid";

export function useChat() {
    const {
        userId,
        activeConversationId,
        addMessage,
        updateStreamingMessage,
        setIsStreaming,
        clearStreamingMessage,
        setAIStatus,
        addPendingToolCall,
        updateToolCallResult,
        resetAIStatus,
        updateStreamingReasoning,
    } = useChatStore();

    const [error, setError] = useState<string | null>(null);

    const sendMessage = useCallback(
        async (content: string) => {
            if (!activeConversationId) {
                setError("No active conversation");
                return;
            }

            if (!userId) {
                setError("User ID not set");
                return;
            }

            // Add user message immediately (optimistic update)
            const userMessage = {
                id: nanoid(),
                conversationId: activeConversationId,
                role: "user" as const,
                content,
                createdAt: new Date(),
            };
            addMessage(activeConversationId, userMessage);

            try {
                setIsStreaming(true);
                setError(null);
                setAIStatus("routing");

                const stream = await chatApi.sendMessage(
                    activeConversationId,
                    content,
                    userId
                );

                if (!stream) {
                    throw new Error("No stream returned from API");
                }

                let fullResponse = "";
                let fullReasoning = "";
                let messageId = "";

                for await (const event of parseSSEStream(stream)) {
                    switch (event.type) {
                        case "status":
                            // Update AI status indicator
                            setAIStatus(
                                event.data.status,
                                event.data.agent,
                                event.data.tool
                            );
                            break;

                        case "reasoning":
                            fullReasoning += event.data.text;
                            updateStreamingReasoning(fullReasoning);
                            break;

                        case "text":
                            // Switch to generating status when text starts flowing
                            setAIStatus("generating");
                            fullResponse += event.data.text;
                            updateStreamingMessage(fullResponse);
                            break;

                        case "tool_call":
                            // Add tool call to pending list for visualization
                            addPendingToolCall({
                                name: event.data.name,
                                input: event.data.input,
                            });
                            break;

                        case "tool_result":
                            // Update tool call with result
                            updateToolCallResult(
                                event.data.name,
                                event.data.result
                            );
                            break;

                        case "done":
                            messageId = event.data.messageId;
                            // Add assistant message
                            const assistantMessage = {
                                id: messageId,
                                conversationId: activeConversationId,
                                role: "assistant" as const,
                                content: fullResponse,
                                reasoning: fullReasoning || undefined,
                                createdAt: new Date(),
                            };
                            addMessage(activeConversationId, assistantMessage);
                            clearStreamingMessage();
                            resetAIStatus();
                            break;

                        case "error":
                            setError(event.data.message);
                            clearStreamingMessage();
                            resetAIStatus();
                            break;
                    }
                }
            } catch (err) {
                setError(
                    err instanceof Error ? err.message : "Failed to send message"
                );
                clearStreamingMessage();
                resetAIStatus();
            } finally {
                setIsStreaming(false);
            }
        },
        [
            activeConversationId,
            userId,
            addMessage,
            updateStreamingMessage,
            setIsStreaming,
            clearStreamingMessage,
            setAIStatus,
            addPendingToolCall,
            updateToolCallResult,
            resetAIStatus,
            updateStreamingReasoning,
        ]
    );

    return {
        sendMessage,
        error,
        clearError: () => setError(null),
    };
}
