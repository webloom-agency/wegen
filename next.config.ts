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
  // Explicitly set the port for Next.js (this should force binding on the correct port)
  server: {
    port: process.env.PORT || 3000,  // default to 3000 if PORT isn't set
  },
};

const withNextIntl = createNextIntlPlugin();
export default withNextIntl(nextConfig);
