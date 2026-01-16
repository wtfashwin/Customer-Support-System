"use client";

import { useEffect } from "react";
import { useChatStore } from "@/stores/chatStore";
import { useConversations } from "@/hooks/useConversations";
import { Button } from "@/components/ui/Button";
import { formatRelativeTime } from "@/lib/utils";

export function Sidebar() {
    const { conversations, activeConversationId, setActiveConversation } = useChatStore();
    const { createConversation, deleteConversation, loading } = useConversations();

    const handleNewChat = async () => {
        await createConversation("New Conversation");
    };

    const handleDeleteConversation = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (confirm("Delete this conversation?")) {
            await deleteConversation(id);
        }
    };

    return (
        <div className="flex h-full w-80 flex-col border-r border-background-tertiary bg-background-secondary">
            {/* Header */}
            <div className="border-b border-background-tertiary p-4">
                <Button onClick={handleNewChat} className="w-full" disabled={loading}>
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                        className="h-5 w-5"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M12 4.5v15m7.5-7.5h-15"
                        />
                    </svg>
                    New Conversation
                </Button>
            </div>

            {/* Conversations List */}
            <div className="flex-1 overflow-y-auto">
                {conversations.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={1.5}
                            stroke="currentColor"
                            className="h-12 w-12 text-foreground-muted"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155"
                            />
                        </svg>
                        <p className="text-sm text-foreground-secondary">
                            No conversations yet
                        </p>
                    </div>
                ) : (
                    <div className="p-2">
                        {conversations.map((conv) => (
                            <button
                                key={conv.id}
                                onClick={() => setActiveConversation(conv.id)}
                                className={`group relative mb-2 w-full rounded-xl p-3 text-left transition-colors ${activeConversationId === conv.id
                                        ? "bg-background-tertiary text-foreground"
                                        : "text-foreground-secondary hover:bg-background-tertiary/50"
                                    }`}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 overflow-hidden">
                                        <p className="truncate text-sm font-medium">
                                            {conv.title}
                                        </p>
                                        <p className="text-xs text-foreground-muted">
                                            {formatRelativeTime(conv.updatedAt)}
                                        </p>
                                    </div>

                                    <button
                                        onClick={(e) => handleDeleteConversation(conv.id, e)}
                                        className="opacity-0 transition-opacity group-hover:opacity-100"
                                    >
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            strokeWidth={1.5}
                                            stroke="currentColor"
                                            className="h-4 w-4 text-error"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                                            />
                                        </svg>
                                    </button>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="border-t border-background-tertiary p-4">
                <div className="text-xs text-foreground-muted">
                    <p>AI Customer Support</p>
                    <p className="mt-1">Powered by Groq AI</p>
                </div>
            </div>
        </div>
    );
}
