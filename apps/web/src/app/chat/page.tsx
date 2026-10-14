"use client";

import { nanoid } from "nanoid";
import { useEffect } from "react";

import { ChatInterface } from "@/components/chat/ChatInterface";
import { Sidebar } from "@/components/layout/Sidebar";
import { useChatStore } from "@/stores/chatStore";

export default function ChatPage() {
    const { userId, setUserId } = useChatStore();

    // Initialize user ID on mount (in a real app, this would come from auth)
    useEffect(() => {
        if (!userId) {
            const newUserId = nanoid();
            setUserId(newUserId);
        }
    }, [userId, setUserId]);

    return (
        <div className="flex h-screen overflow-hidden">
            <Sidebar />
            <main className="flex-1">
                <ChatInterface />
            </main>
        </div>
    );
}
