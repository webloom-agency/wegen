/// <reference types="node" />
import { execFile } from "child_process";
import { mkdtemp, writeFile, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

export type Attachment = {
  url: string;
  contentType?: string;
  name?: string;
};

function isPdfAttachment(att: Attachment): boolean {
  const ct = (att.contentType || "").toLowerCase();
  if (ct.includes("application/pdf")) return true;
  if (!ct && att.name && att.name.toLowerCase().endsWith(".pdf")) return true;
  if (att.url?.toLowerCase().startsWith("data:application/pdf")) return true;
  return false;
}

function dataUrlToBuffer(dataUrl: string): { buffer: Buffer; contentType: string } {
  const match = /^data:(.*?);base64,(.*)$/.exec(dataUrl);
  if (!match) throw new Error("Unsupported URL format: expected base64 data URL");
  const contentType = match[1] || "application/octet-stream";
  const base64 = match[2];
  const buffer = Buffer.from(base64, "base64");
  return { buffer, contentType };
}

function bufferToDataUrl(buffer: Buffer, contentType: string): string {
  const base64 = buffer.toString("base64");
  return `data:${contentType};base64,${base64}`;
}

async function execGhostscript(inputPath: string, outputPath: string): Promise<void> {
  const args = [
    "-sDEVICE=pdfwrite",
    "-dCompatibilityLevel=1.4",
    "-dPDFSETTINGS=/screen",
    "-dDetectDuplicateImages=true",
    "-dDownsampleColorImages=true",
    "-dColorImageDownsampleType=/Bicubic",
    "-dColorImageResolution=72",
    "-dDownsampleGrayImages=true",
    "-dGrayImageDownsampleType=/Bicubic",
    "-dGrayImageResolution=72",
    "-dDownsampleMonoImages=true",
    "-dMonoImageDownsampleType=/Subsample",
    "-dMonoImageResolution=72",
    "-dCompressFonts=true",
    "-dSubsetFonts=true",
    "-dNOPAUSE",
    "-dQUIET",
    "-dBATCH",
    `-sOutputFile=${outputPath}`,
    inputPath,
  ];
  await new Promise<void>((resolve, reject) => {
    execFile("gs", args, (err) => (err ? reject(err) : resolve()));
  });
}

export async function compressPdfBuffer(input: Buffer): Promise<Buffer> {
  const tempDir = await mkdtemp(join(tmpdir(), "pdf-"));
  const inPath = join(tempDir, "in.pdf");
  const outPath = join(tempDir, "out.pdf");
  try {
    await writeFile(inPath, input);
    await execGhostscript(inPath, outPath);
    return await readFile(outPath);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function compressPdfDataUrlIfBeneficial(dataUrl: string, minBytesToAttempt = 128 * 1024): Promise<string> {
  const { buffer } = dataUrlToBuffer(dataUrl);
  if (buffer.byteLength < minBytesToAttempt) return dataUrl;
  try {
    const compressed = await compressPdfBuffer(buffer);
    if (compressed.byteLength < buffer.byteLength) {
      return bufferToDataUrl(compressed, "application/pdf");
    }
    return dataUrl;
  } catch {
    return dataUrl;
  }
}

export async function compressPdfAttachmentsIfNeeded(attachments: Attachment[]): Promise<Attachment[]> {
  const results: Attachment[] = [];
  for (const att of attachments || []) {
    try {
      if (!att?.url) {
        results.push(att);
        continue;
      }
      if (!isPdfAttachment(att)) {
        results.push(att);
        continue;
      }
      if (!att.url.startsWith("data:")) {
        results.push(att);
        continue;
      }
      const newUrl = await compressPdfDataUrlIfBeneficial(att.url);
      results.push({ ...att, url: newUrl, contentType: att.contentType || "application/pdf" });
    } catch {
      results.push(att);
    }
  }
  return results;
} 