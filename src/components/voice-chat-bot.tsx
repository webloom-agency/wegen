"use client";

import { useObjectState } from "@/hooks/use-object-state";
import { UIMessage } from "ai";
import { UIMessageWithCompleted, VoiceChatHook } from "lib/ai/speech";

import {
  OPENAI_VOICE,
  useOpenAIVoiceChat,
} from "lib/ai/speech/open-ai/use-voice-chat.openai";
import { cn } from "lib/utils";
import {
  CheckIcon,
  Loader,
  MicIcon,
  MicOffIcon,
  PhoneIcon,
  Settings2Icon,
  TriangleAlertIcon,
  WrenchIcon,
  XIcon,
} from "lucide-react";
import {
  PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { safe } from "ts-safe";
import { Alert, AlertDescription, AlertTitle } from "ui/alert";
import { Button } from "ui/button";

import {
  Drawer,
  DrawerContent,
  DrawerOverlay,
  DrawerPortal,
  DrawerTitle,
  DrawerTrigger,
} from "ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "ui/dropdown-menu";
import { GeminiIcon } from "ui/gemini-icon";
import { MessageLoading } from "ui/message-loading";
import { OpenAIIcon } from "ui/openai-icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "ui/tooltip";
import { ToolMessagePart } from "./message-parts";
import { FlipWords } from "ui/flip-words";
import { ToolSelector } from "./tool-selector";
import { ToolChoiceDropDown } from "./tool-choice-dropdown";

interface VoiceChatBotProps {
  onEnd?: (messages: UIMessage[]) => Promise<void>;
}

const isNotEmptyUIMessage = (message: UIMessage) => {
  return message.parts.some((v) => {
    if (v.type === "text") {
      return v.text.trim() !== "";
    } else if (v.type === "tool-invocation") {
      return !v.toolInvocation;
    }
    return true;
  });
};

export function VoiceChatBot({
  onEnd,
  children,
}: PropsWithChildren<VoiceChatBotProps>) {
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const startAudio = useRef<HTMLAudioElement>(null);

  const [voiceProvider, setVoiceProvider] = useObjectState({
    provider: "openai",
    providerOptions: {
      model: OPENAI_VOICE["Alloy"],
    },
  });

  const Hook = useMemo<VoiceChatHook>(() => {
    switch (voiceProvider.provider) {
      case "openai":
        return useOpenAIVoiceChat;
      default:
        return useOpenAIVoiceChat;
    }
  }, [voiceProvider.provider]);

  const {
    isListening,
    isLoading,
    isActive,
    messages,
    error,
    start,
    startListening,
    stop,
    stopListening,
  } = Hook(voiceProvider.providerOptions);

  const startWithSound = useCallback(() => {
    if (!startAudio.current) {
      startAudio.current = new Audio("/sounds/start_voice.ogg");
    }
    start().then(() => {
      startAudio.current?.play().catch(() => {});
    });
  }, [start]);

  const endVoiceChat = useCallback(async () => {
    setIsClosing(true);
    await safe(() => stop());
    await safe(() =>
      onEnd?.(messages.filter((v) => v.completed && isNotEmptyUIMessage(v))),
    );
    setIsClosing(false);
    setIsOpen(false);
  }, [messages]);

  useEffect(() => {
    return () => {
      if (isActive) {
        stop();
      }
    };
  }, [voiceProvider]);

  useEffect(() => {
    if (isOpen) {
      // startWithSound();
    } else if (isActive) {
      stop();
    }
  }, [isOpen]);

  useEffect(() => {
    if (error && isActive) {
      toast.error(error.message);
      stop();
    }
  }, [error]);

  return (
    <Drawer
      dismissible={false}
      open={isOpen}
      onOpenChange={setIsOpen}
      direction="top"
    >
      <DrawerTrigger asChild>{children}</DrawerTrigger>
      <DrawerPortal>
        <DrawerOverlay />
        <DrawerContent className="bg-card/50 backdrop-blur-sm max-h-[100vh]! h-full border-none! rounded-none! flex flex-col">
          <div
            className="w-full flex p-6"
            style={{
              userSelect: "text",
            }}
          >
            <DrawerTitle className="flex items-center gap-2 w-full">
              <ToolChoiceDropDown />
              <ToolSelector align="start" side="bottom" />

              <div className="flex-1" />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant={"ghost"} size={"icon"}>
                    <Settings2Icon className="text-foreground size-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  side="left"
                  className="min-w-40"
                  align="start"
                >
                  <DropdownMenuGroup className="cursor-pointer">
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger
                        className="flex items-center gap-2 cursor-pointer"
                        icon=""
                      >
                        <OpenAIIcon className="size-3.5 stroke-none fill-foreground" />
                        Open AI
                      </DropdownMenuSubTrigger>
                      <DropdownMenuPortal>
                        <DropdownMenuSubContent>
                          {Object.entries(OPENAI_VOICE).map(([key, value]) => (
                            <DropdownMenuItem
                              className="cursor-pointer flex items-center justify-between"
                              onClick={() =>
                                setVoiceProvider({
                                  provider: "openai",
                                  providerOptions: {
                                    model: value,
                                  },
                                })
                              }
                              key={key}
                            >
                              {key}

                              {value ===
                                voiceProvider.providerOptions.model && (
                                <CheckIcon className="size-3.5" />
                              )}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuPortal>
                    </DropdownMenuSub>
                    <DropdownMenuSub>
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger
                          className="flex items-center gap-2 text-muted-foreground"
                          icon=""
                        >
                          <GeminiIcon className="size-3.5" />
                          Gemini
                        </DropdownMenuSubTrigger>
                        <DropdownMenuPortal>
                          <DropdownMenuSubContent>
                            <div className="text-xs text-muted-foreground p-6">
                              Not Implemented Yet
                            </div>
                          </DropdownMenuSubContent>
                        </DropdownMenuPortal>
                      </DropdownMenuSub>
                    </DropdownMenuSub>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </DrawerTitle>
          </div>
          <div className="flex-1 min-h-0 mx-auto w-full">
            {error ? (
              <div className="max-w-3xl mx-auto">
                <Alert variant={"destructive"}>
                  <TriangleAlertIcon className="size-4 " />
                  <AlertTitle className="">Error</AlertTitle>
                  <AlertDescription>{error.message}</AlertDescription>

                  <AlertDescription className="my-4 ">
                    <p className="text-muted-foreground ">
                      Please close the voice chat and try again.
                    </p>
                  </AlertDescription>
                </Alert>
              </div>
            ) : null}
            {isLoading ? (
              <div className="flex-1">loading</div>
            ) : (
              <div className="h-full w-full">
                <Messages messages={messages} />
              </div>
            )}
          </div>
          <div className="w-full p-6 flex items-center justify-center gap-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={"secondary"}
                  size={"icon"}
                  disabled={isClosing || isLoading}
                  onClick={() => {
                    if (!isActive) {
                      startWithSound();
                    } else if (isListening) {
                      stopListening();
                    } else {
                      startListening();
                    }
                  }}
                  className={cn(
                    "rounded-full p-6",

                    isLoading
                      ? "bg-accent-foreground text-accent animate-pulse"
                      : !isActive
                        ? "bg-green-500/10 text-green-500 hover:bg-green-500/30"
                        : !isListening
                          ? "bg-destructive/30 text-destructive hover:bg-destructive/10"
                          : "",
                  )}
                >
                  {isLoading || isClosing ? (
                    <Loader className="size-6 animate-spin" />
                  ) : !isActive ? (
                    <PhoneIcon className="size-6 fill-green-500 stroke-none" />
                  ) : isListening ? (
                    <MicIcon className="size-6" />
                  ) : (
                    <MicOffIcon className="size-6" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {!isActive
                  ? "Start Conversation"
                  : isListening
                    ? "Close Mic"
                    : "Open Mic"}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={"secondary"}
                  size={"icon"}
                  className="rounded-full p-6"
                  disabled={isLoading || isClosing}
                  onClick={endVoiceChat}
                >
                  <XIcon className="text-foreground size-6" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>End conversation</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </DrawerContent>
      </DrawerPortal>
    </Drawer>
  );
}

function Messages({ messages }: { messages: UIMessageWithCompleted[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTo({
        top: ref.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages.length]);
  return (
    <div className="w-full text-sm overflow-y-auto h-full" ref={ref}>
      <div className="max-w-3xl mx-auto flex flex-col px-6 gap-6 pb-44">
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "flex px-4 py-3",
              message.role == "user" &&
                "ml-auto max-w-2xl bg-accent-foreground text-accent rounded-2xl w-fit",
            )}
          >
            {!message.completed ? (
              <MessageLoading
                className={
                  message.role == "user"
                    ? "text-accent"
                    : "text-accent-foreground"
                }
              />
            ) : (
              message.parts.map((part, index) => {
                if (part.type === "text") {
                  return !part.text ? (
                    <MessageLoading
                      className={
                        message.role == "user"
                          ? "text-accent"
                          : "text-accent-foreground"
                      }
                      key={index}
                    />
                  ) : message.role == "user" ? (
                    <p key={index} className="whitespace-pre-wrap">
                      {part.text}
                    </p>
                  ) : (
                    <FlipWords words={[part.text]} key={index} />
                  );
                } else if (part.type === "tool-invocation") {
                  return (
                    <ToolMessagePart
                      key={index}
                      part={part}
                      message={message}
                      isLast={part.toolInvocation.state != "result"}
                    />
                  );
                }
                return <p key={index}>{part.type} unknown part</p>;
              })
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
