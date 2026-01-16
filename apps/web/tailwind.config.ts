import type { Config } from "tailwindcss";

const config: Config = {
    darkMode: "class",
    content: [
        "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                background: {
                    DEFAULT: "hsl(222, 47%, 11%)",
                    secondary: "hsl(222, 47%, 15%)",
                    tertiary: "hsl(222, 47%, 20%)",
                },
                foreground: {
                    DEFAULT: "hsl(210, 40%, 98%)",
                    secondary: "hsl(217, 19%, 70%)",
                    muted: "hsl(217, 19%, 50%)",
                },
                primary: {
                    DEFAULT: "hsl(217, 91%, 60%)",
                    hover: "hsl(217, 91%, 65%)",
                    active: "hsl(217, 91%, 55%)",
                },
                success: "hsl(142, 71%, 45%)",
                warning: "hsl(38, 92%, 50%)",
                error: "hsl(0, 72%, 51%)",
                agent: {
                    support: "hsl(142, 71%, 45%)",
                    order: "hsl(217, 91%, 60%)",
                    billing: "hsl(271, 81%, 56%)",
                },
            },
            fontFamily: {
                sans: ["Inter", "system-ui", "sans-serif"],
                mono: ["JetBrains Mono", "monospace"],
            },
            animation: {
                "fade-in": "fadeIn 0.2s ease-in",
                "slide-up": "slideUp 0.3s ease-out",
                "pulse-subtle": "pulseSubtle 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
            },
            keyframes: {
                fadeIn: {
                    "0%": { opacity: "0" },
                    "100%": { opacity: "1" },
                },
                slideUp: {
                    "0%": { transform: "translateY(10px)", opacity: "0" },
                    "100%": { transform: "translateY(0)", opacity: "1" },
                },
                pulseSubtle: {
                    "0%, 100%": { opacity: "1" },
                    "50%": { opacity: "0.7" },
                },
            },
        },
    },
    plugins: [],
};

export default config;
