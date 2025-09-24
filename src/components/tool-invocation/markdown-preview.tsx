"use client";

import { memo, useMemo, useRef } from "react";
import { Button } from "ui/button";
import { useCopy } from "@/hooks/use-copy";
import { cn } from "lib/utils";
import { Copy, ExternalLink, Printer } from "lucide-react";
import { Markdown } from "../markdown";

interface MarkdownPreviewProps {
  markdown: string;
  title?: string;
  className?: string;
}

export const MarkdownPreview = memo(function MarkdownPreview({
  markdown,
  title = "Markdown Preview",
  className,
}: MarkdownPreviewProps) {
  const { copied, copy } = useCopy();
  const contentRef = useRef<HTMLDivElement | null>(null);

  const blobUrl = useMemo(() => {
    try {
      const blob = new Blob([markdown], {
        type: "text/markdown;charset=utf-8",
      });
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  }, [markdown]);

  const handlePrint = () => {
    try {
      const baseCss = `
        <style>
          @page { size: A4; margin: 18mm; }
          html, body { height: 100%; }
          body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; color: #111827; line-height: 1.5; }
          h1,h2,h3,h4,h5,h6 { color: #111827; margin: 0 0 12px 0; }
          p { margin: 0 0 10px 0; }
          a { color: #111827; text-decoration: underline; }
          code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; background: #f3f4f6; padding: 2px 4px; border-radius: 4px; }
          pre { background: #f3f4f6; padding: 12px; border-radius: 8px; overflow: auto; white-space: pre-wrap; word-break: break-word; }
          img { max-width: 100%; height: auto; }
          table { width: 100%; border-collapse: collapse; margin: 12px 0; table-layout: fixed; }
          th, td { border: 1px solid #e5e7eb; padding: 8px; text-align: left; vertical-align: top; word-break: break-word; white-space: pre-wrap; }
          th { background: #f9fafb; font-weight: 600; }
          blockquote { border-left: 3px solid #e5e7eb; padding: 8px 12px; margin: 8px 0; color: #374151; background: #f9fafb; }
          ul, ol { margin: 8px 0 8px 20px; }
        </style>`;
      const htmlContent = contentRef.current?.innerHTML || "";
      const docHtml = `<!doctype html><html><head><meta charset=\"utf-8\"><title>${title}</title>${baseCss}</head><body>${htmlContent}</body></html>`;

      const frame = document.createElement("iframe");
      frame.style.position = "fixed";
      frame.style.right = "0";
      frame.style.bottom = "0";
      frame.style.width = "0";
      frame.style.height = "0";
      frame.style.border = "0";
      document.body.appendChild(frame);
      const doc = frame.contentDocument || frame.contentWindow?.document;
      if (!doc) return;
      doc.open();
      doc.write(docHtml);
      doc.close();
      setTimeout(() => {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
        setTimeout(() => {
          document.body.removeChild(frame);
        }, 800);
      }, 200);
    } catch {}
  };

  return (
    <div className={cn("w-full border rounded-lg bg-card", className)}>
      <div className="flex items-center gap-2 px-3 py-2 border-b">
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-3! p-4!"
            onClick={() => copy(markdown)}
            title="Copy Markdown"
          >
            {copied ? <Copy className="size-3" /> : <Copy className="size-3" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-3! p-4!"
            onClick={handlePrint}
            title="Print / Save as PDF"
          >
            <Printer className="size-3" />
          </Button>
          {blobUrl && (
            <Button
              variant="ghost"
              size="icon"
              className="size-3! p-4!"
              onClick={() => {
                window.open(blobUrl, "_blank", "noopener,noreferrer");
              }}
              title="Open in new tab"
            >
              <ExternalLink className="size-3" />
            </Button>
          )}
        </div>
      </div>
      <div className="p-3" ref={contentRef}>
        <Markdown>{markdown}</Markdown>
      </div>
    </div>
  );
});


