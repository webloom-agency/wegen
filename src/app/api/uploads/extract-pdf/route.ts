export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { Buffer } from "node:buffer";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const contentType = (request.headers.get("content-type") || "").toLowerCase();

    let buffer: Buffer | null = null;

    if (contentType.includes("application/pdf")) {
      // Raw PDF upload: read body directly
      const arrayBuffer = await request.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    } else {
      // JSON payload with { url }
      const { url } = (await request.json()) as { url?: string };
      if (!url) {
        return NextResponse.json({ error: "Missing url" }, { status: 400 });
      }
      const res = await fetch(url);
      if (!res.ok) {
        return NextResponse.json(
          { error: `Failed to fetch PDF: ${res.status}` },
          { status: 400 },
        );
      }
      const arrayBuffer = await res.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    }

    if (!buffer) {
      return NextResponse.json({ error: "No PDF content" }, { status: 400 });
    }

    // Dynamically import pdf-parse at runtime to avoid bundling issues
    const { default: pdfParse } = await import("pdf-parse");
    const data = await pdfParse(buffer);

    return NextResponse.json({ text: data.text || "" });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to extract PDF" },
      { status: 500 },
    );
  }
} 