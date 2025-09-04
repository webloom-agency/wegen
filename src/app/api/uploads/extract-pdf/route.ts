export const runtime = "nodejs";

import { NextResponse } from "next/server";
import pdfParse from "pdf-parse";
import { Buffer } from "node:buffer";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { url } = (await request.json()) as { url?: string };
    if (!url) {
      return NextResponse.json({ error: "Missing url" }, { status: 400 });
    }

    const res = await fetch(url);
    if (!res.ok) {
      return NextResponse.json({ error: `Failed to fetch PDF: ${res.status}` }, { status: 400 });
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const data = await pdfParse(buffer);

    return NextResponse.json({ text: data.text || "" });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to extract PDF" },
      { status: 500 },
    );
  }
} 