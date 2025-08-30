import { NextResponse } from "next/server";
import { auth } from "lib/auth/server";

export async function POST(request: Request) {
  try {
    const { email, callbackURL } = await request.json();
    if (!email) {
      return NextResponse.json({ message: "Email is required" }, { status: 400 });
    }
    // Use Better Auth built-in requestPasswordReset endpoint
    await (auth as any).api.requestPasswordReset({
      body: {
        email,
        redirectTo: callbackURL || "/",
      },
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ message: e?.message || "Failed to request password reset" }, { status: 500 });
  }
} 