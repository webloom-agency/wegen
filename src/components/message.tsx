"use client";

import type { UIMessage } from "ai";
import { memo, useMemo, useState } from "react";
import equal from "lib/equal";

import { cn, truncateString } from "lib/utils";
import type { UseChatHelpers } from "@ai-sdk/react";
import {
  UserMessagePart,
  AssistMessagePart,
  ToolMessagePart,
  ReasoningPart,
} from "./message-parts";
import { ChevronDown, ChevronUp, TriangleAlertIcon } from "lucide-react";
import { Button } from "ui/button";
import { useTranslations } from "next-intl";
import { ChatMessageAnnotation, ClientToolInvocation } from "app-types/chat";

interface Props {
  message: UIMessage;
  threadId?: string;
  isLoading: boolean;
  isLastMessage: boolean;
  setMessages: UseChatHelpers["setMessages"];
  reload: UseChatHelpers["reload"];
  className?: string;
  onPoxyToolCall?: (result: ClientToolInvocation) => void;
  status: UseChatHelpers["status"];
  messageIndex: number;
  isError?: boolean;
}

const PurePreviewMessage = ({
  message,
  threadId,
  setMessages,
  isLoading,
  isLastMessage,
  reload,
  status,
  className,
  onPoxyToolCall,
  messageIndex,
  isError,
}: Props) => {
  const isUserMessage = useMemo(() => message.role === "user", [message.role]);

  if (message.role == "system") {
    return null; // system message is not shown
  }

  if (!message.parts.length) return null;
  return (
    <div className="w-full mx-auto max-w-3xl px-6 group/message">
      <div
        className={cn(
          className,
          "flex gap-4 w-full group-data-[role=user]/message:ml-auto group-data-[role=user]/message:max-w-2xl",
        )}
      >
        <div className="flex flex-col gap-4 w-full">
          {message.experimental_attachments && (
            <div
              data-testid={"message-attachments"}
              className="flex flex-row justify-end gap-2 flex-wrap"
            >
              {message.experimental_attachments.map((attachment, idx) => {
                const isImage = (attachment as any).contentType?.startsWith(
                  "image/",
                );
                const name = (attachment as any).name as string | undefined;
                const url = (attachment as any).url as string;
                return isImage ? (
                  <a
                    key={`${url}-${idx}`}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md overflow-hidden border bg-background"
                    title={name || "image attachment"}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={name || "attachment"}
                      className="h-24 w-24 object-cover"
                    />
                  </a>
                ) : (
                  <a
                    key={`${url}-${idx}`}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    download={name || true}
                    className="px-2 py-1 text-xs rounded-md border bg-muted/70 hover:bg-muted transition-colors"
                    title={name || "attachment"}
                  >
                    {name || "attachment"}
                  </a>
                );
              })}
            </div>
          )}

          {useMemo(() => {
            // Deduplicate tool-invocation parts:
            // - Prefer the last 'result' per tool if present
            // - If no 'result' exists for a tool, keep only the FIRST 'call' for that tool and drop subsequent queued calls
            const parts = (message.parts as UIMessage["parts"]) || [];
            const resultExists = new Set<string>();
            const firstCallIndex = new Map<string, number>();
            for (let i = 0; i < parts.length; i++) {
              const pv: any = parts[i];
              if (pv?.type === "tool-invocation" && typeof pv?.toolInvocation?.toolName === "string") {
                const key = pv.toolInvocation.toolName as string;
                if (pv.toolInvocation.state === "result") {
                  resultExists.add(key);
                } else if (!firstCallIndex.has(key)) {
                  firstCallIndex.set(key, i);
                }
              }
            }
            const includedResult = new Set<string>();
            const includedCall = new Set<string>();
            const filtered: UIMessage["parts"] = [];
            for (let i = 0; i < parts.length; i++) {
              const p: any = parts[i];
              if (p?.type === "tool-invocation" && typeof p?.toolInvocation?.toolName === "string") {
                const key = p.toolInvocation.toolName as string;
                if (p.toolInvocation.state === "result") {
                  if (includedResult.has(key)) continue;
                  includedResult.add(key);
                  filtered.push(parts[i] as any);
                  continue;
                }
                // state !== 'result'
                if (resultExists.has(key)) {
                  // A result will appear or already appeared; hide interim queued calls
                  continue;
                }
                // Keep only the first call per tool
                if (firstCallIndex.get(key) !== i) continue;
                if (includedCall.has(key)) continue;
                includedCall.add(key);
                filtered.push(parts[i] as any);
                continue;
              }
              filtered.push(parts[i] as any);
            }
            return filtered;
          }, [message.parts])?.map((part, index, arr) => {
            const key = `message-${messageIndex}-part-${part.type}-${index}`;
            const isLastPart = index === arr.length - 1;

            if (part.type === "reasoning") {
              return (
                <ReasoningPart
                  key={key}
                  reasoning={part.reasoning}
                  isThinking={isLastPart && isLastMessage && isLoading}
                />
              );
            }

            if (isUserMessage && part.type === "text" && part.text) {
              return (
                <UserMessagePart
                  key={key}
                  status={status}
                  part={part}
                  isLast={isLastPart}
                  isError={isError}
                  message={message}
                  setMessages={setMessages}
                  reload={reload}
                />
              );
            }

            if (part.type === "text" && !isUserMessage) {
              return (
                <AssistMessagePart
                  threadId={threadId}
                  isLast={isLastMessage && isLastPart}
                  isLoading={isLoading}
                  key={key}
                  part={part}
                  showActions={
                    isLastMessage ? isLastPart && !isLoading : isLastPart
                  }
                  message={message}
                  setMessages={setMessages}
                  reload={reload}
                  isError={isError}
                />
              );
            }

            if (part.type === "tool-invocation") {
              const isLast = isLastMessage && isLastPart;

              const isManualToolInvocation = (
                message.annotations as ChatMessageAnnotation[]
              )?.some((a) => a.toolChoice == "manual");

              return (
                <ToolMessagePart
                  isLast={isLast}
                  messageId={message.id}
                  isManualToolInvocation={isManualToolInvocation}
                  showActions={
                    isLastMessage ? isLastPart && !isLoading : isLastPart
                  }
                  onPoxyToolCall={onPoxyToolCall}
                  key={key}
                  part={part}
                  isError={isError}
                  setMessages={setMessages}
                />
              );
            }
          })}
        </div>
      </div>
    </div>
  );
};

export const PreviewMessage = memo(
  PurePreviewMessage,
  (prevProps, nextProps) => {
    if (prevProps.message.id !== nextProps.message.id) return false;
    if (prevProps.isLoading !== nextProps.isLoading) return false;
    if (prevProps.isLastMessage !== nextProps.isLastMessage) return false;
    if (prevProps.className !== nextProps.className) return false;
    if (prevProps.status !== nextProps.status) return false;
    if (prevProps.message.annotations !== nextProps.message.annotations)
      return false;
    if (prevProps.isError !== nextProps.isError) return false;
    if (prevProps.onPoxyToolCall !== nextProps.onPoxyToolCall) return false;
    if (!equal(prevProps.message.parts, nextProps.message.parts)) return false;
    return true;
  },
);

export const ErrorMessage = ({
  error,
}: {
  error: Error;
  message?: UIMessage;
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const maxLength = 200;
  const t = useTranslations();
  return (
    <div className="w-full mx-auto max-w-3xl px-6 animate-in fade-in mt-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-4 px-2 opacity-70">
          <div className="flex items-start gap-3">
            <div className="p-1.5 bg-muted rounded-sm">
              <TriangleAlertIcon className="h-3.5 w-3.5 text-destructive" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-sm mb-2">{t("Chat.Error")}</p>
              <div className="text-sm text-muted-foreground">
                <div className="whitespace-pre-wrap">
                  {isExpanded
                    ? error.message
                    : truncateString(error.message, maxLength)}
                </div>
                {error.message.length > maxLength && (
                  <Button
                    onClick={() => setIsExpanded(!isExpanded)}
                    variant={"ghost"}
                    className="h-auto p-1 text-xs mt-2"
                    size={"sm"}
                  >
                    {isExpanded ? (
                      <>
                        <ChevronUp className="h-3 w-3 mr-1" />
                        {t("Common.showLess")}
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-3 w-3 mr-1" />
                        {t("Common.showMore")}
                      </>
                    )}
                  </Button>
                )}
                <p className="text-xs text-muted-foreground mt-3 italic">
                  {t("Chat.thisMessageWasNotSavedPleaseTryTheChatAgain")}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
