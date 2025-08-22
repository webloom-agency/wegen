import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const BUILD_OUTPUT = process.env.NEXT_STANDALONE_OUTPUT
  ? "standalone"
  : undefined;

const nextConfig: NextConfig = {
  output: BUILD_OUTPUT,
  cleanDistDir: true,
  devIndicators: {
    position: "bottom-right",
  },
  env: {
    NO_HTTPS: process.env.NO_HTTPS,
  },
  experimental: {
    taint: true,
  },
};

const withNextIntl = createNextIntlPlugin();
export default withNextIntl(nextConfig);
