"use client";

import { memo, useMemo, useRef, useState } from "react";
import { Button } from "ui/button";
import { Copy, ExternalLink, Printer } from "lucide-react";
import { useCopy } from "@/hooks/use-copy";
import { cn } from "lib/utils";

interface HtmlPreviewProps {
  html: string;
  title?: string;
  className?: string;
  initialHeight?: number;
}

export const HtmlPreview = memo(function HtmlPreview({
  html,
  title = "HTML Preview",
  className,
  initialHeight = 360,
}: HtmlPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [height, setHeight] = useState<number>(initialHeight);
  const { copied, copy } = useCopy();

  const blobUrl = useMemo(() => {
    try {
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  }, [html]);

  const handlePrint = () => {
    try {
      const printWindow = window.open("", "_blank", "noopener,noreferrer");
      if (!printWindow) return;
      const hasHtmlTag = /<\s*html[\s>]/i.test(html);
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
        </style>`;
      const fullDoc = hasHtmlTag
        ? html.replace(/<\s*head\s*>/i, `<head>${baseCss}`)
        : `<!doctype html><html><head><meta charset=\"utf-8\"><title>${title}</title>${baseCss}</head><body>${html}</body></html>`;

      printWindow.document.open();
      printWindow.document.write(fullDoc);
      printWindow.document.close();
      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
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
            onClick={() => copy(html)}
            title="Copy HTML"
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
      <div className="w-full">
        <iframe
          ref={iframeRef}
          title={title}
          sandbox="allow-scripts allow-forms allow-pointer-lock allow-popups allow-modals allow-presentation"
          srcDoc={html}
          style={{ width: "100%", height }}
          className="rounded-b-lg bg-white"
        />
      </div>
      <div className="flex items-center justify-end gap-2 px-3 py-2 border-t">
        <span className="text-[10px] text-muted-foreground">Height: {height}px</span>
        <input
          type="range"
          min={200}
          max={1000}
          step={10}
          value={height}
          onChange={(e) => setHeight(parseInt(e.target.value, 10))}
          className="w-40"
        />
      </div>
    </div>
  );
});


