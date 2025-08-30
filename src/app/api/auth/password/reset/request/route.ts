import { NextResponse } from "next/server";
import { auth } from "lib/auth/server";

export async function POST(request: Request) {
  try {
    const { email, callbackURL } = await request.json();
    if (!email) {
      return NextResponse.json({ message: "Email is required" }, { status: 400 });
    }
    // Call Better Auth password reset request (cast to any to avoid type mismatch across versions)
    await (auth as any).api.password.reset.request({
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