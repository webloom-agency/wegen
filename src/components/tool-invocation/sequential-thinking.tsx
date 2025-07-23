"use client";

import { ToolInvocationUIPart } from "app-types/chat";

import { cn, isNull, toAny } from "lib/utils";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { CheckIcon, CircleSmallIcon, Loader2Icon } from "lucide-react";

import { TextShimmer } from "ui/text-shimmer";
import { ThoughtData } from "lib/ai/tools/thinking/sequential-thinking";
import { WordByWordFadeIn } from "../markdown";

interface SequentialThinkingToolInvocationProps {
  part: ToolInvocationUIPart["toolInvocation"];
}

function PureSequentialThinkingToolInvocation({
  part,
}: SequentialThinkingToolInvocationProps) {
  const createdAt = useRef(Date.now());

  const [isDiff, setIsDiff] = useState(false);

  const think = useMemo(() => {
    return (toAny(part).result || part.args) as
      | Partial<ThoughtData>
      | undefined;
  }, [part.args, part.state]);

  const isFinalStep = useMemo(() => {
    return (
      !isNull(think?.thoughtNumber) &&
      (think?.totalThoughts ?? 1) > 1 &&
      think?.thoughtNumber == think?.totalThoughts
    );
  }, [think?.thoughtNumber, think?.totalThoughts]);

  const second = useMemo(() => {
    if (!isDiff) return;
    return Math.floor((Date.now() - createdAt.current) / 1000);
  }, [part.state]);

  const header = useMemo(() => {
    const message = `Reasoned for ${second ? `${second} seconds` : "a few seconds"}`;
    if (part.state == "result") {
      if (!isNull(think?.thoughtNumber) && (think?.totalThoughts ?? 1) > 1) {
        if (isFinalStep) {
          return `Final step`;
        }
        return `Step ${think?.thoughtNumber} of ${think?.totalThoughts}`;
      }
      return message;
    }
    return <TextShimmer>{message}</TextShimmer>;
  }, [
    part.state,
    second,
    think?.thoughtNumber,
    think?.totalThoughts,
    isFinalStep,
  ]);
  useEffect(() => {
    return () => {
      setIsDiff(true);
    };
  }, [part.state]);

  return (
    <div className="flex w-full px-6 group">
      <div className="flex flex-col">
        <div className="text-sm text-muted-foreground select-none flex flex-row gap-4 items-center group-hover:text-foreground transition-colors">
          <div
            className={cn(
              "w-4 h-4 rounded-full flex items-center justify-center transition-colors",
              part.state == "result"
                ? "bg-secondary text-secondary-foreground"
                : "bg-muted text-muted-foreground",
            )}
          >
            {isFinalStep ? (
              <CheckIcon className="size-2.5 stroke-3" />
            ) : part.state == "result" ? (
              <CircleSmallIcon className="size-4 fill-background text-background" />
            ) : (
              <Loader2Icon className="size-2.5 animate-spin" />
            )}
          </div>
          <span className={isFinalStep ? "text-foreground font-semibold" : ""}>
            {header}
          </span>
        </div>
        <div className="pl-[7px] flex gap-4">
          <div
            className={cn(
              "h-[calc(100%+1rem)] flex-shrink-0 w-0.5! bg-secondary bg-gradient-to-b from-secondary to-transparent from-90%",
              isFinalStep && "bg-transparent",
            )}
          />
          <p className="text-xs text-muted-foreground break-words py-4 px-2 group-hover:text-foreground transition-colors">
            <WordByWordFadeIn>{think?.thought}</WordByWordFadeIn>
          </p>
        </div>
      </div>
    </div>
  );
}

export const SequentialThinkingToolInvocation = memo(
  PureSequentialThinkingToolInvocation,
);
