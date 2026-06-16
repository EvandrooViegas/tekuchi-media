import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    allowedDevOrigins: ['172.28.112.1', '127.0.0.1', '10.7.2.102', '172.30.176.1'],
    serverExternalPackages: ['tesseract.js'],
};

export default nextConfig;