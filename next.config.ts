import type { NextConfig } from "next";

export default () => {
  const nextConfig: NextConfig = {
    cleanDistDir: true,
    devIndicators: {
      position: "bottom-right",
    },
    experimental: {
      useCache: true,
    },
    env: {
      NO_HTTPS: process.env.NO_HTTPS,
    },
  };
  return nextConfig;
};
