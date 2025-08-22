import { NextRequest } from "next/server";
import { auth } from "auth/server";

function parseAllowlist() {
  const domains = (process.env.ALLOWED_SIGNUP_DOMAINS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const emails = (process.env.ALLOWED_SIGNUP_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return { domains, emails };
}

function isEmailAllowed(email: string) {
  const { domains, emails } = parseAllowlist();
  const lower = email.toLowerCase();
  if (emails.includes(lower)) return true;
  const domain = lower.split("@")[1];
  if (!domain) return false;
  return domains.includes(domain);
}

export async function POST(request: NextRequest) {
  // Clone first, because body is a stream
  const cloned = request.clone();
  let email: string | undefined;
  try {
    const body = await cloned.json();
    email = body?.email || body?.identifier || undefined;
  } catch {
    // ignore JSON parse error; fall back to raw handler
  }

  // If a whitelist is configured, enforce it; otherwise, allow
  const hasAllowlist = Boolean(
    (process.env.ALLOWED_SIGNUP_DOMAINS || process.env.ALLOWED_SIGNUP_EMAILS)?.trim(),
  );
  if (hasAllowlist) {
    if (!email || !isEmailAllowed(email)) {
      return new Response(
        JSON.stringify({
          error: "signup_not_allowed",
          message:
            "Sign-up is restricted. Please use an allowed email address.",
        }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  // Delegate to Better Auth handler for actual sign-up
  return auth.handler(request);
} 