"use client";

import { ToolInvocationUIPart } from "app-types/chat";

import { cn, toAny } from "lib/utils";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckIcon,
  ChevronDown,
  ChevronDownIcon,
  CircleSmallIcon,
  Loader2Icon,
} from "lucide-react";

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
  const [expanded, setExpanded] = useState(false);

  const [isDiff, setIsDiff] = useState(false);

  const thinkingData = useMemo(() => {
    return (toAny(part).result || part.args) as
      | { steps: Partial<ThoughtData>[] }
      | undefined;
  }, [part.args, part.state]);

  const steps = useMemo(() => {
    return thinkingData?.steps || [];
  }, [thinkingData]);

  const second = useMemo(() => {
    if (!isDiff) return;
    return Math.floor((Date.now() - createdAt.current) / 1000);
  }, [part.state]);

  const header = useMemo(() => {
    const message = `Reasoned for ${second ? `${second} seconds` : "a few seconds"}`;
    if (part.state == "result") return message;
    return <TextShimmer>{message}</TextShimmer>;
  }, [part.state, second]);
  useEffect(() => {
    return () => {
      setIsDiff(true);
    };
  }, [part.state]);

  return (
    <div className="flex w-full px-6 ">
      <div className="flex flex-col">
        <div
          onClick={() => setExpanded(!expanded)}
          className="text-sm cursor-pointer text-muted-foreground select-none flex gap-2 items-center hover:text-foreground transition-colors"
        >
          {header}
          <ChevronDownIcon
            className={cn(
              "size-3 transition-transform",
              !expanded && "rotate-180",
            )}
          />
        </div>
        <div className={cn("pl-[7px] flex gap-4", expanded && "hidden")}>
          <div className="flex flex-col gap-2 py-4">
            {steps.map((step, index) => {
              const isLastStep = index === steps.length - 1;
              const isRunning = part.state !== "result";
              const isStepFinal = !isRunning && isLastStep;

              return (
                <div key={index} className="flex flex-col gap-1 group">
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        "w-3 h-3 rounded-full flex items-center justify-center",
                      )}
                    >
                      {isStepFinal ? (
                        <CheckIcon className="size-3 stroke-3" />
                      ) : (
                        <span className="text-[10px] font-medium">
                          {step.thoughtNumber}
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-medium text-muted-foreground">
                      {step.isRevision
                        ? `Revision of step ${step.revisesThought}`
                        : step.branchFromThought
                          ? `Branch from step ${step.branchFromThought}`
                          : `Step ${step.thoughtNumber}`}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground break-words px-2 ml-3 group-hover:text-foreground transition-colors">
                    <WordByWordFadeIn>{step.thought}</WordByWordFadeIn>
                  </p>
                  {!isLastStep && (
                    <div className="h-2 ml-[5px] w-0.5 bg-border" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export const SequentialThinkingToolInvocation = memo(
  PureSequentialThinkingToolInvocation,
);
