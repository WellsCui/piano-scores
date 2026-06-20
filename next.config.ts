import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['192.168.2.40'],
  experimental: {
    // Allow large PDF uploads (up to 50 MB)
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
};

export default nextConfig;
