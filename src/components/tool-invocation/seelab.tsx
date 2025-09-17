"use client";

import { ToolInvocationUIPart } from "app-types/chat";
import { memo, useMemo, useState } from "react";
import { Separator } from "ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "ui/tooltip";
import { notify } from "lib/notify";
import JsonView from "ui/json-view";
import { TextShimmer } from "ui/text-shimmer";
import { ImageIcon, AlertTriangleIcon } from "lucide-react";

export interface SeelabResult {
  sessionId: string;
  status: string;
  imageCount: number;
  imageUrls: string[];
  logs?: any[];
  isError?: boolean;
  error?: string;
}

export function PureSeelabInvocation({
  part,
}: {
  part: ToolInvocationUIPart["toolInvocation"];
}) {
  const result = useMemo(() => {
    if (part.state !== "result") return null;
    return part.result as SeelabResult | { isError: true; error: string; logs?: any[] };
  }, [part.state]);

  const [errorSrc, setErrorSrc] = useState<string[]>([]);
  const onError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const target = e.currentTarget;
    if (errorSrc.includes(target.src)) return;
    setErrorSrc([...errorSrc, target.src]);
  };

  if (part.state !== "result") {
    return (
      <div className="flex items-center gap-2 text-sm">
        <ImageIcon className="size-4 wiggle text-muted-foreground" />
        <TextShimmer>Generating image with Seelab…</TextShimmer>
      </div>
    );
  }

  const images = (result as SeelabResult)?.imageUrls?.filter((u) => !!u && !errorSrc.includes(u)) || [];
  const hasError = (result as any)?.isError;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <ImageIcon className="size-4 text-muted-foreground" />
        <span className="text-sm font-semibold">Seelab Image Generation</span>
        <div className="ml-auto text-[10px] text-muted-foreground">
          {(result as any)?.sessionId ? `Session: ${(result as any).sessionId}` : null}
        </div>
      </div>
      <div className="flex gap-2">
        <div className="px-2.5">
          <Separator orientation="vertical" className="bg-gradient-to-b from-border to-transparent from-80%" />
        </div>
        <div className="flex flex-col gap-2 pb-2">
          {hasError ? (
            <div className="text-xs text-destructive flex items-center gap-1">
              <AlertTriangleIcon className="size-3.5" />
              {(result as any)?.error || "Error"}
            </div>
          ) : null}
          {images.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-w-3xl">
              {images.map((url) => (
                <Tooltip key={url}>
                  <TooltipTrigger asChild>
                    <div
                      onClick={() => {
                        notify.component({
                          className: "max-w-[90vw]! max-h-[90vh]! p-6!",
                          children: (
                            <div className="flex flex-col h-full gap-4">
                              <div className="flex-1 flex items-center justify-center min-h-0 py-6">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={url}
                                  className="max-w-[80vw] max-h-[80vh] object-contain rounded-lg"
                                  alt={url}
                                  onError={onError}
                                />
                              </div>
                            </div>
                          ),
                        });
                      }}
                      className="block shadow rounded-lg overflow-hidden ring ring-input cursor-pointer"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        loading="lazy"
                        src={url}
                        alt={url}
                        className="w-full h-48 object-cover hover:scale-120 transition-transform duration-300"
                        onError={onError}
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="p-2 max-w-xs whitespace-pre-wrap break-words">
                    <p className="text-xs text-muted-foreground">{url}</p>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          )}
          <div className="text-[10px] text-muted-foreground">
            {Array.isArray((result as any)?.logs) && (
              <details>
                <summary className="cursor-pointer">Logs</summary>
                <div className="mt-2 p-2 bg-secondary rounded">
                  <JsonView data={(result as any).logs} />
                </div>
              </details>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export const SeelabInvocation = memo(PureSeelabInvocation);


