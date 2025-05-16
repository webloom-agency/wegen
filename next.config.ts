import type { NextConfig } from "next";

export default () => {
  const nextConfig: NextConfig = {
    serverExternalPackages:
      process.env.USE_FILE_SYSTEM_DB === "true" ? ["@libsql/client"] : [],
    cleanDistDir: true,
    devIndicators: {
      position: "bottom-right",
    },
    env: {
      DEPLOY_ENV: process.env.DEPLOY_ENV,
      AUTH_TRUST_HOST: process.env.AUTH_TRUST_HOST,
    },
  };
  return nextConfig;
};
