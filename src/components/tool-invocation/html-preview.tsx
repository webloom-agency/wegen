"use client";

import { memo, useMemo, useRef, useState } from "react";
import { Button } from "ui/button";
import { Copy, ExternalLink } from "lucide-react";
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
          sandbox=""
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


