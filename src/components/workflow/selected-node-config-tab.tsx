"use client";
import { NodeKind, UINode } from "lib/ai/workflow/workflow.interface";
import { useReactFlow } from "@xyflow/react";
import { NodeIcon } from "./node-icon";
import { Input } from "ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "ui/dropdown-menu";
import { MoreHorizontalIcon, XIcon } from "lucide-react";
import { NodeContextMenuContent } from "./node-context-menu-content";
import { Textarea } from "ui/textarea";
import { Separator } from "ui/separator";
import { InputNodeDataConfig } from "./node-config/input-node-config";
import { OutputNodeDataConfig } from "./node-config/output-node-config";
import { LLMNodeDataConfig } from "./node-config/llm-node-config";
import { ConditionNodeDataConfig } from "./node-config/condition-node-config";
import { Label } from "ui/label";
import { NextNodeInfo } from "./next-node-info";
import { nextTick } from "lib/utils";
import { ToolNodeDataConfig } from "./node-config/tool-node-config";
import { HttpNodeConfig } from "./node-config/http-node-config";
import { TemplateNodeConfig } from "./node-config/template-node-config";
import { CodeNodeConfig } from "./node-config/code-node-config";
import { useTranslations } from "next-intl";
import { Button } from "ui/button";
import { VariableSelect } from "./variable-select";
import { VariableMentionItem } from "./variable-mention-item";

export function SelectedNodeConfigTab({ node, hasEditAccess }: { node: UINode; hasEditAccess?: boolean }) {
  const t = useTranslations();
  const { updateNodeData, updateNode, setNodes, getNodes } = useReactFlow();

  const isReadonly = !hasEditAccess;

  return (
    <div
      key={node.id}
      className="w-sm h-[85vh] space-y-4 bg-card border rounded-lg shadow-lg overflow-y-auto py-4"
    >
      {/* Header */}
      <div className="px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 w-full">
            <NodeIcon type={node.data.kind} />
            {isReadonly ? (
              <div className="text-lg font-semibold truncate" title={node.data.name}>{node.data.name}</div>
            ) : (
              <Input
                maxLength={20}
                onChange={(e) =>
                  updateNodeData(node.id, { name: e.target.value })
                }
                value={node.data.name}
                className="bg-transparent border-none px-0 text-lg font-semibold"
              />
            )}
            {!isReadonly && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <div className="ml-auto rounded hover:bg-secondary cursor-pointer p-1">
                    <MoreHorizontalIcon className="size-3.5" />
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <NodeContextMenuContent node={node.data} />
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <div
              className="p-1 rounded hover:bg-secondary cursor-pointer"
              onClick={() => {
                setNodes((nodes) => {
                  return nodes.map((n) =>
                    n.id === node.id ? { ...n, selected: false } : n,
                  );
                });
              }}
            >
              <XIcon className="size-3.5" />
            </div>
          </div>
        </div>
        {node.data.kind !== NodeKind.Note && (
          isReadonly ? (
            <div className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap break-words min-h-6">
              {node.data.description || t("Workflow.nodeDescriptionPlaceholder")}
            </div>
          ) : (
            <Textarea
              className="text-xs bg-transparent rounded-none resize-none overflow-y-auto max-h-14 min-h-6 h-6 mt-2 p-0 border-none"
              value={node.data.description}
              onChange={(e) =>
                updateNodeData(node.id, {
                  description: e.target.value,
                })
              }
              placeholder={t("Workflow.nodeDescriptionPlaceholder")}
            />
          )
        )}
      </div>

      {!isReadonly && <Separator className="my-6" />}
      {!isReadonly && (
        <div className="flex-1">
          {node.data.kind === NodeKind.Input ? (
            <InputNodeDataConfig data={node.data} />
          ) : node.data.kind === NodeKind.Output ? (
            <OutputNodeDataConfig data={node.data} />
          ) : node.data.kind === NodeKind.LLM ? (
            <LLMNodeDataConfig data={node.data} />
          ) : node.data.kind === NodeKind.Condition ? (
            <ConditionNodeDataConfig data={node.data} />
          ) : node.data.kind === NodeKind.Tool ? (
            <ToolNodeDataConfig data={node.data} />
          ) : node.data.kind === NodeKind.Http ? (
            <HttpNodeConfig node={node} />
          ) : node.data.kind === NodeKind.Template ? (
            <TemplateNodeConfig data={node.data} />
          ) : node.data.kind === NodeKind.Code ? (
            <CodeNodeConfig node={node} />
          ) : node.data.kind === NodeKind.Loop ? (
            <div className="flex flex-col gap-4 px-4 text-sm">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Loop Source</Label>
                <div className="flex items-center gap-2">
                  {(node.data as any).source ? (
                    <VariableMentionItem
                      className="py-[7px] text-sm truncate flex-1"
                      nodeName={
                        (
                          getNodes().find((n) => n.data.id === (node.data as any).source?.nodeId)?.data
                            .name as string
                        ) || "ERROR"
                      }
                      path={(node.data as any).source?.path || []}
                      notFound={!getNodes().some((n) => n.data.id === (node.data as any).source?.nodeId)}
                      onRemove={() => updateNodeData(node.id, { source: undefined })}
                    />
                  ) : (
                    <div className="flex-1 text-xs text-muted-foreground">Select a variable</div>
                  )}
                  <VariableSelect
                    currentNodeId={node.data.id}
                    onChange={(item) => {
                      updateNodeData(node.id, { source: { nodeId: item.nodeId, path: item.path } as any });
                    }}
                  >
                    <Button size="sm" variant={(node.data as any).source ? "secondary" : "outline"}>Var</Button>
                  </VariableSelect>
                </div>
              </div>
              <div>
                <Label>Max runs</Label>
                <Input
                  type="number"
                  value={(node.data as any).maxRuns ?? ""}
                  placeholder="optional"
                  onChange={(e) => {
                    const v = e.target.value;
                    updateNodeData(node.id, { maxRuns: v ? Math.max(0, Number(v)) : undefined });
                  }}
                />
                <div className="text-[10px] text-muted-foreground mt-1">Hard cap on iterations. Leave empty for no cap.</div>
              </div>
            </div>
          ) : node.data.kind === NodeKind.LoopEnd ? (
            <div className="flex flex-col gap-4 px-4 text-sm">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Collect value (optional)</Label>
                <div className="flex items-center gap-2">
                  {(node.data as any).collect ? (
                    <VariableMentionItem
                      className="py-[7px] text-sm truncate flex-1"
                      nodeName={
                        (
                          getNodes().find((n) => n.data.id === (node.data as any).collect?.nodeId)?.data
                            .name as string
                        ) || "ERROR"
                      }
                      path={(node.data as any).collect?.path || []}
                      notFound={!getNodes().some((n) => n.data.id === (node.data as any).collect?.nodeId)}
                      onRemove={() => updateNodeData(node.id, { collect: undefined })}
                    />
                  ) : (
                    <div className="flex-1 text-xs text-muted-foreground">Defaults to current loop.item</div>
                  )}
                  <VariableSelect
                    currentNodeId={node.data.id}
                    onChange={(item) => {
                      updateNodeData(node.id, { collect: { nodeId: item.nodeId, path: item.path } as any });
                    }}
                  >
                    <Button size="sm" variant={(node.data as any).collect ? "secondary" : "outline"}>Var</Button>
                  </VariableSelect>
                </div>
                <div className="text-[10px] text-muted-foreground">LoopEnd will output an array at items[].</div>
              </div>
            </div>
          ) : node.data.kind === NodeKind.Note ? (
            <div className="h-full flex flex-col gap-2 px-4">
              <Label
                htmlFor="description"
                className="text-muted-foreground text-xs"
              >
                {t("Common.description")}
              </Label>
              <Textarea
                id="description"
                className="resize-none min-h-80 max-h-80 overflow-y-auto"
                value={node.data.description}
                onChange={(e) =>
                  updateNodeData(node.id, {
                    description: e.target.value,
                  })
                }
              />
            </div>
          ) : null}
        </div>
      )}

      {!isReadonly && ![NodeKind.Output, NodeKind.Note].includes(node.data.kind) && (
        <>
          <Separator className="my-6" />
          <div className="px-4 ">
            <NextNodeInfo
              node={node}
              onSelectNode={(id) => {
                updateNode(node.id, { selected: false });
                nextTick().then(() => updateNode(id, { selected: true }));
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}
