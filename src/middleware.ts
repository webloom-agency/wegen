import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const ALLOWED_DOMAIN = (process.env.ALLOWED_SIGNUP_DOMAINS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  /*
   * Playwright starts the dev server and requires a 200 status to
   * begin the tests, so this ensures that the tests can start
   */
  if (pathname.startsWith("/ping")) {
    return new Response("pong", { status: 200 });
  }
  const sessionCookie = getSessionCookie(request);

  if (!sessionCookie) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  // Enforce email verification & optional domain policy
  try {
    const payload = JSON.parse(Buffer.from(sessionCookie.value.split(".")[1], "base64").toString());
    const emailVerified = payload?.user?.emailVerified ?? payload?.emailVerified;
    const email = payload?.user?.email ?? payload?.email;
    if (emailVerified === false) {
      const url = new URL("/sign-in", request.url);
      url.searchParams.set("reason", "verify-email");
      return NextResponse.redirect(url);
    }
    if (ALLOWED_DOMAIN.length && email) {
      const domain = String(email).toLowerCase().split("@")[1];
      if (!ALLOWED_DOMAIN.includes(domain)) {
        const url = new URL("/sign-in", request.url);
        url.searchParams.set("reason", "domain-not-allowed");
        return NextResponse.redirect(url);
      }
    }
  } catch {
    // If decoding fails, continue; server routes still re-check session
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|api/auth|sign-in|sign-up).*)",
  ],
};
