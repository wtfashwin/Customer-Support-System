import Link from "next/link";

export default function NotFound() {
    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6">
            <div className="mx-auto max-w-md text-center">
                <h1 className="mb-4 text-9xl font-bold text-primary">404</h1>
                <h2 className="mb-4 text-2xl font-semibold text-foreground">
                    Page Not Found
                </h2>
                <p className="mb-8 text-foreground-secondary">
                    The page you're looking for doesn't exist or has been moved.
                </p>
                <Link
                    href="/"
                    className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 font-medium text-white transition-colors hover:bg-primary-hover"
                >
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
                            d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"
                        />
                    </svg>
                    Back to Home
                </Link>
            </div>
        </div>
    );
}
