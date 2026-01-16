/** @type {import('next').NextConfig} */
const nextConfig = {
    transpilePackages: ['@repo/api'],
    experimental: {
        typedRoutes: true,
    },
};

export default nextConfig;
