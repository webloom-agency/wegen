"use client";

import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useMutateAgents } from "@/hooks/queries/use-agents";
import { useMcpList } from "@/hooks/queries/use-mcp-list";
import { useWorkflowToolList } from "@/hooks/queries/use-workflow-tool-list";
import { useObjectState } from "@/hooks/use-object-state";
import { useBookmark } from "@/hooks/queries/use-bookmark";
import { Agent, AgentCreateSchema, AgentUpdateSchema } from "app-types/agent";
import { ChatMention } from "app-types/chat";
import { MCPServerInfo } from "app-types/mcp";
import { WorkflowSummary } from "app-types/workflow";
import { DefaultToolName } from "lib/ai/tools";
import { BACKGROUND_COLORS } from "lib/const";
import { cn, fetcher, objectFlow } from "lib/utils";
import { safe } from "ts-safe";
import { handleErrorWithToast } from "ui/shared-toast";
import { ChevronDownIcon, Loader, WandSparklesIcon } from "lucide-react";
import { Button } from "ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "ui/dropdown-menu";
import { Input } from "ui/input";
import { Label } from "ui/label";
import { Textarea } from "ui/textarea";
import { ScrollArea } from "ui/scroll-area";
import { Skeleton } from "ui/skeleton";
import { TextShimmer } from "ui/text-shimmer";
import { ShareableActions, Visibility } from "@/components/shareable-actions";
import { GenerateAgentDialog } from "./generate-agent-dialog";
import { AgentIconPicker } from "./agent-icon-picker";
import { AgentToolSelector } from "./agent-tool-selector";
import {
  RandomDataGeneratorExample,
  WeatherExample,
} from "lib/ai/agent/example";
import { notify } from "lib/notify";

const defaultConfig = (): PartialBy<
  Omit<Agent, "createdAt" | "updatedAt" | "userId">,
  "id"
> => {
  return {
    name: "",
    description: "",
    icon: {
      type: "emoji",
      value:
        "https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/1f916.png",
      style: {
        backgroundColor: BACKGROUND_COLORS[0],
      },
    },
    instructions: {
      role: "",
      systemPrompt: "",
      mentions: [],
    },
    visibility: "private",
  };
};

interface EditAgentProps {
  initialAgent?: Agent;
  userId: string;
  isOwner?: boolean;
  hasEditAccess?: boolean;
  isBookmarked?: boolean;
}

export default function EditAgent({
  initialAgent,
  userId,
  isOwner = true,
  hasEditAccess = true,
}: EditAgentProps) {
  const t = useTranslations();
  const mutateAgents = useMutateAgents();
  const router = useRouter();

  const [openGenerateAgentDialog, setOpenGenerateAgentDialog] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isVisibilityChangeLoading, setIsVisibilityChangeLoading] =
    useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Initialize agent state with initial data or defaults
  const [agent, setAgent] = useObjectState(initialAgent || defaultConfig());

  const { toggleBookmark, isLoading: isBookmarkToggleLoadingFn } = useBookmark({
    itemType: "agent",
  });
  const isBookmarkToggleLoading = useMemo(
    () =>
      (initialAgent?.id && isBookmarkToggleLoadingFn(initialAgent?.id)) ||
      false,
    [initialAgent?.id, isBookmarkToggleLoadingFn],
  );

  const { data: mcpList, isLoading: isMcpLoading } = useMcpList();
  const { data: workflowToolList, isLoading: isWorkflowLoading } =
    useWorkflowToolList();

  // Auto-select all tools by default for new agents or agents without mentions
  const hasInitializedAllToolsRef = useRef(false);
  useEffect(() => {
    if (hasInitializedAllToolsRef.current) return;
    if (isMcpLoading || isWorkflowLoading) return;

    const currentMentions = agent.instructions?.mentions || [];
    if (currentMentions.length > 0) return;

    const defaultToolMentions: ChatMention[] = Object.values(DefaultToolName).map(
      (toolName) => ({
        type: "defaultTool",
        name: toolName,
        label: toolName,
      }),
    );

    const mcpServerMentions: ChatMention[] = (mcpList as (MCPServerInfo & {
      id: string;
    })[])?.map((server) => ({
      type: "mcpServer",
      serverName: server.name,
      serverId: server.id,
      name: server.name,
    })) || [];

    const workflowMentions: ChatMention[] = (workflowToolList as WorkflowSummary[])?.map(
      (w) => ({
        type: "workflow",
        name: w.name,
        workflowId: w.id,
        icon: w.icon,
      }),
    ) || [];

    const allMentions = [
      ...defaultToolMentions,
      ...mcpServerMentions,
      ...workflowMentions,
    ];

    if (allMentions.length > 0) {
      setAgent((prev) => ({
        instructions: {
          ...prev.instructions,
          mentions: allMentions,
        },
      }));
      hasInitializedAllToolsRef.current = true;
    }
  }, [isMcpLoading, isWorkflowLoading, mcpList, workflowToolList, agent.instructions?.mentions, setAgent]);

  const assignToolsByNames = useCallback(
    (toolNames: string[]) => {
      const allMentions: ChatMention[] = [];

      objectFlow(DefaultToolName).forEach((toolName) => {
        if (toolNames.includes(toolName)) {
          allMentions.push({
            type: "defaultTool",
            name: toolName,
            label: toolName,
          });
        }
      });

      (mcpList as (MCPServerInfo & { id: string })[])?.forEach((mcp) => {
        mcp.toolInfo.forEach((tool) => {
          if (toolNames.includes(tool.name)) {
            allMentions.push({
              type: "mcpTool",
              serverName: mcp.name,
              name: tool.name,
              serverId: mcp.id,
            });
          }
        });
      });

      (workflowToolList as WorkflowSummary[])?.forEach((workflow) => {
        if (toolNames.includes(workflow.name)) {
          allMentions.push({
            type: "workflow",
            name: workflow.name,
            workflowId: workflow.id,
          });
        }
      });

      if (allMentions.length > 0) {
        setAgent((prev) => ({
          instructions: {
            ...prev.instructions,
            mentions: allMentions,
          },
        }));
      }
    },
    [mcpList, workflowToolList, setAgent],
  );

  const saveAgent = useCallback(() => {
    if (initialAgent) {
      safe(() => setIsSaving(true))
        .map(() => AgentUpdateSchema.parse({ ...agent }))
        .map(JSON.stringify)
        .map(async (body) =>
          fetcher(`/api/agent/${initialAgent.id}`, {
            method: "PUT",
            body,
          }),
        )
        .ifOk((updatedAgent) => {
          mutateAgents(updatedAgent);
          toast.success(t("Agent.updated"));
          router.push(`/agents`);
        })
        .ifFail(handleErrorWithToast)
        .watch(() => setIsSaving(false));
    } else {
      safe(() => setIsSaving(true))
        .map(() => AgentCreateSchema.parse({ ...agent, userId }))
        .map(JSON.stringify)
        .map(async (body) => {
          return fetcher(`/api/agent`, {
            method: "POST",
            body,
          });
        })
        .ifOk((updatedAgent) => {
          mutateAgents(updatedAgent);
          toast.success(t("Agent.created"));
          router.push(`/agents`);
        })
        .ifFail(handleErrorWithToast)
        .watch(() => setIsSaving(false));
    }
  }, [agent, userId, mutateAgents, router, initialAgent, t]);

  const updateVisibility = useCallback(
    async (visibility: Visibility) => {
      if (initialAgent?.id) {
        safe(() => setIsVisibilityChangeLoading(true))
          .map(() => AgentUpdateSchema.parse({ visibility }))
          .map(JSON.stringify)
          .map(async (body) =>
            fetcher(`/api/agent/${initialAgent.id}`, {
              method: "PUT",
              body,
            }),
          )
          .ifOk(() => {
            setAgent({ visibility });
            mutateAgents({ id: initialAgent.id, visibility });
            toast.success(t("Agent.visibilityUpdated"));
          })
          .ifFail(handleErrorWithToast)
          .watch(() => setIsVisibilityChangeLoading(false));
      } else {
        setAgent({ visibility });
      }
    },
    [initialAgent?.id, mutateAgents, setAgent, setIsVisibilityChangeLoading, t],
  );

  const deleteAgent = useCallback(async () => {
    if (!initialAgent?.id) return;
    const ok = await notify.confirm({
      description: t("Agent.deleteConfirm"),
    });
    if (!ok) return;
    safe(() => setIsSaving(true))
      .map(() =>
        fetcher(`/api/agent/${initialAgent.id}`, {
          method: "DELETE",
        }),
      )
      .ifOk(() => {
        mutateAgents({ id: initialAgent.id }, true);
        toast.success(t("Agent.deleted"));
        router.push("/agents");
      })
      .ifFail(handleErrorWithToast)
      .watch(() => setIsSaving(false));
  }, [initialAgent?.id, mutateAgents, router, t]);

  const handleBookmarkToggle = useCallback(async () => {
    if (!initialAgent?.id || isBookmarkToggleLoading) return;
    safe(async () => {
      await toggleBookmark({
        id: initialAgent.id,
        isBookmarked: agent.isBookmarked,
      });
    })
      .ifOk(() => {
        setAgent({ isBookmarked: !agent.isBookmarked });
      })
      .ifFail(handleErrorWithToast);
  }, [
    initialAgent?.id,
    toggleBookmark,
    agent.isBookmarked,
    isBookmarkToggleLoading,
  ]);

  const handleAgentChange = useCallback((generatedData: any) => {
    if (textareaRef.current) {
      textareaRef.current.scrollTo({
        top: textareaRef.current.scrollHeight,
      });
    }
    setAgent((prev) => {
      const update: Partial<Agent> = {};
      objectFlow(generatedData).forEach((data, key) => {
        if (key === "name") {
          update.name = data as string;
        }
        if (key === "description") {
          update.description = data as string;
        }
        if (key === "instructions") {
          update.instructions = {
            ...prev.instructions,
            systemPrompt: data as string,
          };
        }
        if (key === "role") {
          update.instructions = {
            ...prev.instructions,
            role: data as string,
          };
        }
      });
      return { ...prev, ...update };
    });
  }, []);

  const isLoadingTool = useMemo(() => {
    return isMcpLoading || isWorkflowLoading;
  }, [isMcpLoading, isWorkflowLoading]);

  const isLoading = useMemo(() => {
    return (
      isLoadingTool ||
      isSaving ||
      isVisibilityChangeLoading ||
      isBookmarkToggleLoading
    );
  }, [
    isLoadingTool,
    isSaving,
    isVisibilityChangeLoading,
    isBookmarkToggleLoading,
  ]);

  const isGenerating = openGenerateAgentDialog;

  return (
    <ScrollArea className="h-full w-full relative">
      <div className="w-full h-8 absolute bottom-0 left-0 bg-gradient-to-t from-background to-transparent z-20 pointer-events-none" />
      <div className="z-10 relative flex flex-col gap-4 px-8 pt-8 pb-14 max-w-3xl h-full mx-auto">
        <div className="sticky top-0 bg-background z-10 flex items-center justify-between pb-4 gap-2">
          <div className="w-full h-8 absolute top-[100%] left-0 bg-gradient-to-b from-background to-transparent z-20 pointer-events-none" />
          {isGenerating ? (
            <TextShimmer className="w-full text-2xl font-bold">
              {t("Agent.generatingAgent")}
            </TextShimmer>
          ) : (
            <p className="w-full text-2xl font-bold">{t("Agent.title")}</p>
          )}

          <div className="flex items-center gap-2">
            {hasEditAccess && !initialAgent && (
              <>
                <Button
                  variant="ghost"
                  disabled={isLoading}
                  onClick={() => setOpenGenerateAgentDialog(true)}
                  data-testid="agent-generate-with-ai-button"
                >
                  <WandSparklesIcon className="size-3" />
                  {t("Common.generateWithAI")}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      className="justify-between data-[state=open]:bg-input"
                      disabled={isLoading}
                      data-testid="agent-create-with-example-button"
                    >
                      {t("Common.createWithExample")}
                      <ChevronDownIcon className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-54" align="end">
                    <DropdownMenuItem
                      onClick={() => setAgent(RandomDataGeneratorExample)}
                    >
                      <div className="flex items-center gap-2">
                        <span>🎲</span>
                        <span>Generate Random Data</span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      data-testid="agent-create-with-example-weather-button"
                      onClick={() => setAgent(WeatherExample)}
                    >
                      <div className="flex items-center gap-2">
                        <span>🌤️</span>
                        <span>Weather Checker</span>
                      </div>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}

            {initialAgent && (
              <div className="flex items-center gap-2">
                <ShareableActions
                  type="agent"
                  visibility={agent.visibility || "private"}
                  isBookmarked={agent?.isBookmarked || false}
                  isOwner={isOwner}
                  onVisibilityChange={updateVisibility}
                  isVisibilityChangeLoading={isVisibilityChangeLoading}
                  disabled={isLoading}
                  onBookmarkToggle={handleBookmarkToggle}
                  isBookmarkToggleLoading={isBookmarkToggleLoading}
                />
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-4 mt-4">
          <div className="flex flex-col justify-between gap-2 flex-1">
            <Label htmlFor="agent-name">
              {t("Agent.agentNameAndIconLabel")}
            </Label>
            {false ? (
              <Skeleton className="w-full h-10" />
            ) : (
              <Input
                value={agent.name || ""}
                onChange={(e) => setAgent({ name: e.target.value })}
                autoFocus
                disabled={isLoading || !hasEditAccess}
                className="hover:bg-input bg-secondary/40 transition-colors border-transparent border-none! focus-visible:bg-input! ring-0!"
                id="agent-name"
                data-testid="agent-name-input"
                placeholder={t("Agent.agentNamePlaceholder")}
                readOnly={!hasEditAccess}
              />
            )}
          </div>
          {false ? (
            <Skeleton className="w-16 h-16" />
          ) : (
            <AgentIconPicker
              icon={agent.icon}
              disabled={!hasEditAccess}
              onChange={(icon) => setAgent({ icon })}
            />
          )}
        </div>

        {/* Attachments Section */}
        <div className="flex gap-2 flex-col">
          <Label className="text-base">Attachments (PDF, CSV, TXT)</Label>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.csv,.txt"
              className="hidden"
              onChange={(e) => {
                const files = e.target.files;
                if (!files || files.length === 0) return;

                const MAX_FILES = 10;
                const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB

                const current = agent.instructions?.attachments?.length || 0;
                if (current + files.length > MAX_FILES) {
                  toast.warning(`You can attach up to ${MAX_FILES} files.`);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                  return;
                }

                const isTextLikeFile = (file: File) => {
                  const type = file.type.toLowerCase();
                  const name = file.name.toLowerCase();
                  return (
                    type.startsWith("text/") ||
                    name.endsWith(".txt") ||
                    name.endsWith(".csv")
                  );
                };

                (async () => {
                  for (const file of Array.from(files)) {
                    if (file.size > MAX_FILE_SIZE) {
                      toast.warning(`File too large (max 15MB): ${file.name}`);
                      continue;
                    }

                    if (isTextLikeFile(file)) {
                      const text = await file.text();
                      setAgent((prev) => ({
                        instructions: {
                          ...prev.instructions,
                          attachments: [
                            ...((prev.instructions?.attachments as any[]) || []),
                            {
                              url: `data:text/plain;base64,${btoa(unescape(encodeURIComponent(text)))}`,
                              contentType:
                                file.type || (file.name.endsWith(".csv") ? "text/csv" : "text/plain"),
                              name: file.name,
                              size: file.size,
                              textContent: text,
                            },
                          ],
                        },
                      }));
                    } else {
                      await new Promise<void>((resolve) => {
                        const reader = new FileReader();
                        reader.onload = () => {
                          setAgent((prev) => ({
                            instructions: {
                              ...prev.instructions,
                              attachments: [
                                ...((prev.instructions?.attachments as any[]) || []),
                                {
                                  url: String(reader.result || ""),
                                  contentType: file.type || "application/octet-stream",
                                  name: file.name,
                                  size: file.size,
                                },
                              ],
                            },
                          }));
                          resolve();
                        };
                        reader.readAsDataURL(file);
                      });
                    }
                  }
                  if (fileInputRef.current) fileInputRef.current.value = "";
                })();
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={isLoading || !hasEditAccess}
              onClick={() => fileInputRef.current?.click()}
            >
              Add attachments
            </Button>
          </div>

          {/* Attachment List */}
          <div className="flex flex-col gap-2">
            {(agent.instructions?.attachments || []).length === 0 ? (
              <p className="text-xs text-muted-foreground">No attachments</p>
            ) : (
              <div className="flex flex-col gap-2">
                {(agent.instructions?.attachments || []).map((att: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between rounded-md border p-2 bg-secondary/40">
                    <div className="flex flex-col text-xs">
                      <span className="font-medium break-all">{att.name || att.contentType || "Attachment"}</span>
                      <span className="text-muted-foreground">{att.contentType || "unknown"}{att.size ? ` • ${(att.size / 1024).toFixed(1)} KB` : ""}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        className="hover:text-destructive"
                        disabled={isLoading || !hasEditAccess}
                        onClick={() =>
                          setAgent((prev) => ({
                            instructions: {
                              ...prev.instructions,
                              attachments: (prev.instructions?.attachments || []).filter((_: any, i: number) => i !== idx),
                            },
                          }))
                        }
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="agent-description">
            {t("Agent.agentDescriptionLabel")}
          </Label>
          {false ? (
            <Skeleton className="w-full h-10" />
          ) : (
            <Input
              id="agent-description"
              data-testid="agent-description-input"
              disabled={isLoading || !hasEditAccess}
              placeholder={t("Agent.agentDescriptionPlaceholder")}
              className="hover:bg-input placeholder:text-xs bg-secondary/40 transition-colors border-transparent border-none! focus-visible:bg-input! ring-0!"
              value={agent.description || ""}
              onChange={(e) => setAgent({ description: e.target.value })}
              readOnly={!hasEditAccess}
            />
          )}
        </div>

        <div className="mt-10 flex items-center gap-2">
          <p className="text-sm text-muted-foreground">
            {t("Agent.agentSettingsDescription")}
          </p>
        </div>

        <div className="flex flex-col gap-6">
          <div className="flex gap-2 items-center">
            <span>{t("Agent.thisAgentIs")}</span>
            {false ? (
              <Skeleton className="w-44 h-10" />
            ) : (
              <Input
                id="agent-role"
                data-testid="agent-role-input"
                disabled={isLoading || !hasEditAccess}
                placeholder={t("Agent.agentRolePlaceholder")}
                className="hover:bg-input placeholder:text-xs bg-secondary/40 w-44 transition-colors border-transparent border-none! focus-visible:bg-input! ring-0!"
                value={agent.instructions?.role || ""}
                onChange={(e) =>
                  setAgent({
                    instructions: {
                      ...agent.instructions,
                      role: e.target.value || "",
                    },
                  })
                }
                readOnly={!hasEditAccess}
              />
            )}
            <span>{t("Agent.expertIn")}</span>
          </div>

          <div className="flex gap-2 flex-col">
            <Label htmlFor="agent-prompt" className="text-base">
              {t("Agent.agentInstructionsLabel")}
            </Label>
            {false ? (
              <Skeleton className="w-full h-48" />
            ) : (
              <Textarea
                id="agent-prompt"
                data-testid="agent-prompt-textarea"
                ref={textareaRef}
                disabled={isLoading || !hasEditAccess}
                placeholder={t("Agent.agentInstructionsPlaceholder")}
                className="p-6 hover:bg-input min-h-48 max-h-96 overflow-y-auto resize-none placeholder:text-xs bg-secondary/40 transition-colors border-transparent border-none! focus-visible:bg-input! ring-0!"
                value={agent.instructions?.systemPrompt || ""}
                onChange={(e) =>
                  setAgent({
                    instructions: {
                      ...agent.instructions,
                      systemPrompt: e.target.value || "",
                    },
                  })
                }
                readOnly={!hasEditAccess}
              />
            )}
          </div>

          <div className="flex gap-2 flex-col">
            <Label htmlFor="agent-tool-bindings" className="text-base">
              {t("Agent.agentToolsLabel")}
            </Label>
            {false ? (
              <Skeleton className="w-full h-12" />
            ) : (
              <AgentToolSelector
                mentions={agent.instructions?.mentions || []}
                isLoading={isLoadingTool}
                disabled={isLoading}
                hasEditAccess={hasEditAccess}
                onChange={(mentions) =>
                  setAgent({
                    instructions: {
                      ...agent.instructions,
                      mentions,
                    },
                  })
                }
              />
            )}
          </div>
        </div>

        {hasEditAccess && (
          <div className={cn("flex justify-end gap-2")}>
            {/* Delete button - only for owners */}
            {initialAgent && isOwner && (
              <Button
                className="mt-2 hover:text-destructive"
                variant="ghost"
                onClick={deleteAgent}
                disabled={isLoading}
              >
                {t("Common.delete")}
              </Button>
            )}

            <Button
              className={cn("mt-2", !initialAgent || !isOwner ? "ml-auto" : "")}
              onClick={saveAgent}
              disabled={isLoading || !hasEditAccess}
              data-testid="agent-save-button"
            >
              {isSaving ? t("Common.saving") : t("Common.save")}
              {isSaving && <Loader className="size-4 animate-spin" />}
            </Button>
          </div>
        )}
      </div>

      <GenerateAgentDialog
        open={openGenerateAgentDialog}
        onOpenChange={setOpenGenerateAgentDialog}
        onAgentChange={handleAgentChange}
        onToolsGenerated={assignToolsByNames}
      />
    </ScrollArea>
  );
}
