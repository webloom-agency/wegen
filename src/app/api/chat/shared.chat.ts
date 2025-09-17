import "server-only";
import {
  LoadAPIKeyError,
  Message,
  Tool,
  ToolInvocation,
  jsonSchema,
  tool as createTool,
  DataStreamWriter,
  formatDataStreamPart,
} from "ai";
import {
  ChatMention,
  ChatMessage,
  ChatMessageAnnotation,
  ClientToolInvocationZodSchema,
  ToolInvocationUIPart,
} from "app-types/chat";
import { errorToString, objectFlow, toAny } from "lib/utils";
import logger from "logger";
import {
  AllowedMCPServer,
  McpServerCustomizationsPrompt,
  VercelAIMcpTool,
} from "app-types/mcp";
import { MANUAL_REJECT_RESPONSE_PROMPT } from "lib/ai/prompts";

import { ObjectJsonSchema7 } from "app-types/util";
import { safe } from "ts-safe";
import { workflowRepository } from "lib/db/repository";

import {
  VercelAIWorkflowTool,
  VercelAIWorkflowToolStreaming,
  VercelAIWorkflowToolStreamingResult,
} from "app-types/workflow";
import { createWorkflowExecutor } from "lib/ai/workflow/executor/workflow-executor";
import { NodeKind } from "lib/ai/workflow/workflow.interface";
import { mcpClientsManager } from "lib/ai/mcp/mcp-manager";
import { APP_DEFAULT_TOOL_KIT } from "lib/ai/tools/tool-kit";
import { AppDefaultToolkit } from "lib/ai/tools";

export function filterMCPToolsByMentions(
  tools: Record<string, VercelAIMcpTool>,
  mentions: ChatMention[],
) {
  if (mentions.length === 0) {
    return tools;
  }
  const toolMentions = mentions.filter(
    (mention) => mention.type == "mcpTool" || mention.type == "mcpServer",
  );

  // If there are no explicit MCP tool/server mentions, do not filter tools
  if (toolMentions.length === 0) {
    return tools;
  }

  const metionsByServer = toolMentions.reduce(
    (acc, mention) => {
      if (mention.type == "mcpServer") {
        return {
          ...acc,
          [mention.serverId]: Object.values(tools).map(
            (tool) => tool._originToolName,
          ),
        };
      }
      return {
        ...acc,
        [mention.serverId]: [...(acc[mention.serverId] ?? []), mention.name],
      };
    },
    {} as Record<string, string[]>,
  );

  return objectFlow(tools).filter((_tool) => {
    if (!metionsByServer[_tool._mcpServerId]) return false;
    return metionsByServer[_tool._mcpServerId].includes(_tool._originToolName);
  });
}

export function filterMCPToolsByAllowedMCPServers(
  tools: Record<string, VercelAIMcpTool>,
  allowedMcpServers?: Record<string, AllowedMCPServer>,
): Record<string, VercelAIMcpTool> {
  // If no explicit allow-list is provided, allow all MCP tools by default
  if (!allowedMcpServers || Object.keys(allowedMcpServers).length === 0) {
    return tools;
  }
  return objectFlow(tools).filter((_tool) => {
    if (!allowedMcpServers[_tool._mcpServerId]?.tools) return false;
    return allowedMcpServers[_tool._mcpServerId].tools.includes(
      _tool._originToolName,
    );
  });
}

export function excludeToolExecution(
  tool: Record<string, Tool>,
): Record<string, Tool> {
  return objectFlow(tool).map((value) => {
    return createTool({
      parameters: value.parameters,
      description: value.description,
    });
  });
}

export function appendAnnotations(
  annotations: any[] = [],
  annotationsToAppend: ChatMessageAnnotation[] | ChatMessageAnnotation,
): ChatMessageAnnotation[] {
  const newAnnotations = Array.isArray(annotationsToAppend)
    ? annotationsToAppend
    : [annotationsToAppend];
  return [...annotations, ...newAnnotations];
}

export function mergeSystemPrompt(
  ...prompts: (string | undefined | false)[]
): string {
  const filteredPrompts = prompts
    .map((prompt) => (prompt ? prompt.trim() : ""))
    .filter(Boolean);
  return filteredPrompts.join("\n\n");
}

export function manualToolExecuteByLastMessage(
  part: ToolInvocationUIPart,
  message: Message,
  tools: Record<
    string,
    VercelAIMcpTool | VercelAIWorkflowTool | (Tool & { __$ref__?: string })
  >,
  abortSignal?: AbortSignal,
) {
  const { args, toolName } = part.toolInvocation;

  const manulConfirmation = (message.parts as ToolInvocationUIPart[]).find(
    (_part) => {
      return _part.toolInvocation?.toolCallId == part.toolInvocation.toolCallId;
    },
  )?.toolInvocation as Extract<ToolInvocation, { state: "result" }>;

  const tool = tools[toolName];

  if (!manulConfirmation?.result) return MANUAL_REJECT_RESPONSE_PROMPT;
  return safe(() => {
    if (!tool) throw new Error(`tool not found: ${toolName}`);
    return ClientToolInvocationZodSchema.parse(manulConfirmation?.result);
  })
    .map((result) => {
      const value = result?.result;

      if (result.action == "direct") {
        return value;
      } else if (result.action == "manual") {
        if (!value) return MANUAL_REJECT_RESPONSE_PROMPT;
        if (tool.__$ref__ === "workflow") {
          return tool.execute!(args, {
            toolCallId: part.toolInvocation.toolCallId,
            abortSignal: abortSignal ?? new AbortController().signal,
            messages: [],
          });
        } else if (tool.__$ref__ === "mcp") {
          const mcpTool = tool as VercelAIMcpTool;
          return mcpClientsManager.toolCall(
            mcpTool._mcpServerId,
            mcpTool._originToolName,
            args,
          );
        }
        return tool.execute!(args, {
          toolCallId: part.toolInvocation.toolCallId,
          abortSignal: abortSignal ?? new AbortController().signal,
          messages: [],
        });
      }
      throw new Error("Invalid Client Tool Invocation Action " + result.action);
    })
    .ifFail((error) => ({
      isError: true,
      statusMessage: `tool call fail: ${toolName}`,
      error: errorToString(error),
    }))
    .unwrap();
}

export function handleError(error: any) {
  if (LoadAPIKeyError.isInstance(error)) {
    return error.message;
  }

  logger.error(error);
  logger.error(error.name);
  return errorToString(error.message);
}

export function convertToMessage(message: ChatMessage): Message {
  return {
    ...message,
    id: message.id,
    content: "",
    role: message.role,
    parts: message.parts,
    experimental_attachments:
      toAny(message).attachments || toAny(message).experimental_attachments,
  };
}

export function extractInProgressToolPart(
  messages: Message[],
): ToolInvocationUIPart | null {
  let result: ToolInvocationUIPart | null = null;

  for (const message of messages) {
    for (const part of message.parts || []) {
      if (part.type != "tool-invocation") continue;
      if (part.toolInvocation.state == "result") continue;
      result = part as ToolInvocationUIPart;
      return result;
    }
  }
  return null;
}
export function assignToolResult(toolPart: ToolInvocationUIPart, result: any) {
  return Object.assign(toolPart, {
    toolInvocation: {
      ...toolPart.toolInvocation,
      state: "result",
      result,
    },
  });
}

export function filterMcpServerCustomizations(
  tools: Record<string, VercelAIMcpTool>,
  mcpServerCustomization: Record<string, McpServerCustomizationsPrompt>,
): Record<string, McpServerCustomizationsPrompt> {
  const toolNamesByServerId = Object.values(tools).reduce(
    (acc, tool) => {
      if (!acc[tool._mcpServerId]) acc[tool._mcpServerId] = [];
      acc[tool._mcpServerId].push(tool._originToolName);
      return acc;
    },
    {} as Record<string, string[]>,
  );

  return Object.entries(mcpServerCustomization).reduce(
    (acc, [serverId, mcpServerCustomization]) => {
      if (!(serverId in toolNamesByServerId)) return acc;

      if (
        !mcpServerCustomization.prompt &&
        !Object.keys(mcpServerCustomization.tools ?? {}).length
      )
        return acc;

      const prompts: McpServerCustomizationsPrompt = {
        id: serverId,
        name: mcpServerCustomization.name,
        prompt: mcpServerCustomization.prompt,
        tools: mcpServerCustomization.tools
          ? objectFlow(mcpServerCustomization.tools).filter((_, key) => {
              return toolNamesByServerId[serverId].includes(key as string);
            })
          : {},
      };

      acc[serverId] = prompts;

      return acc;
    },
    {} as Record<string, McpServerCustomizationsPrompt>,
  );
}

export const workflowToVercelAITool = ({
  id,
  description,
  schema,
  dataStream,
  name,
}: {
  id: string;
  name: string;
  description?: string;
  schema: ObjectJsonSchema7;
  dataStream: DataStreamWriter;
}): VercelAIWorkflowTool => {
  const toolName = name
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toUpperCase();

  const tool = createTool({
    description: `${name} ${description?.trim().slice(0, 50)}`,
    parameters: jsonSchema(schema),
    execute(query, { toolCallId, abortSignal }) {
      // Apply JSON Schema defaults without overwriting provided values
      const applyDefaultsFromSchema = (
        value: any,
        schemaNode?: any,
      ): any => {
        if (!schemaNode) return value;
        if (schemaNode.type === 'object' && schemaNode.properties) {
          const next: any = { ...(value ?? {}) };
          for (const [key, propSchema] of Object.entries<any>(schemaNode.properties)) {
            const has = Object.prototype.hasOwnProperty.call(next, key);
            if (!has && propSchema && Object.prototype.hasOwnProperty.call(propSchema, 'default')) {
              next[key] = (propSchema as any).default;
            }
            if (typeof next[key] === 'object' && next[key] !== null) {
              next[key] = applyDefaultsFromSchema(next[key], propSchema);
            }
          }
          return next;
        }
        if (schemaNode.type === 'array' && Array.isArray(value)) {
          const itemSchema = schemaNode.items as any;
          return value.map((v) => applyDefaultsFromSchema(v, itemSchema));
        }
        return value;
      };

      const argsWithDefaults = applyDefaultsFromSchema(query ?? {}, schema);
      const history: VercelAIWorkflowToolStreaming[] = [];
      const toolResult: VercelAIWorkflowToolStreamingResult = {
        toolCallId,
        workflowName: name,
        __$ref__: "workflow",
        startedAt: Date.now(),
        endedAt: Date.now(),
        history,
        result: undefined,
        status: "running",
        _workflowId: id,
      };
      // Emit initial running state so the client creates the UI and can show subsequent streaming updates
      try {
        dataStream.write(
          formatDataStreamPart("tool_result", {
            toolCallId,
            result: toolResult,
          }),
        );
      } catch {}
      return safe(id)
        .map((id) =>
          workflowRepository.selectStructureById(id, {
            ignoreNote: true,
          }),
        )
        .map((workflow) => {
          if (!workflow) throw new Error("Not Found Workflow");
          const executor = createWorkflowExecutor({
            nodes: workflow.nodes,
            edges: workflow.edges,
          });
          toolResult.workflowIcon = workflow.icon;
          toolResult.isReadOnly = workflow.visibility === "readonly";

          abortSignal?.addEventListener("abort", () => executor.exit());
          executor.subscribe((e) => {
            if (
              e.eventType == "WORKFLOW_START" ||
              e.eventType == "WORKFLOW_END"
            )
              return;
            if (e.node.name == "SKIP") return;
            if (e.eventType == "NODE_START") {
              const node = workflow.nodes.find(
                (node) => node.id == e.node.name,
              )!;
              if (!node) return;
              history.push({
                id: e.nodeExecutionId,
                name: node.name,
                status: "running",
                startedAt: e.startedAt,
                kind: node.kind as NodeKind,
              });
            } else if (e.eventType == "NODE_END") {
              const result = history.find((r) => r.id == e.nodeExecutionId);
              if (result) {
                if (e.isOk) {
                  result.status = "success";
                  result.result = {
                    input: e.node.output.getInput(e.node.name),
                    output: e.node.output.getOutput({
                      nodeId: e.node.name,
                      path: [],
                    }),
                  };
                } else {
                  result.status = "fail";
                  result.error = {
                    name: e.error?.name || "ERROR",
                    message: errorToString(e.error),
                  };
                }
                result.endedAt = e.endedAt;
              }
            }
            dataStream.write(
              formatDataStreamPart("tool_result", {
                toolCallId,
                result: toolResult,
              }),
            );
          });
          return executor.run(
            {
              // Ensure defaults are provided for missing inputs
              query: argsWithDefaults,
            },
            {
              disableHistory: true,
            },
          );
        })
        .map((result) => {
          toolResult.endedAt = Date.now();
          toolResult.status = result.isOk ? "success" : "fail";
          toolResult.error = result.error
            ? {
                name: result.error.name || "ERROR",
                message: errorToString(result.error) || "Unknown Error",
              }
            : undefined;
          const outputNodeResults = history
            .filter((h) => h.kind == NodeKind.Output)
            .map((v) => v.result?.output)
            .filter(Boolean);
          toolResult.history = history.map((h) => ({
            ...h,
            result: undefined, // save tokens.
          }));
          toolResult.result =
            outputNodeResults.length == 1
              ? outputNodeResults[0]
              : outputNodeResults;
          // Unwrap single-key objects like { text: X } to just X for convenience in chat/tool output
          if (
            toolResult.result &&
            typeof toolResult.result === "object" &&
            !Array.isArray(toolResult.result)
          ) {
            const keys = Object.keys(toolResult.result as any);
            if (keys.length === 1) {
              toolResult.result = (toolResult.result as any)[keys[0]];
            }
          }
          return toolResult;
        })
        .ifFail((err) => {
          return {
            error: {
              name: err?.name || "ERROR",
              message: errorToString(err),
              history,
            },
          };
        })
        .unwrap();
    },
  }) as VercelAIWorkflowTool;

  tool._workflowId = id;
  tool._originToolName = name;
  tool._toolName = toolName;
  tool.__$ref__ = "workflow";

  return tool;
};

export const workflowToVercelAITools = (
  workflows: {
    id: string;
    name: string;
    description?: string;
    schema: ObjectJsonSchema7;
  }[],
  dataStream: DataStreamWriter,
) => {
  return workflows
    .map((v) =>
      workflowToVercelAITool({
        ...v,
        dataStream,
      }),
    )
    .reduce(
      (prev, cur) => {
        prev[cur._toolName] = cur;
        return prev;
      },
      {} as Record<string, VercelAIWorkflowTool>,
    );
};

export const loadMcpTools = (opt?: {
  mentions?: ChatMention[];
  allowedMcpServers?: Record<string, AllowedMCPServer>;
}) =>
  safe(() => mcpClientsManager.tools())
    .map((tools) => {
      const hasMcpMentions = (opt?.mentions || []).some(
        (m) => m.type === "mcpTool" || m.type === "mcpServer",
      );
      if (hasMcpMentions) {
        return filterMCPToolsByMentions(tools, opt!.mentions!);
      }
      // If there is an explicit allow-list, filter by it; otherwise, do NOT expose any MCP tools
      if (opt?.allowedMcpServers && Object.keys(opt.allowedMcpServers).length > 0) {
        return filterMCPToolsByAllowedMCPServers(tools, opt.allowedMcpServers);
      }
      return {} as Record<string, VercelAIMcpTool>;
    })
    .orElse({} as Record<string, VercelAIMcpTool>);

export const loadWorkFlowTools = (opt: {
  mentions?: ChatMention[];
  dataStream: DataStreamWriter;
}) =>
  safe(() =>
    opt?.mentions?.length
      ? workflowRepository.selectToolByIds(
          opt?.mentions
            ?.filter((m) => m.type == "workflow")
            .map((v) => v.workflowId),
        )
      : [],
  )
    .map((tools) => workflowToVercelAITools(tools, opt.dataStream))
    .orElse({} as Record<string, VercelAIWorkflowTool>);

export const loadAppDefaultTools = (opt?: {
  mentions?: ChatMention[];
  allowedAppDefaultToolkit?: string[];
}) =>
  safe(APP_DEFAULT_TOOL_KIT)
    .map((tools) => {
      const defaultToolMentions = (opt?.mentions || []).filter(
        (m) => m.type == "defaultTool",
      );
      if (defaultToolMentions.length > 0) {
        return Array.from(Object.values(tools)).reduce((acc, t) => {
          const group = t as Record<string, Tool>;
          const allowed = objectFlow(group).filter((_, k) => {
            return defaultToolMentions.some((m) => m.name == k);
          });
          return { ...(acc as Record<string, Tool>), ...allowed } as Record<string, Tool>;
        }, {});
      }
      // If specific default toolkits are explicitly allowed, load only those groups.
      // Otherwise, expose only non-visualization toolkits by default to avoid unsolicited charts/tables.
      const allowedAppDefaultToolkit = Array.isArray(opt?.allowedAppDefaultToolkit)
        ? opt!.allowedAppDefaultToolkit!
        : Object.values(AppDefaultToolkit).filter((k) => k !== AppDefaultToolkit.Visualization);

      return (
        allowedAppDefaultToolkit.reduce(
        (acc, key) => {
          return { ...acc, ...tools[key] };
        },
        {} as Record<string, Tool>,
      ) || {});
    })
    .ifFail((e) => {
      console.error(e);
      throw e;
    })
    .orElse({} as Record<string, Tool>);
