export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { Buffer } from "node:buffer";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const contentType = (request.headers.get("content-type") || "").toLowerCase();

    let buffer: Buffer | null = null;

    if (contentType.includes("application/pdf")) {
      const arrayBuffer = await request.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    } else {
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

    // Dynamically import pdfjs-dist for Node parsing without static type resolution
    const pdfjsPath = "pdfjs-dist/legacy/build/pdf.js";
    const pdfjsLib: any = await import(pdfjsPath);

    const loadingTask = pdfjsLib.getDocument({ data: buffer });
    const pdf = await loadingTask.promise;

    let text = "";
    const maxPages = Math.min(pdf.numPages || 0, 200);
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item: any) => (typeof item.str === "string" ? item.str : ""))
        .join(" ");
      text += (i > 1 ? "\n\n" : "") + pageText;
    }

    return NextResponse.json({ text });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to extract PDF" },
      { status: 500 },
    );
  }
} 