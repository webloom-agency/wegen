"use client";

import { useReactFlow } from "@xyflow/react";
import { UINode } from "lib/ai/workflow/workflow.interface";
import { Label } from "ui/label";
import { Button } from "ui/button";
import { VariableSelect } from "../variable-select";
import { VariableMentionItem } from "../variable-mention-item";
import { useTranslations } from "next-intl";
import { OutputSchemaSourceKey, NodeKind } from "lib/ai/workflow/workflow.interface";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "ui/select";

export function LoopStartConfig({ node }: { node: UINode<any> }) {
  const t = useTranslations("Workflow");
  const { getNodes, getEdges, updateNodeData } = useReactFlow<UINode>();

  const loopEnds = getNodes().filter((n) => n.data.kind === NodeKind.LoopEnd);

  return (
    <div className="flex flex-col gap-4 px-4">
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">{t("loopSource") || "Loop Source"}</Label>
        <div className="flex items-center gap-2">
          {node.data.source ? (
            <VariableMentionItem
              className="py-[7px] text-sm truncate flex-1"
              nodeName={(() => getNodes().find((n) => n.data.id === node.data.source?.nodeId)?.data.name || "ERROR")()}
              path={node.data.source?.path || []}
              notFound={!getNodes().some((n) => n.data.id === node.data.source?.nodeId)}
              onRemove={() => updateNodeData(node.id, { source: undefined })}
            />
          ) : (
            <div className="flex-1 text-xs text-muted-foreground">{t("selectVariable") || "Select a variable"}</div>
          )}
          <VariableSelect
            currentNodeId={node.data.id}
            onChange={(item) => {
              updateNodeData(node.id, {
                source: { nodeId: item.nodeId, path: item.path } as OutputSchemaSourceKey,
              });
            }}
          >
            <Button size="sm" variant={node.data.source ? "secondary" : "outline"}>Var</Button>
          </VariableSelect>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">{t("loopEndNode") || "Loop End Node"}</Label>
        <Select
          value={node.data.endNodeId || ""}
          onValueChange={(value) => updateNodeData(node.id, { endNodeId: value || undefined })}
        >
          <SelectTrigger>
            <SelectValue placeholder={t("selectNode") || "Select node"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t("none") || "None"}</SelectItem>
            {loopEnds.map((n) => (
              <SelectItem key={n.id} value={n.id}>{n.data.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export function LoopEndConfig({ node }: { node: UINode<any> }) {
  const t = useTranslations("Workflow");
  const { getNodes, getEdges, updateNodeData } = useReactFlow<UINode>();

  const loopStarts = getNodes().filter((n) => n.data.kind === NodeKind.LoopStart);

  return (
    <div className="flex flex-col gap-4 px-4">
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">{t("loopStartNode") || "Loop Start Node"}</Label>
        <Select
          value={node.data.startNodeId || ""}
          onValueChange={(value) => updateNodeData(node.id, { startNodeId: value || undefined })}
        >
          <SelectTrigger>
            <SelectValue placeholder={t("selectNode") || "Select node"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t("none") || "None"}</SelectItem>
            {loopStarts.map((n) => (
              <SelectItem key={n.id} value={n.id}>{n.data.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">{t("loopCollect") || "Collect (optional)"}</Label>
        <div className="flex items-center gap-2">
          {node.data.collect ? (
            <VariableMentionItem
              className="py-[7px] text-sm truncate flex-1"
              nodeName={(() => getNodes().find((n) => n.data.id === node.data.collect?.nodeId)?.data.name || "ERROR")()}
              path={node.data.collect?.path || []}
              notFound={!getNodes().some((n) => n.data.id === node.data.collect?.nodeId)}
              onRemove={() => updateNodeData(node.id, { collect: undefined })}
            />
          ) : (
            <div className="flex-1 text-xs text-muted-foreground">{t("selectVariableOptional") || "Select variable (optional)"}</div>
          )}
          <VariableSelect
            currentNodeId={node.data.id}
            onChange={(item) => {
              updateNodeData(node.id, {
                collect: { nodeId: item.nodeId, path: item.path } as OutputSchemaSourceKey,
              });
            }}
          >
            <Button size="sm" variant={node.data.collect ? "secondary" : "outline"}>Var</Button>
          </VariableSelect>
        </div>
      </div>
    </div>
  );
} 