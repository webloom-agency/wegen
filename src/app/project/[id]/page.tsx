"use client";
import { selectProjectByIdAction } from "@/app/api/chat/actions";
import { appStore } from "@/app/store";
import { ThinkingMessage } from "@/components/message";
import { AssistMessagePart } from "@/components/message-parts";
import { ProjectDropdown } from "@/components/project-dropdown";
import PromptInput from "@/components/prompt-input";
import { useChat } from "@ai-sdk/react";
import { generateUUID } from "lib/utils";

import { Loader, MoreHorizontal } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";

import useSWR, { mutate } from "swr";
import { Button } from "ui/button";
import { Skeleton } from "ui/skeleton";
import { useShallow } from "zustand/shallow";

export default function ProjectPage() {
  const { id } = useParams();

  const { data: project, isLoading } = useSWR(`/projects/${id}`, async () => {
    const project = await selectProjectByIdAction(id as string);
    if (!project) {
      router.push("/");
    }
    return project;
  });

  const router = useRouter();
  const threadId = useMemo(() => generateUUID(), [id]);

  const [appStoreMutate, model, activeTool] = appStore(
    useShallow((state) => [state.mutate, state.model, state.activeTool]),
  );

  const { input, setInput, append, stop, status } = useChat({
    id: threadId,
    api: "/api/chat",
    body: { id: threadId, model, activeTool, projectId: id as string },
    initialMessages: [],
    sendExtraMessageFields: true,
    generateId: generateUUID,
    experimental_throttle: 100,
    onFinish: () => {
      mutate("threads").then(() => {
        router.push(`/chat/${threadId}`);
      });
    },
  });

  const isCreatingThread = useMemo(() => {
    return status == "submitted" || status == "streaming";
  }, [status]);

  useEffect(() => {
    appStoreMutate({
      currentProjectId: id as string,
    });

    return () => {
      appStoreMutate({
        currentProjectId: undefined,
      });
    };
  }, [id]);

  return (
    <div className="flex flex-col min-w-0 relative h-full ">
      <div className="max-w-3xl mx-auto fade-in animate-in w-full mt-14">
        <div className="px-6 py-6">
          {isLoading ? (
            <Skeleton className="h-10" />
          ) : (
            <div className="flex items-center gap-1">
              <h1 className="text-4xl font-semibold truncate">
                {project?.name}
              </h1>
              <div className="flex-1" />
              <ProjectDropdown projectId={id as string}>
                <Button variant="ghost" size="icon">
                  <MoreHorizontal />
                </Button>
              </ProjectDropdown>
            </div>
          )}
        </div>
        {isCreatingThread && (
          <div className="pb-6 flex flex-col justify-center fade-in animate-in">
            <div className="w-fit rounded-2xl px-6 py-4 flex items-center gap-2">
              <h1 className="font-semibold truncate">Creating Chat...</h1>
              <Loader className="animate-spin" size={16} />
            </div>
          </div>
        )}

        <PromptInput
          threadId={threadId}
          input={input}
          append={append}
          setInput={setInput}
          isLoading={isLoading}
          onStop={stop}
        />
        <div className="flex">
          <div className="flex items-center gap-2">
            <div>File 추가</div>
            <div>지침 추가</div>
          </div>
        </div>
      </div>
    </div>
  );
}
