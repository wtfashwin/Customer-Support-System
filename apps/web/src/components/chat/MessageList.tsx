"use client";

import { useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Avatar } from "@/components/ui/Avatar";
import { AgentBadge } from "./AgentBadge";
import { formatTime } from "@/lib/utils";
import type { Message } from "@/stores/chatStore";

interface MessageListProps {
    messages: Message[];
    streamingMessage: string | null;
    streamingReasoning?: string | null;
}

function Reasoning({ text }: { text?: string | null }) {
    if (!text) return null;

    return (
        <details className="group mb-2 rounded-xl border border-background-tertiary bg-background-tertiary/50 open:bg-background-tertiary/30">
            <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs font-medium text-foreground-secondary hover:text-foreground transition-colors select-none">
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                    className="h-3 w-3 transition-transform duration-200 group-open:rotate-90"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                </svg>
                Thought Process
            </summary>
            <div className="border-t border-background-tertiary px-3 py-3 text-xs text-foreground-secondary/90 whitespace-pre-wrap font-mono leading-relaxed animate-fade-in">
                {text}
            </div>
        </details>
    );
}

export function MessageList({ messages, streamingMessage, streamingReasoning }: MessageListProps) {
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        scrollRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, streamingMessage, streamingReasoning]);

    return (
        <div className="flex-1 overflow-y-auto px-6 py-8">
            <div className="mx-auto max-w-3xl space-y-6">
                <AnimatePresence mode="popLayout">
                    {messages.map((message) => (
                        <motion.div
                            key={message.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className={`flex gap-4 ${message.role === "user" ? "justify-end" : "justify-start"
                                }`}
                        >
                            {message.role === "assistant" && (
                                <Avatar variant="agent" agentType={message.agentType} />
                            )}

                            <div className="flex max-w-[80%] flex-col gap-2">
                                {message.role === "assistant" && message.agentType && (
                                    <AgentBadge type={message.agentType} />
                                )}

                                {message.role === "assistant" && message.reasoning && (
                                    <Reasoning text={message.reasoning} />
                                )}

                                <div
                                    className={`rounded-2xl px-4 py-3 ${message.role === "user"
                                            ? "message-user"
                                            : "message-assistant"
                                        }`}
                                >
                                    <p className="whitespace-pre-wrap leading-relaxed">
                                        {message.content}
                                    </p>
                                </div>

                                <span className="text-xs text-foreground-muted px-1">
                                    {formatTime(message.createdAt)}
                                </span>
                            </div>

                            {message.role === "user" && <Avatar variant="user" />}
                        </motion.div>
                    ))}

                    {/* Streaming message */}
                    {(streamingMessage || streamingReasoning) && (
                        <motion.div
                            key="streaming"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="flex gap-4"
                        >
                            <Avatar variant="agent" />
                            <div className="flex max-w-[80%] flex-col gap-2">

                                {streamingReasoning && (
                                    <div className="mb-2 w-full animate-pulse">
                                        <Reasoning text={streamingReasoning} />
                                    </div>
                                )}

                                {streamingMessage && (
                                    <div className="message-assistant">
                                        <p className="whitespace-pre-wrap leading-relaxed">
                                            {streamingMessage}
                                            <span className="ml-1 inline-block animate-pulse-subtle">
                                                ▋
                                            </span>
                                        </p>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Empty state */}
                {messages.length === 0 && !streamingMessage && (
                    <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 text-center">
                        <div className="rounded-full bg-background-secondary p-6">
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
                                    d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z"
                                />
                            </svg>
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-foreground">
                                Start a conversation
                            </h3>
                            <p className="mt-1 text-sm text-foreground-secondary">
                                Ask about orders, billing, or get general support
                            </p>
                        </div>
                    </div>
                )}

                <div ref={scrollRef} />
            </div>
        </div>
    );
}
