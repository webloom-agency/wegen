"use client";

import { memo, useCallback, useState } from "react";

import { Separator } from "@/components/ui/separator";

import { UINode } from "lib/ai/workflow/workflow.interface";

import { Loader, PlayIcon, AlignHorizontalSpaceAround } from "lucide-react";
import { Button } from "ui/button";

import equal from "lib/equal";

import { Avatar, AvatarFallback, AvatarImage } from "ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "ui/tooltip";
import { ShareableActions } from "@/components/shareable-actions";

import { DBWorkflow } from "app-types/workflow";

import { SelectedNodeConfigTab } from "./selected-node-config-tab";
import { ExecuteTab } from "./node-config/execute-tab";
import { useReactFlow } from "@xyflow/react";
import { safe } from "ts-safe";
import { handleErrorWithToast } from "ui/shared-toast";
import { mutate } from "swr";
import { allNodeValidate } from "lib/ai/workflow/node-validate";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { arrangeNodes } from "lib/ai/workflow/arrange-nodes";
import { Input } from "ui/input";
import EmojiPicker, { Theme } from "emoji-picker-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent } from "ui/dropdown-menu";
import { useTheme } from "next-themes";

export const WorkflowPanel = memo(
  function WorkflowPanel({
    selectedNode,
    isProcessing,
    onSave,
    workflow,
    addProcess,
    hasEditAccess,
  }: {
    selectedNode?: UINode;
    onSave: () => Promise<void>;
    isProcessing: boolean;
    workflow: DBWorkflow;
    addProcess: () => () => void;
    hasEditAccess?: boolean;
  }) {
    const { setNodes, getNodes, getEdges } = useReactFlow();
    const [showExecutePanel, setShowExecutePanel] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [justSaved, setJustSaved] = useState(false);
    const [nameDraft, setNameDraft] = useState(workflow.name);
    const t = useTranslations();
    const { theme } = useTheme();

    const onSaveImmediate = useCallback(async () => {
      if (isProcessing || !hasEditAccess) return;
      setIsSaving(true);
      setJustSaved(false);
      const close = addProcess();
      try {
        await onSave();
        setJustSaved(true);
        setTimeout(() => setJustSaved(false), 1500);
      } catch (e) {
        handleErrorWithToast(e as Error);
      } finally {
        setIsSaving(false);
        close();
      }
    }, [isProcessing, hasEditAccess, onSave, addProcess]);

    const handleArrangeNodes = useCallback(() => {
      const nodes = getNodes() as UINode[];
      const edges = getEdges();

      const { nodes: arrangedNodes } = arrangeNodes(nodes, edges);

      setNodes(arrangedNodes);
      toast.success(t("Workflow.nodesArranged"));
    }, [getNodes, getEdges, setNodes, t]);
    const updateVisibility = useCallback(
      (visibility: DBWorkflow["visibility"]) => {
        setIsSaving(true);
        const close = addProcess();
        safe(() =>
          fetch(`/api/workflow/${workflow.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              visibility,
            }),
          }).then((res) => {
            if (res.status != 200) throw new Error(res.statusText);
          }),
        )
          .ifOk(() => mutate(`/api/workflow/${workflow.id}`))
          .ifFail((e) => handleErrorWithToast(e))
          .watch(() => {
            setIsSaving(false);
            close();
          });
      },
      [workflow],
    );

    const saveName = useCallback(async () => {
      const trimmed = (nameDraft || "").trim();
      if (!hasEditAccess || !trimmed || trimmed === workflow.name) return;
      setIsSaving(true);
      const close = addProcess();
      try {
        const res = await fetch(`/api/workflow/${workflow.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmed }),
        });
        if (!res.ok) throw new Error(await res.text());
        mutate(`/api/workflow/${workflow.id}`);
        toast.success(t("Common.saved"));
      } catch (e) {
        handleErrorWithToast(e as Error);
        setNameDraft(workflow.name);
      } finally {
        setIsSaving(false);
        close();
      }
    }, [nameDraft, workflow.id, workflow.name, hasEditAccess, t, addProcess]);

    const saveIcon = useCallback(
      async (imageUrl: string) => {
        if (!hasEditAccess || workflow.isPublished) return;
        setIsSaving(true);
        const close = addProcess();
        try {
          const newIcon = {
            type: "emoji",
            value: imageUrl,
            style: { backgroundColor: workflow.icon?.style?.backgroundColor || "#0ea5e9" },
          } as DBWorkflow["icon"];
          const res = await fetch(`/api/workflow/${workflow.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ icon: newIcon }),
          });
          if (!res.ok) throw new Error(await res.text());
          mutate(`/api/workflow/${workflow.id}`);
          toast.success(t("Common.saved"));
        } catch (e) {
          handleErrorWithToast(e as Error);
        } finally {
          setIsSaving(false);
          close();
        }
      },
      [workflow.id, workflow.icon?.style?.backgroundColor, hasEditAccess, workflow.isPublished, t, addProcess],
    );

    const updatePublished = useCallback(
      (isPublished: boolean) => {
        if (isPublished) {
          const validateResult = allNodeValidate({
            nodes: getNodes() as UINode[],
            edges: getEdges(),
          });

          if (validateResult !== true) {
            if (validateResult.node) {
              setNodes((nds) => {
                return nds.map((node) => {
                  if (node.id === validateResult.node?.id) {
                    return { ...node, selected: true };
                  }
                  if (node.selected) {
                    return { ...node, selected: false };
                  }
                  return node;
                });
              });
            }
            return toast.warning(validateResult.errorMessage);
          }
        }

        const close = addProcess();
        safe(() => onSave())
          .ifOk(() =>
            fetch(`/api/workflow/${workflow.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                isPublished,
              }),
            }).then((res) => {
              if (res.status != 200) throw new Error(res.statusText);
            }),
          )
          .ifOk(() => mutate(`/api/workflow/${workflow.id}`))
          .ifFail((e) => handleErrorWithToast(e))
          .watch(close);
      },
      [workflow],
    );

    return (
      <div className="min-h-0 flex flex-col items-end">
        <div className="flex items-center gap-2 mb-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <div
                      style={{
                        backgroundColor: workflow.icon?.style?.backgroundColor,
                        cursor:
                          isProcessing || !hasEditAccess || workflow.isPublished
                            ? "default"
                            : "pointer",
                      }}
                      className="border transition-colors hover:bg-secondary! group items-center justify-center flex w-8 h-8 rounded-md ring ring-background hover:ring-ring"
                      title={hasEditAccess && !workflow.isPublished ? t("Workflow.nameAndIcon") : undefined}
                    >
                      <Avatar className="size-6">
                        <AvatarImage
                          src={workflow.icon?.value}
                          className="group-hover:scale-110  transition-transform"
                        />
                        <AvatarFallback></AvatarFallback>
                      </Avatar>
                    </div>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="p-0 border-none bg-transparent" align="start" side="bottom">
                    {hasEditAccess && !workflow.isPublished && (
                      <div className="rounded-md overflow-hidden">
                        <EmojiPicker
                          open
                          theme={theme === "dark" ? Theme.DARK : Theme.LIGHT}
                          onEmojiClick={(emoji) => saveIcon(emoji.imageUrl)}
                        />
                      </div>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>{workflow?.name}</p>
            </TooltipContent>
          </Tooltip>

          {/* Inline name edit */}
          <Input
            value={nameDraft}
            disabled={isProcessing || !hasEditAccess || workflow.isPublished}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              }
              if (e.key === "Escape") {
                setNameDraft(workflow.name);
                e.currentTarget.blur();
              }
            }}
            className="h-8 w-56"
          />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                disabled={isProcessing || !hasEditAccess}
                onClick={handleArrangeNodes}
              >
                <AlignHorizontalSpaceAround className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>{t("Workflow.arrangeNodes")}</p>
            </TooltipContent>
          </Tooltip>
          <div className="h-6">
            <Separator orientation="vertical" />
          </div>
          <Button
            variant="secondary"
            disabled={isProcessing}
            onClick={() => {
              setNodes((nds) => {
                return nds.map((node) => {
                  if (node.selected) {
                    return { ...node, selected: false };
                  }
                  return node;
                });
              });
              setShowExecutePanel(!showExecutePanel);
            }}
          >
            <PlayIcon />
            {t("Common.run")}
          </Button>

          {!workflow.isPublished && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  disabled={isProcessing || !hasEditAccess || isSaving}
                  onClick={onSaveImmediate}
                  variant="default"
                >
                  {isSaving ? (
                    <Loader className="size-3.5 animate-spin" />
                  ) : (
                    justSaved ? (
                      <span>✓ {t("Common.saved")}</span>
                    ) : (
                      t("Common.save")
                    )
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {t("Workflow.autoSaveDescription")}
              </TooltipContent>
            </Tooltip>
          )}
          <div className="h-6">
            <Separator orientation="vertical" />
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={"secondary"}
                disabled={isProcessing || !hasEditAccess}
                onClick={() => updatePublished(!workflow.isPublished)}
                className="w-20"
              >
                {workflow.isPublished
                  ? t("Common.edit")
                  : t("Workflow.publish")}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="end" className="w-60 text-sm">
              <p className="whitespace-pre-wrap break-words p-4">
                {workflow.isPublished
                  ? t("Workflow.publishedDescription")
                  : t("Workflow.draftDescription")}
              </p>
            </TooltipContent>
          </Tooltip>
          <ShareableActions
            type="workflow"
            visibility={workflow.visibility}
            isOwner={hasEditAccess || false}
            onVisibilityChange={hasEditAccess ? updateVisibility : undefined}
            isVisibilityChangeLoading={isSaving}
          />
        </div>
        <div className="flex gap-2">
          {selectedNode && <SelectedNodeConfigTab node={selectedNode} />}
          {showExecutePanel && (
            <ExecuteTab
              close={() => {
                if (isProcessing) return;
                setShowExecutePanel(false);
              }}
              onSave={onSave}
            />
          )}
        </div>
      </div>
    );
  },
  (prev, next) => {
    if (prev.isProcessing !== next.isProcessing) {
      return false;
    }
    if (Boolean(prev.selectedNode) !== Boolean(next.selectedNode)) {
      return false;
    }
    if (prev.hasEditAccess !== next.hasEditAccess) {
      return false;
    }
    if (!equal(prev.selectedNode?.data, next.selectedNode?.data)) {
      return false;
    }

    if (!equal(prev.workflow, next.workflow)) return false;
    return true;
  },
);
