import { betterAuth } from "better-auth";
import { IS_VERCEL_ENV } from "lib/const";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { pgDb } from "lib/db/pg/db.pg";
import {
  AccountSchema,
  SessionSchema,
  UserSchema,
  VerificationSchema,
} from "lib/db/pg/schema.pg";
export const auth = betterAuth({
  plugins: [nextCookies()],
  database: drizzleAdapter(pgDb, {
    provider: "pg",
    schema: {
      user: UserSchema,
      session: SessionSchema,
      account: AccountSchema,
      verification: VerificationSchema,
    },
  }),
  baseURL:
    process.env.BETTER_AUTH_URL ??
    (IS_VERCEL_ENV
      ? `https://${process.env.VERCEL_URL}`
      : `http://localhost:${process.env.PORT ?? 3000}`),
  emailAndPassword: {
    enabled: true,
    // requireEmailVerification: false,
    disableSignUp: process.env.DISABLE_REGISTRATION ? true : false,
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 10 * 60,
    },
  },
  advanced: {
    useSecureCookies:
      process.env.NO_HTTPS == "1"
        ? false
        : process.env.NODE_ENV === "production",
    database: {
      generateId: false,
    },
    cookiePrefix: "mcc",
  },

  account: {
    accountLinking: {
      trustedProviders: ["google", "github"],
    },
  },
  // socialProviders: {
  //   github: {
  //     clientId: process.env.GITHUB_CLIENT_ID || "",
  //     clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
  //   },
  //   google: {
  //     clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "",
  //     clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  //   },
  // },
});
