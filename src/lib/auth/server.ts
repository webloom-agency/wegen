import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { pgDb } from "lib/db/pg/db.pg";
import { headers } from "next/headers";
import { toast } from "sonner";
import {
  AccountSchema,
  SessionSchema,
  UserSchema,
  VerificationSchema,
} from "lib/db/pg/schema.pg";
import { getAuthConfig } from "./config";

import logger from "logger";
import { redirect } from "next/navigation";
import { sendEmail } from "lib/email/resend";

const {
  emailAndPasswordEnabled,
  signUpEnabled,
  socialAuthenticationProviders,
} = getAuthConfig();

const resolvedBaseURL =
  process.env.NEXT_PUBLIC_BASE_URL || process.env.BETTER_AUTH_URL || undefined;

export const auth = betterAuth({
  plugins: [nextCookies()],
  ...(resolvedBaseURL ? { baseURL: resolvedBaseURL } : {}),
  database: drizzleAdapter(pgDb, {
    provider: "pg",
    schema: {
      user: UserSchema,
      session: SessionSchema,
      account: AccountSchema,
      verification: VerificationSchema,
    },
  }),
  emailAndPassword: {
    enabled: emailAndPasswordEnabled,
    disableSignUp: !signUpEnabled,
    requireEmailVerification: true,
    async sendResetPassword({ user, url }) {
      await sendEmail({
        to: user.email,
        subject: "Reset your password",
        html: `Click the link to reset your password: <a href="${url}">${url}</a>`,
        text: `Reset your password: ${url}`,
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    async sendVerificationEmail({ user, url }) {
      await sendEmail({
        to: user.email,
        subject: "Verify your email",
        html: `Verify your email by clicking <a href="${url}">this link</a>.`,
        text: `Verify your email: ${url}`,
      });
    },
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 60 * 60,
    },
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day (every 1 day the session expiration is updated)
  },

  advanced: {
    useSecureCookies:
      process.env.NO_HTTPS == "1"
        ? false
        : process.env.NODE_ENV === "production",
    database: {
      generateId: false,
    },
  },
  account: {
    accountLinking: {
      trustedProviders: (
        Object.keys(
          socialAuthenticationProviders,
        ) as (keyof typeof socialAuthenticationProviders)[]
      ).filter((key) => socialAuthenticationProviders[key]),
    },
  },
  fetchOptions: {
    onError(e) {
      if (e.error.status === 429) {
        toast.error("Too many requests. Please try again later.");
      }
    },
  },
  socialProviders: socialAuthenticationProviders,
  // Ensure default role is 'user' on creation (defense in depth with DB default)
  databaseHooks: {
    user: {
      create: {
        before: async (user: any) => {
          if (user && !user.role) {
            return { data: { ...user, role: "user" } } as any;
          }
          return { data: user } as any;
        },
      },
    },
  },
});

const parseAllowedDomains = () =>
  (process.env.ALLOWED_SIGNUP_DOMAINS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

export const getSession = async () => {
  "use server";
  const session = await auth.api
    .getSession({
      headers: await headers(),
    })
    .catch((e) => {
      logger.error(e);
      return null;
    });
  if (!session) {
    logger.error("No session found");
    redirect("/sign-in");
  }

  // Enforce email verification
  if (session.user?.emailVerified === false) {
    redirect("/sign-in?reason=verify-email");
  }

  // Optional: enforce allowed domains if configured
  const allowed = parseAllowedDomains();
  if (allowed.length && session.user?.email) {
    const domain = String(session.user.email).toLowerCase().split("@")[1];
    if (!allowed.includes(domain)) {
      redirect("/sign-in?reason=domain-not-allowed");
    }
  }

  return session!;
};
