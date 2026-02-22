import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb", // 🚀 1MB 용량 제한을 50MB로 대폭 상향!
    },
  },
};

export default nextConfig;