import { type ClassValue, clsx } from "clsx";

/**
 * Utility for merging class names (Tailwind + conditional classes)
 */
export function cn(...inputs: ClassValue[]) {
    return clsx(inputs);
}

/**
 * Format date to relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(date: Date): string {
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInSec = Math.floor(diffInMs / 1000);
    const diffInMin = Math.floor(diffInSec / 60);
    const diffInHour = Math.floor(diffInMin / 60);
    const diffInDay = Math.floor(diffInHour / 24);

    if (diffInSec < 60) return "Just now";
    if (diffInMin < 60) return `${diffInMin}m ago`;
    if (diffInHour < 24) return `${diffInHour}h ago`;
    if (diffInDay < 7) return `${diffInDay}d ago`;

    return date.toLocaleDateString();
}

/**
 * Format date to time string (e.g., "2:30 PM")
 */
export function formatTime(date: Date): string {
    return date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
    });
}

/**
 * Get agent color for badges and UI elements
 */
export function getAgentColor(
    agentType: string
): { bg: string; text: string; border: string } {
    switch (agentType) {
        case "support":
            return {
                bg: "bg-agent-support/10",
                text: "text-agent-support",
                border: "border-agent-support/20",
            };
        case "order":
            return {
                bg: "bg-agent-order/10",
                text: "text-agent-order",
                border: "border-agent-order/20",
            };
        case "billing":
            return {
                bg: "bg-agent-billing/10",
                text: "text-agent-billing",
                border: "border-agent-billing/20",
            };
        default:
            return {
                bg: "bg-foreground-muted/10",
                text: "text-foreground-secondary",
                border: "border-foreground-muted/20",
            };
    }
}

/**
 * Debounce function for input handling
 */
export function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout;
    return (...args: Parameters<T>) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}
