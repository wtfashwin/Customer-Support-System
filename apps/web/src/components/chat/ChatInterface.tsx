"use client";

import { useEffect } from "react";
import { useChatStore } from "@/stores/chatStore";
import { useChat } from "@/hooks/useChat";
import { useConversations } from "@/hooks/useConversations";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { ThinkingIndicator } from "./ThinkingIndicator";
import { getStatusMessage } from "@/lib/streaming";

const agentBadgeColors: Record<string, string> = {
    support: "bg-green-500/10 text-green-400",
    order: "bg-blue-500/10 text-blue-400",
    billing: "bg-purple-500/10 text-purple-400",
};

export function ChatInterface() {
    const {
        userId,
        activeConversationId,
        messages,
        streamingMessage,
        streamingReasoning,
        isStreaming,
        aiStatus,
        currentAgent,
        currentTool,
    } = useChatStore();

    const { sendMessage, error, clearError } = useChat();
    const { loadMessages, createConversation } = useConversations();

    // Load messages when conversation changes
    useEffect(() => {
        if (activeConversationId) {
            loadMessages(activeConversationId);
        }
    }, [activeConversationId, loadMessages]);

    // Create initial conversation if none exists
    useEffect(() => {
        if (!activeConversationId) {
            createConversation("New Conversation");
        }
    }, [activeConversationId, createConversation]);

    const conversationMessages = activeConversationId
        ? messages[activeConversationId] || []
        : [];

    const agentBadgeColor = currentAgent
        ? agentBadgeColors[currentAgent] || "bg-gray-500/10 text-gray-400"
        : "";

    return (
        <div className="flex h-full flex-col bg-background">
            {/* Header */}
            <header className="border-b border-background-tertiary px-6 py-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-xl font-semibold text-foreground">
                            Customer Support Chat
                        </h1>
                        {isStreaming && aiStatus !== "idle" && (
                            <div className="mt-1 flex items-center gap-2">
                                <span className="inline-flex items-center gap-2 text-sm text-foreground-secondary">
                                    <span className="relative flex h-2 w-2">
                                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                                        <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                                    </span>
                                    {getStatusMessage(aiStatus, currentAgent ?? undefined, currentTool ?? undefined)}
                                </span>
                                {currentAgent && (
                                    <span
                                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${agentBadgeColor}`}
                                    >
                                        {currentAgent.charAt(0).toUpperCase() +
                                            currentAgent.slice(1)}{" "}
                                        Agent
                                    </span>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="rounded-full bg-success/10 px-3 py-1 text-sm font-medium text-success">
                            Online
                        </span>
                    </div>
                </div>
            </header>

            {/* Messages */}
            <MessageList
                messages={conversationMessages}
                streamingMessage={streamingMessage}
                streamingReasoning={streamingReasoning}
            />

            {/* Thinking Indicator - Shows above input when AI is processing */}
            <ThinkingIndicator />

            {/* Input */}
            <MessageInput
                onSend={sendMessage}
                disabled={!activeConversationId || isStreaming}
                error={error}
            />
        </div>
    );
}
