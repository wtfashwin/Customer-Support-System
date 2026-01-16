/** @type {import('next').NextConfig} */
const nextConfig = {
    transpilePackages: ['@repo/api', '@repo/database'],
    typedRoutes: true,
};

export default nextConfig;
