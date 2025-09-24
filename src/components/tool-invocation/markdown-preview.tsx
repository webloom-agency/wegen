"use client";

import { memo, useMemo } from "react";
import { Button } from "ui/button";
import { useCopy } from "@/hooks/use-copy";
import { cn } from "lib/utils";
import { Copy, ExternalLink } from "lucide-react";
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
      <div className="p-3">
        <Markdown>{markdown}</Markdown>
      </div>
    </div>
  );
});


