import Link from "next/link";

export default function HomePage() {
    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-background via-background-secondary to-background">
            <div className="mx-auto max-w-4xl px-6 text-center">
                {/* Hero Section */}
                <div className="animate-fade-in">
                    <h1 className="mb-6 text-6xl font-bold tracking-tight">
                        <span className="bg-gradient-to-r from-primary via-agent-order to-agent-billing bg-clip-text text-transparent">
                            AI-Powered
                        </span>
                        <br />
                        Customer Support
                    </h1>

                    <p className="mb-8 text-xl text-foreground-secondary">
                        Multi-agent system with specialized support for orders, billing, and general inquiries.
                        <br />
                        Real-time streaming responses powered by Groq AI.
                    </p>

                    <Link
                        href="/chat"
                        className="inline-flex items-center gap-2 rounded-full bg-primary px-8 py-4 text-lg font-semibold text-white transition-all hover:bg-primary-hover hover:scale-105 active:scale-95"
                    >
                        Start Chatting
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
                                d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z"
                            />
                        </svg>
                    </Link>
                </div>

                {/* Features */}
                <div className="mt-20 grid gap-6 md:grid-cols-3">
                    <div className="glass-card animate-slide-up rounded-2xl p-6 transition-transform hover:scale-105" style={{ animationDelay: "0.1s" }}>
                        <div className="mb-4 inline-flex rounded-full bg-agent-support/10 p-3">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                                strokeWidth={1.5}
                                stroke="currentColor"
                                className="h-6 w-6 text-agent-support"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z"
                                />
                            </svg>
                        </div>
                        <h3 className="mb-2 text-lg font-semibold">Support Agent</h3>
                        <p className="text-sm text-foreground-secondary">
                            General help, FAQs, account issues, and troubleshooting assistance.
                        </p>
                    </div>

                    <div className="glass-card animate-slide-up rounded-2xl p-6 transition-transform hover:scale-105" style={{ animationDelay: "0.2s" }}>
                        <div className="mb-4 inline-flex rounded-full bg-agent-order/10 p-3">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                                strokeWidth={1.5}
                                stroke="currentColor"
                                className="h-6 w-6 text-agent-order"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z"
                                />
                            </svg>
                        </div>
                        <h3 className="mb-2 text-lg font-semibold">Order Agent</h3>
                        <p className="text-sm text-foreground-secondary">
                            Order tracking, shipping updates, modifications, and cancellations.
                        </p>
                    </div>

                    <div className="glass-card animate-slide-up rounded-2xl p-6 transition-transform hover:scale-105" style={{ animationDelay: "0.3s" }}>
                        <div className="mb-4 inline-flex rounded-full bg-agent-billing/10 p-3">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                                strokeWidth={1.5}
                                stroke="currentColor"
                                className="h-6 w-6 text-agent-billing"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z"
                                />
                            </svg>
                        </div>
                        <h3 className="mb-2 text-lg font-semibold">Billing Agent</h3>
                        <p className="text-sm text-foreground-secondary">
                            Payment history, invoices, refunds, and billing inquiries.
                        </p>
                    </div>
                </div>

                {/* Tech Stack */}
                <div className="mt-16 rounded-2xl border border-background-tertiary bg-background-secondary/30 p-8">
                    <h2 className="mb-6 text-2xl font-semibold">Powered By</h2>
                    <div className="flex flex-wrap justify-center gap-4 text-sm text-foreground-secondary">
                        <span className="rounded-full bg-background-tertiary px-4 py-2">Next.js 15</span>
                        <span className="rounded-full bg-background-tertiary px-4 py-2">Groq AI</span>
                        <span className="rounded-full bg-background-tertiary px-4 py-2">Hono RPC</span>
                        <span className="rounded-full bg-background-tertiary px-4 py-2">PostgreSQL</span>
                        <span className="rounded-full bg-background-tertiary px-4 py-2">Real-time Streaming</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
