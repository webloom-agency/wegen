import { config } from "dotenv";
import type { NextConfig } from "next";

config({
  path: ".env.local",
});
export default () => {
  const nextConfig: NextConfig = {
    cleanDistDir: true,
    devIndicators: {
      position: "bottom-right",
    },
    env: {
      NO_HTTPS: process.env.NO_HTTPS,
    },
  };
  return nextConfig;
};
