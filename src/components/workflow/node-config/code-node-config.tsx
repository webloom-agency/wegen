import { UINode } from "lib/ai/workflow/workflow.interface";
import { useReactFlow } from "@xyflow/react";
import { Label } from "ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "ui/select";
import { Textarea } from "ui/textarea";
import { Switch } from "ui/switch";
import { Input } from "ui/input";
import { memo } from "react";
import { useEdges, useNodes } from "@xyflow/react";
import { OutputSchemaMentionInput } from "../output-schema-mention-input";

export const CodeNodeConfig = memo(function CodeNodeConfig({ node }: { node: UINode }) {
  const { updateNodeData } = useReactFlow();
  const nodes = useNodes() as UINode[];
  const edges = useEdges();
  const data: any = node.data;
  return (
    <div className="flex flex-col gap-3 px-4 text-sm">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Language</Label>
          <Select
            value={data.language}
            onValueChange={(value) => updateNodeData(node.id, { language: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="python">Python</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Timeout (ms)</Label>
          <Input
            type="number"
            value={data.timeout || 30000}
            onChange={(e) => updateNodeData(node.id, { timeout: Number(e.target.value) })}
          />
        </div>
      </div>

      <div>
        <Label>Parameters (JSON, optional)</Label>
        <div className="w-full bg-secondary rounded-md p-2 min-h-20">
          <OutputSchemaMentionInput
            currentNodeId={node.id}
            nodes={nodes}
            edges={edges}
            content={data.params}
            editable={true}
            onChange={(content) => updateNodeData(node.id, { params: content })}
          />
        </div>
      </div>

      <div>
        <Label>Code</Label>
        <Textarea
          className="min-h-48 font-mono"
          value={data.code}
          onChange={(e) => updateNodeData(node.id, { code: e.target.value })}
          placeholder={
            data.language === "python"
              ? "# params is a dict with your resolved inputs\n# set result = ... to return a value\nprint('hello')\nresult = {'a':1}"
              : ""
          }
        />
      </div>

      <div className="flex items-center gap-2">
        <Switch
          checked={Boolean(data.exportCsv)}
          onCheckedChange={(checked) => updateNodeData(node.id, { exportCsv: checked })}
        />
        <Label>Export result to CSV if possible</Label>
      </div>
    </div>
  );
});
CodeNodeConfig.displayName = "CodeNodeConfig"; 