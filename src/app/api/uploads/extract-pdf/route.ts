export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { Buffer } from "node:buffer";
import { createRequire } from "node:module";

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

    // Try resolving pdfjs-dist paths via createRequire for robustness
    const require = createRequire(import.meta.url);
    const candidates = [
      "pdfjs-dist/build/pdf.mjs",
      "pdfjs-dist/build/pdf.js",
      "pdfjs-dist/legacy/build/pdf.mjs",
      "pdfjs-dist/legacy/build/pdf.js",
      "pdfjs-dist",
    ];

    let pdfjsLib: any = null;
    for (const spec of candidates) {
      try {
        const resolved = require.resolve(spec);
        // eslint-disable-next-line no-await-in-loop
        const mod = await import(resolved);
        if (mod) {
          pdfjsLib = mod;
          break;
        }
      } catch {}
    }

    if (!pdfjsLib) {
      // Graceful degradation: return empty text so client can proceed without errors
      return NextResponse.json({ text: "" });
    }

    const getDocument = pdfjsLib.getDocument || pdfjsLib.default?.getDocument;
    const GlobalWorkerOptions =
      pdfjsLib.GlobalWorkerOptions || pdfjsLib.default?.GlobalWorkerOptions;
    if (GlobalWorkerOptions) {
      GlobalWorkerOptions.workerSrc = undefined;
    }
    if (typeof getDocument !== "function") {
      return NextResponse.json({ text: "" });
    }

    const loadingTask = getDocument({ data: buffer });
    const pdf = await loadingTask.promise;

    let text = "";
    const maxPages = Math.min(pdf.numPages || 0, 200);
    for (let i = 1; i <= maxPages; i++) {
      // eslint-disable-next-line no-await-in-loop
      const page = await pdf.getPage(i);
      // eslint-disable-next-line no-await-in-loop
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