"use client";

import {
  AudioWaveformIcon,
  ChevronDown,
  CornerRightUp,
  LightbulbIcon,
  PlusIcon,
  Square,
  XIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "ui/button";
import { UseChatHelpers } from "@ai-sdk/react";
import { SelectModel } from "./select-model";
import { appStore } from "@/app/store";
import { useShallow } from "zustand/shallow";
import { ChatMention, ChatModel } from "app-types/chat";
import dynamic from "next/dynamic";
import { ToolModeDropdown } from "./tool-mode-dropdown";

import { ToolSelectDropdown } from "./tool-select-dropdown";
import { Tooltip, TooltipContent, TooltipTrigger } from "ui/tooltip";
import { useTranslations } from "next-intl";
import { Editor } from "@tiptap/react";
import { WorkflowSummary } from "app-types/workflow";
import { Avatar, AvatarFallback, AvatarImage } from "ui/avatar";
import equal from "lib/equal";
import { MCPIcon } from "ui/mcp-icon";
import { DefaultToolName } from "lib/ai/tools";
import { DefaultToolIcon } from "./default-tool-icon";
import { OpenAIIcon } from "ui/openai-icon";
import { GrokIcon } from "ui/grok-icon";
import { ClaudeIcon } from "ui/claude-icon";
import { GeminiIcon } from "ui/gemini-icon";
import { cn } from "lib/utils";
import { getShortcutKeyList, isShortcutEvent } from "lib/keyboard-shortcuts";
import { AgentSummary } from "app-types/agent";
import { EMOJI_DATA } from "lib/const";
import { toast } from "sonner";
import Image from "next/image";

interface PromptInputProps {
  placeholder?: string;
  setInput: (value: string) => void;
  input: string;
  onStop: () => void;
  append: UseChatHelpers["append"];
  toolDisabled?: boolean;
  isLoading?: boolean;
  model?: ChatModel;
  onThinkingChange?: (thinking: boolean) => void;
  thinking?: boolean;
  setModel?: (model: ChatModel) => void;
  voiceDisabled?: boolean;
  threadId?: string;
  disabledMention?: boolean;
  onFocus?: () => void;
}

const ChatMentionInput = dynamic(() => import("./chat-mention-input"), {
  ssr: false,
  loading() {
    return <div className="h-[2rem] w-full animate-pulse"></div>;
  },
});

const THINKING_SHORTCUT = {
  shortcut: {
    command: true,
    key: "E",
  },
};

export default function PromptInput({
  placeholder,
  append,
  model,
  setModel,
  input,
  onFocus,
  setInput,
  onStop,
  isLoading,
  toolDisabled,
  voiceDisabled,
  threadId,
  onThinkingChange,
  thinking,
  disabledMention,
}: PromptInputProps) {
  const t = useTranslations("Chat");

  const [globalModel, threadMentions, appStoreMutate] = appStore(
    useShallow((state) => [
      state.chatModel,
      state.threadMentions,
      state.mutate,
    ]),
  );

  const mentions = useMemo<ChatMention[]>(() => {
    if (!threadId) return [];
    return threadMentions[threadId!] ?? [];
  }, [threadMentions, threadId]);

  const chatModel = useMemo(() => {
    return model ?? globalModel;
  }, [model, globalModel]);

  const editorRef = useRef<Editor | null>(null);

  // Pending attachments selected via the "+" button
  const [pendingAttachments, setPendingAttachments] = useState<
    { url: string; contentType: string; name?: string; size?: number; textContent?: string }[]
  >([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const setChatModel = useCallback(
    (model: ChatModel) => {
      if (setModel) {
        setModel(model);
      } else {
        appStoreMutate({ chatModel: model });
      }
    },
    [setModel, appStoreMutate],
  );

  const deleteMention = useCallback(
    (mention: ChatMention) => {
      if (!threadId) return;
      appStoreMutate((prev) => {
        const newMentions = mentions.filter((m) => !equal(m, mention));
        return {
          threadMentions: {
            ...prev.threadMentions,
            [threadId!]: newMentions,
          },
        };
      });
    },
    [mentions, threadId],
  );

  const addMention = useCallback(
    (mention: ChatMention) => {
      if (!threadId) return;
      appStoreMutate((prev) => {
        if (mentions.some((m) => equal(m, mention))) return prev;

        const newMentions =
          mention.type == "agent"
            ? [...mentions.filter((m) => m.type !== "agent"), mention]
            : [...mentions, mention];

        return {
          threadMentions: {
            ...prev.threadMentions,
            [threadId!]: newMentions,
          },
        };
      });
    },
    [mentions, threadId],
  );

  const onSelectWorkflow = useCallback(
    (workflow: WorkflowSummary) => {
      addMention({
        type: "workflow",
        name: workflow.name,
        icon: workflow.icon,
        workflowId: workflow.id,
        description: workflow.description,
      });
    },
    [addMention],
  );

  const onSelectAgent = useCallback(
    (agent: AgentSummary) => {
      appStoreMutate((prev) => {
        return {
          threadMentions: {
            ...prev.threadMentions,
            [threadId!]: [
              {
                type: "agent",
                name: agent.name,
                icon: agent.icon,
                description: agent.description,
                agentId: agent.id,
              },
            ],
          },
        };
      });
    },
    [mentions, threadId],
  );

  const onChangeMention = useCallback(
    (mentions: ChatMention[]) => {
      let hasAgent = false;
      [...mentions]
        .reverse()
        .filter((m) => {
          if (m.type == "agent") {
            if (hasAgent) return false;
            hasAgent = true;
          }

          return true;
        })
        .reverse()
        .forEach(addMention);
    },
    [addMention],
  );

  // Helpers for file attachments
  const ACCEPTED_EXTENSIONS = [
    // Documents
    ".pdf", ".docx", ".txt", ".rtf", ".md", ".odt",
    // Spreadsheets & Data
    ".xlsx", ".csv", ".ods",
    // Presentations
    ".pptx", ".odp",
    // Images
    ".png", ".jpg", ".jpeg", ".gif", ".webp",
    // Code files (common)
    ".py", ".html", ".js", ".ts", ".tsx", ".json", ".css"
  ];

  const isTextLikeFile = (file: File) => {
    const type = file.type.toLowerCase();
    const name = file.name.toLowerCase();
    const textExts = [
      ".txt",
      ".md",
      ".json",
      ".csv",
      ".js",
      ".ts",
      ".tsx",
      ".py",
      ".html",
      ".css",
    ];
    return (
      type.startsWith("text/") ||
      type === "application/json" ||
      type === "text/markdown" ||
      textExts.some((ext) => name.endsWith(ext))
    );
  };

  const languageFromFilename = (name?: string) => {
    const lower = (name || "").toLowerCase();
    if (lower.endsWith(".json")) return "json";
    if (lower.endsWith(".csv")) return "csv";
    if (lower.endsWith(".md")) return "md";
    if (lower.endsWith(".py")) return "python";
    if (lower.endsWith(".html")) return "html";
    if (lower.endsWith(".css")) return "css";
    if (lower.endsWith(".tsx")) return "tsx";
    if (lower.endsWith(".ts")) return "ts";
    if (lower.endsWith(".js")) return "js";
    if (lower.endsWith(".txt")) return "txt";
    return "";
  };

  const onFilesPicked = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const MAX_FILES = 10;
    const MAX_TEXT_FILE_SIZE = 15 * 1024 * 1024; // 15MB for text-like files

    const selected = Array.from(files);

    if (pendingAttachments.length + selected.length > MAX_FILES) {
      toast.warning(`You can attach up to ${MAX_FILES} files.`);
      return;
    }

    for (const file of selected) {
      const lowerName = file.name.toLowerCase();
      const allowed = ACCEPTED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
      if (!allowed) {
        toast.warning(`Unsupported file type: ${file.name}`);
        continue;
      }

      const isText = isTextLikeFile(file);
      const isPdf = lowerName.endsWith(".pdf") || file.type === "application/pdf";
      const isImage = (file.type || "").toLowerCase().startsWith("image/");

      try {
        if (isText) {
          if (file.size > MAX_TEXT_FILE_SIZE) {
            toast.warning(`File too large (max 15MB for text files): ${file.name}`);
            continue;
          }
          const text = await file.text();
          setPendingAttachments((prev) => [
            ...prev,
            {
              url: `data:text/plain;base64,${btoa(unescape(encodeURIComponent(text)))}`,
              contentType: file.type || "text/plain",
              name: file.name,
              size: file.size,
              textContent: text,
            },
          ]);
        } else if (isPdf) {
          let textContent: string | undefined = undefined;
          try {
            const res = await fetch("/api/uploads/extract-pdf", {
              method: "POST",
              headers: { "Content-Type": "application/pdf" },
              body: file,
            });
            const data = (await res.json()) as { text?: string; error?: string };
            if (res.ok && data.text) {
              textContent = data.text;
            } else if (!res.ok) {
              toast.warning(data.error || `Failed to extract text from ${file.name}`);
            }
          } catch (e) {
            toast.warning(`Failed to extract text from ${file.name}`);
          }
          if (textContent && textContent.length > 0) {
            setPendingAttachments((prev) => [
              ...prev,
              {
                url: `data:text/plain;base64,${btoa(unescape(encodeURIComponent(textContent)))}`,
                contentType: "text/plain",
                name: file.name,
                size: file.size,
                textContent,
              },
            ]);
          } else {
            // No text extracted; skip adding this file to avoid invalid attachments
            continue;
          }
        } else if (isImage) {
          await new Promise<void>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => {
              setPendingAttachments((prev) => [
                ...prev,
                {
                  url: String(reader.result || ""),
                  contentType: file.type || "application/octet-stream",
                  name: file.name,
                  size: file.size,
                },
              ]);
              resolve();
            };
            reader.readAsDataURL(file);
          });
        } else {
          // Other binaries: skip to avoid large payloads and invalid URLs
          toast.warning(`Skipping unsupported binary file: ${file.name}`);
          continue;
        }
      } catch (err) {
        toast.warning(`Failed to process file: ${file.name}`);
      }
    }

    // clear the input value so picking the same file again triggers change
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const submit = () => {
    if (isLoading) return;
    const userMessage = input?.trim() || "";
    if (userMessage.length === 0 && pendingAttachments.length === 0) return;

    const parts: { type: "text"; text: string }[] = [];

    if (userMessage.length > 0) {
      parts.push({ type: "text", text: userMessage });
    }

    // Append inline text contents from text-like attachments so the model can use them
    for (const att of pendingAttachments) {
      if (att.textContent) {
        const lang = languageFromFilename(att.name);
        const MAX_INLINE_TEXT_CHARS = 100000;
        const isTruncated = att.textContent.length > MAX_INLINE_TEXT_CHARS;
        const inlineText = isTruncated
          ? att.textContent.slice(0, MAX_INLINE_TEXT_CHARS) + "\n...\n[truncated to avoid large request size]"
          : att.textContent;
        const fenced = lang ? `\n\n\`\`\`${lang}\n${inlineText}\n\`\`\`` : `\n\n\`\`\`\n${inlineText}\n\`\`\``;
        parts.push({
          type: "text",
          text: `Attached file: ${att.name}${fenced}`,
        });
      }
    }

    setInput("");

    append!({
      role: "user",
      content: "",
      parts,
      experimental_attachments: pendingAttachments
        .filter((a) => typeof a.url === "string" && (a.url.startsWith("data:") || a.url.startsWith("http")))
        .map((a) => ({
          url: a.url,
          contentType: a.contentType,
          name: a.name,
        })),
    });

    // Clear pending attachments after sending
    setPendingAttachments([]);
  };

  useEffect(() => {
    if (!onThinkingChange) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isShortcutEvent(e, THINKING_SHORTCUT)) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        onThinkingChange(!thinking);
        editorRef.current?.commands.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [!!onThinkingChange, thinking]);

  // Handle ESC key to clear mentions
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && mentions.length > 0 && threadId) {
        e.preventDefault();
        e.stopPropagation();
        appStoreMutate((prev) => ({
          threadMentions: {
            ...prev.threadMentions,
            [threadId]: [],
          },
          agentId: undefined,
        }));
        editorRef.current?.commands.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mentions.length, threadId, appStoreMutate]);

  useEffect(() => {
    if (!editorRef.current) return;
  }, [editorRef.current]);

  return (
    <div className="max-w-3xl mx-auto fade-in animate-in">
      <div className="z-10 mx-auto w-full max-w-3xl relative">
        <fieldset className="flex w-full min-w-0 max-w-full flex-col px-4">
          <div className="shadow-lg overflow-hidden rounded-4xl backdrop-blur-sm transition-all duration-200 bg-muted/60 relative flex w-full flex-col cursor-text z-10 items-stretch focus-within:bg-muted hover:bg-muted focus-within:ring-muted hover:ring-muted">
            {mentions.length > 0 && (
              <div className="bg-input rounded-b-sm rounded-t-3xl p-3 flex flex-col gap-4 mx-2 my-2">
                {mentions.map((mention, i) => {
                  return (
                    <div key={i} className="flex items-center gap-2">
                      {mention.type === "workflow" ||
                      mention.type === "agent" ? (
                        <Avatar
                          className="size-6 p-1 ring ring-border rounded-full flex-shrink-0"
                          style={mention.icon?.style}
                        >
                          <AvatarImage
                            src={
                              mention.icon?.value ||
                              EMOJI_DATA[i % EMOJI_DATA.length]
                            }
                          />
                          <AvatarFallback>
                            {mention.name.slice(0, 1)}
                          </AvatarFallback>
                        </Avatar>
                      ) : (
                        <Button className="size-6 flex items-center justify-center ring ring-border rounded-full flex-shrink-0 p-0.5">
                          {mention.type == "mcpServer" ? (
                            <MCPIcon className="size-3.5" />
                          ) : (
                            <DefaultToolIcon
                              name={mention.name as DefaultToolName}
                              className="size-3.5"
                            />
                          )}
                        </Button>
                      )}

                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="text-sm font-semibold truncate">
                          {mention.name}
                        </span>
                        {mention.description ? (
                          <span className="text-muted-foreground text-xs truncate">
                            {mention.description}
                          </span>
                        ) : null}
                      </div>
                      <Button
                        variant={"ghost"}
                        size={"icon"}
                        disabled={!threadId}
                        className="rounded-full hover:bg-input! flex-shrink-0"
                        onClick={() => {
                          deleteMention(mention);
                        }}
                      >
                        <XIcon />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
            {pendingAttachments.length > 0 && (
              <div className="bg-input rounded-b-sm rounded-t-3xl p-3 flex flex-row flex-wrap gap-2 mx-2 mt-2">
                {pendingAttachments.map((att, idx) => (
                  <div key={`${att.url}-${idx}`} className="flex items-center gap-2 px-2 py-1 bg-muted/70 rounded-md border text-xs">
                    {att.contentType?.startsWith("image/") ? (
                      <Image src={att.url} alt={att.name || "attachment"} width={24} height={24} className="h-6 w-6 object-cover rounded-sm border" />
                    ) : (
                      <div className="h-6 w-6 flex items-center justify-center rounded-sm bg-background border">📎</div>
                    )}
                    <span className="max-w-40 truncate">{att.name}</span>
                    <button
                      className="ml-1 text-muted-foreground hover:text-foreground"
                      onClick={() =>
                        setPendingAttachments((prev) => prev.filter((_, i) => i !== idx))
                      }
                      aria-label="Remove attachment"
                    >
                      <XIcon className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-col gap-3.5 px-5 pt-2 pb-4">
              <div className="relative min-h-[2rem]">
                <ChatMentionInput
                  input={input}
                  onChange={setInput}
                  onChangeMention={onChangeMention}
                  onEnter={submit}
                  placeholder={placeholder ?? t("placeholder")}
                  ref={editorRef}
                  disabledMention={disabledMention}
                  onFocus={onFocus}
                />
              </div>
              <div className="flex w-full items-center z-30">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={ACCEPTED_EXTENSIONS.join(",")}
                  className="hidden"
                  onChange={(e) => onFilesPicked(e.target.files)}
                />
                <Button
                  variant={"ghost"}
                  size={"sm"}
                  className="rounded-full hover:bg-input! p-2!"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <PlusIcon />
                </Button>
                {onThinkingChange && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size={"sm"}
                        className={cn(
                          "rounded-full hover:bg-input! p-2!",
                          thinking && "bg-input!",
                        )}
                        onClick={() => {
                          onThinkingChange(!thinking);
                          editorRef.current?.commands.focus();
                        }}
                      >
                        <LightbulbIcon />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent
                      className="flex items-center gap-2"
                      side="top"
                    >
                      Sequential Thinking
                      <span className="text-muted-foreground ml-2">
                        {getShortcutKeyList(THINKING_SHORTCUT).join("")}
                      </span>
                    </TooltipContent>
                  </Tooltip>
                )}

                {!toolDisabled && (
                  <>
                    <ToolModeDropdown />
                    <ToolSelectDropdown
                      className="mx-1"
                      align="start"
                      side="top"
                      onSelectWorkflow={onSelectWorkflow}
                      onSelectAgent={onSelectAgent}
                      mentions={mentions}
                    />
                  </>
                )}

                <div className="flex-1" />

                <SelectModel onSelect={setChatModel} currentModel={chatModel}>
                  <Button
                    variant={"ghost"}
                    size={"sm"}
                    className="rounded-full group data-[state=open]:bg-input! hover:bg-input! mr-1"
                    data-testid="model-selector-button"
                  >
                    {chatModel?.model ? (
                      <>
                        {chatModel.provider === "openai" ? (
                          <OpenAIIcon className="size-3 opacity-0 group-data-[state=open]:opacity-100 group-hover:opacity-100" />
                        ) : chatModel.provider === "xai" ? (
                          <GrokIcon className="size-3 opacity-0 group-data-[state=open]:opacity-100 group-hover:opacity-100" />
                        ) : chatModel.provider === "anthropic" ? (
                          <ClaudeIcon className="size-3 opacity-0 group-data-[state=open]:opacity-100 group-hover:opacity-100" />
                        ) : chatModel.provider === "google" ? (
                          <GeminiIcon className="size-3 opacity-0 group-data-[state=open]:opacity-100 group-hover:opacity-100" />
                        ) : null}
                        <span
                          className="text-foreground group-data-[state=open]:text-foreground  "
                          data-testid="selected-model-name"
                        >
                          {chatModel.model}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">model</span>
                    )}

                    <ChevronDown className="size-3" />
                  </Button>
                </SelectModel>

                {!isLoading && !input.length && !voiceDisabled ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size={"sm"}
                        onClick={() => {
                          appStoreMutate((state) => ({
                            voiceChat: {
                              ...state.voiceChat,
                              isOpen: true,
                              agentId: undefined,
                            },
                          }));
                        }}
                        className="rounded-full p-2!"
                      >
                        <AudioWaveformIcon size={16} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t("VoiceChat.title")}</TooltipContent>
                  </Tooltip>
                ) : (
                  <div
                    onClick={() => {
                      if (isLoading) {
                        onStop();
                      } else {
                        submit();
                      }
                    }}
                    className="fade-in animate-in cursor-pointer text-muted-foreground rounded-full p-2 bg-secondary hover:bg-accent-foreground hover:text-accent transition-all duration-200"
                  >
                    {isLoading ? (
                      <Square
                        size={16}
                        className="fill-muted-foreground text-muted-foreground"
                      />
                    ) : (
                      <CornerRightUp size={16} />
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </fieldset>
      </div>
    </div>
  );
}
