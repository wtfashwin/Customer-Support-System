"use client";

import { useState, useRef, KeyboardEvent } from "react";
import { Button } from "@/components/ui/Button";

interface MessageInputProps {
    onSend: (message: string) => Promise<void>;
    disabled?: boolean;
    error?: string | null;
}

export function MessageInput({ onSend, disabled, error }: MessageInputProps) {
    const [message, setMessage] = useState("");
    const [isSending, setIsSending] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const handleSend = async () => {
        if (!message.trim() || isSending || disabled) return;

        setIsSending(true);
        try {
            await onSend(message.trim());
            setMessage("");
            // Reset textarea height
            if (textareaRef.current) {
                textareaRef.current.style.height = "auto";
            }
        } finally {
            setIsSending(false);
        }
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // Auto-resize textarea
    const handleInput = () => {
        const textarea = textareaRef.current;
        if (textarea) {
            textarea.style.height = "auto";
            textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
        }
    };

    return (
        <div className="border-t border-background-tertiary bg-background-secondary px-6 py-4">
            <div className="mx-auto max-w-3xl">
                {error && (
                    <div className="mb-4 rounded-xl bg-error/10 border border-error/20 px-4 py-3 text-sm text-error">
                        {error}
                    </div>
                )}

                <div className="flex gap-3">
                    <textarea
                        ref={textareaRef}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        onInput={handleInput}
                        onKeyDown={handleKeyDown}
                        placeholder="Type your message... (Shift+Enter for new line)"
                        disabled={disabled || isSending}
                        rows={1}
                        className="flex-1 resize-none rounded-xl border border-background-tertiary bg-background px-4 py-3 text-foreground placeholder:text-foreground-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
                        style={{ maxHeight: "200px" }}
                    />

                    <Button
                        onClick={handleSend}
                        disabled={!message.trim() || disabled || isSending}
                        size="lg"
                        className="self-end"
                    >
                        {isSending ? (
                            <svg
                                className="h-5 w-5 animate-spin"
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                            >
                                <circle
                                    className="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                />
                                <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                />
                            </svg>
                        ) : (
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
                                    d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5"
                                />
                            </svg>
                        )}
                    </Button>
                </div>

                <p className="mt-2 text-xs text-foreground-muted">
                    Press Enter to send, Shift+Enter for new line
                </p>
            </div>
        </div>
    );
}
