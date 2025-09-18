"use client";

import { useChat } from "@ai-sdk/react";
import { toast } from "sonner";
import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import PromptInput from "./prompt-input";
import clsx from "clsx";
import { appStore } from "@/app/store";
import { cn, createDebounce, generateUUID, truncateString } from "lib/utils";
import { ErrorMessage, PreviewMessage } from "./message";
import { ChatGreeting } from "./chat-greeting";

import { useShallow } from "zustand/shallow";
import { UIMessage } from "ai";

import { safe } from "ts-safe";
import { mutate } from "swr";
import {
  ChatApiSchemaRequestBody,
  ChatModel,
  ClientToolInvocation,
} from "app-types/chat";
import { useToRef } from "@/hooks/use-latest";
import { isShortcutEvent, Shortcuts } from "lib/keyboard-shortcuts";
import { Button } from "ui/button";
import { deleteThreadAction } from "@/app/api/chat/actions";
import { useRouter } from "next/navigation";
import { ArrowDown, Loader } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "ui/dialog";
import { useTranslations } from "next-intl";
import { Think } from "ui/think";
import { useGenerateThreadTitle } from "@/hooks/queries/use-generate-thread-title";
import dynamic from "next/dynamic";
import { useMounted } from "@/hooks/use-mounted";
import { getStorageManager } from "lib/browser-stroage";
import { AnimatePresence, motion } from "framer-motion";
import { ChatSideHints } from "./chat-side-hints";

type Props = {
  threadId: string;
  initialMessages: Array<UIMessage>;
  selectedChatModel?: string;
  slots?: {
    emptySlot?: ReactNode;
    inputBottomSlot?: ReactNode;
  };
};

const LightRays = dynamic(() => import("ui/light-rays"), {
  ssr: false,
});

const Particles = dynamic(() => import("ui/particles"), {
  ssr: false,
});

const debounce = createDebounce();

const firstTimeStorage = getStorageManager("IS_FIRST");
const isFirstTime = firstTimeStorage.get() ?? true;
firstTimeStorage.set(false);

export default function ChatBot({ threadId, initialMessages, slots }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const [thinking, setThinking] = useState(false);

  const [
    appStoreMutate,
    model,
    toolChoice,
    allowedAppDefaultToolkit,
    allowedMcpServers,
    threadList,
    threadMentions,
    pendingThreadMention,
  ] = appStore(
    useShallow((state) => [
      state.mutate,
      state.chatModel,
      state.toolChoice,
      state.allowedAppDefaultToolkit,
      state.allowedMcpServers,
      state.threadList,
      state.threadMentions,
      state.pendingThreadMention,
    ]),
  );

  const generateTitle = useGenerateThreadTitle({
    threadId,
  });

  const [showParticles, setShowParticles] = useState(isFirstTime);

  const {
    messages,
    input,
    setInput,
    append,
    status,
    reload,
    setMessages,
    addToolResult,
    error,
    stop,
  } = useChat({
    id: threadId,
    api: "/api/chat",
    initialMessages,
    experimental_prepareRequestBody: ({ messages, requestBody }) => {
      if (window.location.pathname !== `/chat/${threadId}`) {
        console.log("replace-state");
        window.history.replaceState({}, "", `/chat/${threadId}`);
      }
      const lastMessage = messages.at(-1)!;
      vercelAISdkV4ToolInvocationIssueCatcher(lastMessage);
      const request: ChatApiSchemaRequestBody = {
        id: latestRef.current.threadId,
        thinking,
        chatModel:
          (requestBody as { model: ChatModel })?.model ??
          latestRef.current.model,
        toolChoice: latestRef.current.toolChoice,
        // Keep allowed toolkits/servers even when mentions exist to allow mixed usage
        allowedAppDefaultToolkit: latestRef.current.allowedAppDefaultToolkit,
        allowedMcpServers: latestRef.current.allowedMcpServers,
        mentions: latestRef.current.mentions,
        message: lastMessage,
      };
      return request;
    },
    sendExtraMessageFields: true,
    generateId: generateUUID,
    experimental_throttle: 100,
    onFinish() {
      const messages = latestRef.current.messages;
      const prevThread = latestRef.current.threadList.find(
        (v) => v.id === threadId,
      );
      const isNewThread =
        !prevThread?.title &&
        messages.filter((v) => v.role === "user" || v.role === "assistant")
          .length < 3;
      if (isNewThread) {
        const part = messages
          .slice(0, 2)
          .flatMap((m) =>
            m.parts
              .filter((v) => v.type === "text")
              .map((p) => `${m.role}: ${truncateString(p.text, 500)}`),
          );
        if (part.length > 0) {
          generateTitle(part.join("\n\n"));
        }
      } else if (latestRef.current.threadList[0]?.id !== threadId) {
        mutate("/api/thread");
      }
    },
  });

  const [isDeleteThreadPopupOpen, setIsDeleteThreadPopupOpen] = useState(false);

  const mounted = useMounted();

  const latestRef = useToRef({
    toolChoice,
    model,
    allowedAppDefaultToolkit,
    allowedMcpServers,
    messages,
    threadList,
    threadId,
    mentions: threadMentions[threadId],
  });

  const isLoading = useMemo(
    () => status === "streaming" || status === "submitted",
    [status],
  );

  const emptyMessage = useMemo(
    () => messages.length === 0 && !error,
    [messages.length, error],
  );

  const isInitialThreadEntry = useMemo(
    () =>
      initialMessages.length > 0 &&
      initialMessages.at(-1)?.id === messages.at(-1)?.id,
    [messages],
  );

  const needSpaceClass = useCallback(
    (index: number) => {
      if (error || isInitialThreadEntry || index != messages.length - 1)
        return false;
      const message = messages[index];
      if (message.role === "user") return false;
      if (message.parts.at(-1)?.type == "step-start") return false;
      return true;
    },
    [messages, error],
  );

  const [isExecutingProxyToolCall, setIsExecutingProxyToolCall] =
    useState(false);

  const isPendingToolCall = useMemo(() => {
    if (status != "ready") return false;
    const lastMessage = messages.at(-1);
    if (lastMessage?.role != "assistant") return false;
    const lastPart = lastMessage.parts.at(-1);
    if (!lastPart) return false;
    if (lastPart.type != "tool-invocation") return false;
    if (lastPart.toolInvocation.state == "result") return false;
    return true;
  }, [status, messages]);

  const proxyToolCall = useCallback((result: ClientToolInvocation) => {
    setIsExecutingProxyToolCall(true);
    return safe(async () => {
      const lastMessage = latestRef.current.messages.at(-1)!;
      const lastPart = lastMessage.parts.at(-1)! as Extract<
        UIMessage["parts"][number],
        { type: "tool-invocation" }
      >;
      return addToolResult({
        toolCallId: lastPart.toolInvocation.toolCallId,
        result,
      });
    })
      .watch(() => setIsExecutingProxyToolCall(false))
      .unwrap();
  }, []);

  const handleThinkingChange = useCallback((thinking: boolean) => {
    setThinking(thinking);
  }, []);

  const space = useMemo(() => {
    if (!isLoading) return false;
    const lastMessage = messages.at(-1);
    if (lastMessage?.role == "user") return "think";
    const lastPart = lastMessage?.parts.at(-1);
    if (lastPart?.type == "step-start")
      return lastMessage?.parts.length == 1 ? "think" : "space";
    return false;
  }, [isLoading, messages.at(-1)]);

  const particle = useMemo(() => {
    return (
      <AnimatePresence>
        {showParticles && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 5 }}
          >
            <div className="absolute top-0 left-0 w-full h-full z-10">
              <LightRays />
            </div>
            <div className="absolute top-0 left-0 w-full h-full z-10">
              <Particles particleCount={400} particleBaseSize={10} />
            </div>

            <div className="absolute top-0 left-0 w-full h-full z-10">
              <div className="w-full h-full bg-gradient-to-t from-background to-50% to-transparent z-20" />
            </div>
            <div className="absolute top-0 left-0 w-full h-full z-10">
              <div className="w-full h-full bg-gradient-to-l from-background to-20% to-transparent z-20" />
            </div>
            <div className="absolute top-0 left-0 w-full h-full z-10">
              <div className="w-full h-full bg-gradient-to-r from-background to-20% to-transparent z-20" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }, [showParticles]);

  const handleFocus = useCallback(() => {
    setShowParticles(false);
    debounce(() => setShowParticles(true), 60000);
  }, []);

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const isScrollAtBottom = scrollHeight - scrollTop - clientHeight < 50;

    setIsAtBottom(isScrollAtBottom);
    handleFocus();
  }, [handleFocus]);

  const scrollToBottom = useCallback(() => {
    containerRef.current?.scrollTo({
      top: containerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, []);

  useEffect(() => {
    appStoreMutate({ currentThreadId: threadId });
    return () => {
      appStoreMutate({ currentThreadId: null });
    };
  }, [threadId]);

  useEffect(() => {
    if (pendingThreadMention && threadId) {
      appStoreMutate((prev) => ({
        threadMentions: {
          ...prev.threadMentions,
          [threadId]: [pendingThreadMention],
        },
        pendingThreadMention: undefined,
      }));
    }
  }, [pendingThreadMention, threadId, appStoreMutate]);

  useEffect(() => {
    if (isInitialThreadEntry)
      containerRef.current?.scrollTo({
        top: containerRef.current?.scrollHeight,
        behavior: "instant",
      });
  }, [isInitialThreadEntry]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const messages = latestRef.current.messages;
      if (messages.length === 0) return;
      const isLastMessageCopy = isShortcutEvent(e, Shortcuts.lastMessageCopy);
      const isDeleteThread = isShortcutEvent(e, Shortcuts.deleteThread);
      if (!isDeleteThread && !isLastMessageCopy) return;
      e.preventDefault();
      e.stopPropagation();
      if (isLastMessageCopy) {
        const lastMessage = messages.at(-1);
        const lastMessageText = lastMessage!.parts
          .filter((part) => part.type == "text")
          ?.at(-1)?.text;
        if (!lastMessageText) return;
        navigator.clipboard.writeText(lastMessageText);
        toast.success("Last message copied to clipboard");
      }
      if (isDeleteThread) {
        setIsDeleteThreadPopupOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (mounted) {
      handleFocus();
    }
  }, [input]);

  return (
    <>
      {particle}
      <div
        className={cn(
          emptyMessage && "justify-center pb-24",
          "flex flex-col min-w-0 relative h-full z-40",
        )}
      >
        {emptyMessage ? (
          slots?.emptySlot ? (
            slots.emptySlot
          ) : (
            <ChatGreeting />
          )
        ) : (
          <>
            <div
              className={"flex flex-col gap-2 overflow-y-auto py-6 z-10"}
              ref={containerRef}
              onScroll={handleScroll}
            >
              {messages.map((message, index) => {
                const isLastMessage = messages.length - 1 === index;
                return (
                  <PreviewMessage
                    threadId={threadId}
                    messageIndex={index}
                    key={index}
                    message={message}
                    status={status}
                    onPoxyToolCall={
                      isPendingToolCall &&
                      !isExecutingProxyToolCall &&
                      isLastMessage
                        ? proxyToolCall
                        : undefined
                    }
                    isLoading={isLoading || isPendingToolCall}
                    isLastMessage={isLastMessage}
                    setMessages={setMessages}
                    reload={reload}
                    className={
                      needSpaceClass(index) ? "min-h-[calc(55dvh-40px)]" : ""
                    }
                  />
                );
              })}
              {space && (
                <>
                  <div className="w-full mx-auto max-w-3xl px-6 relative">
                    <div className={space == "space" ? "opacity-0" : ""}>
                      <Think />
                    </div>
                  </div>
                  <div className="min-h-[calc(55dvh-56px)]" />
                </>
              )}

              {error && <ErrorMessage error={error} />}
              <div className="min-w-0 min-h-52" />
            </div>
          </>
        )}

        <div
          className={clsx(
            messages.length && "absolute bottom-14",
            "w-full z-10",
          )}
        >
          <div className="max-w-3xl mx-auto relative flex justify-center items-center -top-2">
            <ScrollToBottomButton
              show={!isAtBottom && messages.length > 0}
              onClick={scrollToBottom}
              className=""
            />
          </div>

          <div className="max-w-3xl mx-auto relative">
            <PromptInput
              input={input}
              threadId={threadId}
              append={append}
              thinking={thinking}
              setInput={setInput}
              onThinkingChange={handleThinkingChange}
              isLoading={isLoading || isPendingToolCall}
              onStop={stop}
              onFocus={isFirstTime ? undefined : handleFocus}
            />
            {input.length === 0 && !isLoading && (
              <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-40 w-full max-w-3xl flex justify-center">
                <ChatSideHints direction="row" onSelect={(text) => setInput(text)} />
              </div>
            )}
          </div>
          {slots?.inputBottomSlot}
        </div>
        <DeleteThreadPopup
          threadId={threadId}
          onClose={() => setIsDeleteThreadPopupOpen(false)}
          open={isDeleteThreadPopupOpen}
        />
      </div>
    </>
  );
}

function vercelAISdkV4ToolInvocationIssueCatcher(message: UIMessage) {
  if (message.role != "assistant") return;
  const lastPart = message.parts.at(-1);
  if (lastPart?.type != "tool-invocation") return;
  if (!message.toolInvocations)
    message.toolInvocations = [lastPart.toolInvocation];
}

function DeleteThreadPopup({
  threadId,
  onClose,
  open,
}: { threadId: string; onClose: () => void; open: boolean }) {
  const t = useTranslations();
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();
  const handleDelete = useCallback(() => {
    setIsDeleting(true);
    safe(() => deleteThreadAction(threadId))
      .watch(() => setIsDeleting(false))
      .ifOk(() => {
        toast.success(t("Chat.Thread.threadDeleted"));
        router.push("/");
      })
      .ifFail(() => toast.error(t("Chat.Thread.failedToDeleteThread")))
      .watch(() => onClose());
  }, [threadId, router]);
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Chat.Thread.deleteChat")}</DialogTitle>
          <DialogDescription>
            {t("Chat.Thread.areYouSureYouWantToDeleteThisChatThread")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t("Common.cancel")}
          </Button>
          <Button variant="destructive" onClick={handleDelete} autoFocus>
            {t("Common.delete")}
            {isDeleting && <Loader className="size-3.5 ml-2 animate-spin" />}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ScrollToBottomButtonProps {
  show: boolean;
  onClick: () => void;
  className?: string;
}

function ScrollToBottomButton({
  show,
  onClick,
  className,
}: ScrollToBottomButtonProps) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          className={className}
        >
          <Button
            onClick={onClick}
            className="shadow-lg backdrop-blur-sm border transition-colors"
            size="icon"
            variant="ghost"
          >
            <ArrowDown />
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
