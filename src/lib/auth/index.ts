import { betterAuth } from "better-auth";
import { IS_VERCEL_ENV } from "lib/const";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { pgDb } from "lib/db/pg/db.pg";
export const auth = betterAuth({
  plugins: [nextCookies()],
  database: drizzleAdapter(pgDb, {
    provider: "pg",
  }),
  baseURL:
    process.env.BETTER_AUTH_URL ??
    (IS_VERCEL_ENV
      ? `https://${process.env.VERCEL_URL}`
      : `http://localhost:${process.env.PORT ?? 3000}`),
  emailAndPassword: {
    enabled: true,
  },
});
