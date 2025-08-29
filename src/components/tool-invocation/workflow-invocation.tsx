import { useCopy } from "@/hooks/use-copy";
import { VercelAIWorkflowToolStreamingResult } from "app-types/workflow";
import equal from "lib/equal";
import { AlertTriangleIcon, Check, Copy, Loader2, XIcon } from "lucide-react";
import { memo, useEffect, useMemo, useRef } from "react";
import { Alert, AlertDescription, AlertTitle } from "ui/alert";
import { Button } from "ui/button";
import JsonView from "ui/json-view";
import { NodeResultPopup } from "../workflow/node-result-popup";
import { cn } from "lib/utils";
import { NodeIcon } from "../workflow/node-icon";
import { TextShimmer } from "ui/text-shimmer";

interface WorkflowInvocationProps {
  result: VercelAIWorkflowToolStreamingResult;
}

function PureWorkflowInvocation({ result }: WorkflowInvocationProps) {
  const { copied, copy } = useCopy();
  const savedResult = useRef<VercelAIWorkflowToolStreamingResult>(result);
  const output = useMemo(() => {
    if (result.status == "running") return null;
    if (result.status == "fail")
      return (
        <Alert variant={"destructive"} className="border-destructive">
          <AlertTriangleIcon className="size-3" />
          <AlertTitle>{result?.error?.name || "ERROR"}</AlertTitle>
          <AlertDescription>{result.error?.message}</AlertDescription>
        </Alert>
      );
    if (!result.result) return null;

    // Support two shapes:
    // 1) Top-level file object as final result
    // 2) Container { result: fileObject, csv?: string }
    const finalResult: any = result.result as any;
    const isFileObject = (v: any) =>
      v && typeof v === "object" && v.type === "file" && typeof v.filename === "string" && typeof v.mime === "string" && typeof v.base64 === "string";

    const fileObj = isFileObject(finalResult)
      ? finalResult
      : isFileObject(finalResult?.result)
        ? finalResult.result
        : null;

    const csvText: string | undefined = typeof finalResult?.csv === "string" ? finalResult.csv : undefined;

    if (fileObj) {
      const href = `data:${fileObj.mime};base64,${fileObj.base64}`;
      const isCsv = String(fileObj.mime || "").startsWith("text/csv");
      let csvPreview: string | null = null;
      if (isCsv) {
        try {
          const decoded = typeof window !== "undefined" ? atob(fileObj.base64) : "";
          csvPreview = decoded.split("\n").slice(0, 20).join("\n");
        } catch {}
      }

      return (
        <div className="w-full bg-card p-4 border text-xs rounded-lg text-muted-foreground">
          <div className="flex items-center">
            <h5 className="text-muted-foreground font-medium select-none">Response</h5>
            <div className="flex-1" />
            {copied ? (
              <Check className="size-3" />
            ) : (
              <Button
                variant="ghost"
                size="icon"
                className="size-3 text-muted-foreground"
                onClick={() => copy(JSON.stringify(result.result))}
              >
                <Copy className="size-3" />
              </Button>
            )}
          </div>
          <div className="p-2 max-h-[300px] overflow-y-auto flex flex-col gap-2">
            <a
              href={href}
              download={fileObj.filename}
              className="px-2 py-1 text-xs rounded-md border bg-muted/70 hover:bg-muted transition-colors w-fit"
            >
              Download {fileObj.filename}
            </a>
            {csvText ? (
              <a
                href={`data:text/csv;charset=utf-8,${encodeURIComponent(csvText)}`}
                download={(fileObj.filename || "output").replace(/\.[^/.]+$/, "") + ".csv"}
                className="px-2 py-1 text-xs rounded-md border bg-muted/70 hover:bg-muted transition-colors w-fit"
              >
                Download CSV
              </a>
            ) : null}
            {isCsv && csvPreview ? (
              <div className="mt-2">
                <p className="mb-1 text-muted-foreground">CSV preview (first 20 lines)</p>
                <pre className="text-[10px] p-2 bg-muted rounded overflow-auto whitespace-pre-wrap">{csvPreview}</pre>
              </div>
            ) : null}
          </div>
        </div>
      );
    }

    return (
      <div className="w-full bg-card p-4 border text-xs rounded-lg text-muted-foreground">
        <div className="flex items-center">
          <h5 className="text-muted-foreground font-medium select-none">
            Response
          </h5>
          <div className="flex-1" />
          {copied ? (
            <Check className="size-3" />
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="size-3 text-muted-foreground"
              onClick={() => copy(JSON.stringify(result.result))}
            >
              <Copy className="size-3" />
            </Button>
          )}
        </div>
        <div className="p-2 max-h-[300px] overflow-y-auto">
          <JsonView data={result.result} />
        </div>
      </div>
    );
  }, [result.status, result.error, result.result, copied]);
  useEffect(() => {
    if (result.status == "running") {
      savedResult.current = result;
    }
  }, [result]);

  return (
    <div className="w-full flex flex-col gap-1">
      {result.history.map((item, i) => {
        const result = item.result || savedResult.current.history[i]?.result;
        return (
          <div key={item.id}>
            <NodeResultPopup
              disabled={!result}
              history={{
                name: item.name,
                status: item.status,
                startedAt: item.startedAt,
                endedAt: item.endedAt,
                error: item.error?.message,
                result,
              }}
            >
              <div
                className={cn(
                  "flex items-center gap-2 text-sm rounded-sm px-2 py-1.5 relative",
                  item.status == "fail" && "text-destructive",
                  !!result && "cursor-pointer hover:bg-secondary",
                )}
              >
                <div className="border rounded overflow-hidden">
                  <NodeIcon
                    type={item.kind}
                    iconClassName="size-3"
                    className="rounded-none"
                  />
                </div>
                {item.status == "running" ? (
                  <TextShimmer className="font-semibold">
                    {`${item.name} Running...`}
                  </TextShimmer>
                ) : (
                  <span className="font-semibold">{item.name}</span>
                )}
                <span
                  className={cn(
                    "ml-auto text-xs",
                    item.status != "fail" && "text-muted-foreground",
                  )}
                >
                  {item.status != "running" &&
                    ((item.endedAt! - item.startedAt!) / 1000).toFixed(2)}
                </span>
                {item.status == "success" ? (
                  <Check className="size-3" />
                ) : item.status == "fail" ? (
                  <XIcon className="size-3" />
                ) : (
                  <Loader2 className="size-3 animate-spin" />
                )}
              </div>
            </NodeResultPopup>
          </div>
        );
      })}
      <div className="mt-2">{output}</div>
    </div>
  );
}

function areEqual(
  prev: WorkflowInvocationProps,
  next: WorkflowInvocationProps,
) {
  if (prev.result.status != next.result.status) return false;
  if (prev.result.error?.message != next.result.error?.message) return false;
  if (prev.result.result != next.result.result) return false;
  if (!equal(prev.result.history, next.result.history)) return false;
  if (!equal(prev.result.result, next.result.result)) return false;
  return true;
}

export const WorkflowInvocation = memo(PureWorkflowInvocation, areEqual);
