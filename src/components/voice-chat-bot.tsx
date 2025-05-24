"use client";

import { useObjectState } from "@/hooks/use-object-state";

import {
  OPENAI_VOICE,
  useOpenAIVoiceChat,
} from "lib/ai/speech/open-ai/use-voice-chat.openai";
import { cn } from "lib/utils";
import {
  Loader,
  MicIcon,
  MicOffIcon,
  Settings2Icon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import { PropsWithChildren, useEffect, useState } from "react";
import { toast } from "sonner";
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
import { OpenAIIcon } from "ui/openai-icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "ui/tooltip";

interface VoiceChatBotProps {
  onClose: () => void;
  threadId?: string;
}

export function VoiceChatBot({
  onClose,

  children,
}: PropsWithChildren<VoiceChatBotProps>) {
  const [isOpen, setIsOpen] = useState(false);

  const [voiceProvider, setVoiceProvider] = useObjectState({
    provider: "openai",
    providerOptions: {
      model: OPENAI_VOICE["Alloy"],
    },
  });

  //   const Hook = useMemo<VoiceChatHook>(() => {
  //     switch (voiceProvider.provider) {
  //       case "openai":
  //         return useOpenAIVoiceChat;
  //       default:
  //         return useOpenAIVoiceChat;
  //     }
  //   }, [voiceProvider.provider]);

  const {
    isListening,
    isLoading,
    micVolume,
    error,

    start,
    startListening,
    stop,
    stopListening,
  } = useOpenAIVoiceChat(voiceProvider.providerOptions);

  useEffect(() => {
    if (!isOpen) {
      onClose();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      stop();
      return;
    }
    start();
    return () => {
      stop();
    };
  }, [voiceProvider, isOpen]);

  useEffect(() => {
    if (error) {
      toast.error(error.message);
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
            className="w-full flex justify-end p-6"
            style={{
              userSelect: "text",
            }}
          >
            <DrawerTitle>
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
          <div className="flex-1 mx-auto max-w-2xl">
            {error ? (
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
            ) : isLoading ? (
              <div className="flex-1">loading</div>
            ) : (
              <div className="flex-1">voice {micVolume}</div>
            )}
          </div>
          <div className="w-full p-6 flex items-center justify-center gap-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={"secondary"}
                  size={"icon"}
                  onClick={() => {
                    if (isListening) {
                      stopListening();
                    } else {
                      startListening();
                    }
                  }}
                  className={cn(
                    "rounded-full p-6",
                    !isListening && "bg-destructive/20 text-destructive",
                    isLoading && "animate-pulse",
                  )}
                >
                  {isLoading ? (
                    <Loader className="size-6 animate-spin" />
                  ) : isListening ? (
                    <MicOffIcon className="size-6" />
                  ) : (
                    <MicIcon className="size-6" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {isListening ? "Open Mic" : "Close Mic"}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={"secondary"}
                  size={"icon"}
                  className="rounded-full p-6"
                  disabled={isLoading}
                  onClick={() => {
                    stop();
                    setIsOpen(false);
                  }}
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
