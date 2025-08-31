import { customModelProvider } from "lib/ai/models";
import {
  ConditionNodeData,
  OutputNodeData,
  LLMNodeData,
  InputNodeData,
  WorkflowNodeData,
  ToolNodeData,
  HttpNodeData,
  TemplateNodeData,
  OutputSchemaSourceKey,
  CodeNodeData,
  LoopStartNodeData,
  LoopEndNodeData,
} from "../workflow.interface";
import { WorkflowRuntimeState } from "./graph-store";
import { generateObject, generateText, Message } from "ai";
import { checkConditionBranch } from "../condition";
import {
  convertTiptapJsonToAiMessage,
  convertTiptapJsonToText,
} from "../shared.workflow";
import { jsonSchemaToZod } from "lib/json-schema-to-zod";
import { toAny } from "lib/utils";
import { AppError } from "lib/errors";
import { DefaultToolName } from "lib/ai/tools";
import {
  exaSearchToolForWorkflow,
  exaContentsToolForWorkflow,
} from "lib/ai/tools/web/web-search";
import { mcpClientsManager } from "lib/ai/mcp/mcp-manager";
import { safeJsRun } from "lib/code-runner/safe-js-run";
import { runPythonServer } from "lib/code-runner/python-server-runner";

/** Deep-trim whitespace from all string leaves in an object/array */
function deepTrimStrings<T>(value: T): T {
  if (typeof value === "string") return value.trim() as unknown as T;
  if (Array.isArray(value)) return value.map((v) => deepTrimStrings(v)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value as Record<string, any>)) {
      out[k] = deepTrimStrings(v);
    }
    return out as unknown as T;
  }
  return value;
}

/**
 * Interface for node executor functions.
 * Each node type implements this interface to define its execution behavior.
 *
 * @param input - Contains the node data and current workflow state
 * @returns Object with optional input and output data to be stored in workflow state
 */
export type NodeExecutor<T extends WorkflowNodeData = any> = (input: {
  node: T;
  state: WorkflowRuntimeState;
}) =>
  | Promise<{
      input?: any; // Input data used by this node (for debugging/history)
      output?: any; // Output data produced by this node (available to subsequent nodes)
    }>
  | {
      input?: any;
      output?: any;
    };

/**
 * Input Node Executor
 * Entry point of the workflow - passes the initial query data to subsequent nodes
 */
export const inputNodeExecutor: NodeExecutor<InputNodeData> = ({ state }) => {
  return {
    output: state.query, // Pass through the initial workflow input
  };
};

/**
 * Output Node Executor
 * Exit point of the workflow - collects data from specified source nodes
 * and combines them into the final workflow result
 */
export const outputNodeExecutor: NodeExecutor<OutputNodeData> = ({
  node,
  state,
}) => {
  const items = node.outputData.map((cur) => ({ key: cur.key, value: state.getOutput(cur.source!) }));
  if (items.length === 1) {
    // Unwrap single output to raw value to avoid { key: value } nesting
    return {
      output: items[0]?.value,
    };
  }
  return {
    output: items.reduce((acc, cur) => {
      (acc as any)[cur.key] = cur.value;
      return acc;
    }, {} as object),
  };
};

/**
 * Loop Start Node Executor (sequential v1)
 * Resolves an array source and exposes per-iteration context.
 * The actual iteration/branching is coordinated in the executor via dynamic edges.
 */
export const loopStartNodeExecutor: NodeExecutor<LoopStartNodeData> = ({ node, state }) => {
  const source = node.source;
  let list: any[] = [];
  if (source) {
    const value = state.getOutput<any>({ nodeId: source.nodeId, path: source.path });
    if (Array.isArray(value)) list = value;
    else if (value != null) list = [value];
  }

  // Determine body start targets and potential end targets
  const outgoing = (state.edges || []).filter((e) => e.source === node.id);
  const bodyTargets = outgoing
    .filter((e) => (node.endNodeId ? e.target !== node.endNodeId : true))
    .map((e) => e.target);
  const endTargets = outgoing
    .filter((e) => (node.endNodeId ? e.target === node.endNodeId : false))
    .map((e) => e.target);

  // Initialize iteration state on the start node output
  const index = 0;
  const item = list[index];

  // For sequential v1: if there are items, go into body; otherwise, go to end (if wired)
  const nextNodes = list.length > 0
    ? (bodyTargets.length > 0 ? bodyTargets : outgoing.map((e) => e.target))
    : (endTargets.length > 0 ? endTargets : outgoing.map((e) => e.target));

  return {
    output: {
      length: list.length,
      items: list,
      index,
      item,
      nextNodes,
    },
    input: {
      length: list.length,
    },
  };
};

/**
 * Loop End Node Executor
 * Aggregates collected values per iteration. In v1, downstream nodes can read loop results from this node's output.items
 */
export const loopEndNodeExecutor: NodeExecutor<LoopEndNodeData> = ({ node, state }) => {
  // Locate paired start node
  let startNodeId = node.startNodeId;
  if (!startNodeId) {
    const candidate = (state.nodes || []).find(
      (n) => n.kind === "loopStart" && (n.nodeConfig as any)?.endNodeId === node.id,
    );
    startNodeId = candidate?.id;
  }

  // Resolve current iteration context from start
  const items = startNodeId
    ? (state.getOutput<any>({ nodeId: startNodeId, path: ["items"] }) || [])
    : [];
  const length = Array.isArray(items) ? items.length : 0;
  const index = startNodeId
    ? (state.getOutput<number>({ nodeId: startNodeId, path: ["index"] }) || 0)
    : 0;

  // Identify body start targets (from start) and after-loop targets (from end)
  const outgoingFromStart = (state.edges || []).filter((e) => e.source === startNodeId);
  const bodyTargets = outgoingFromStart
    .filter((e) => e.target !== node.id)
    .map((e) => e.target);
  const afterLoopTargets = (state.edges || [])
    .filter((e) => e.source === node.id)
    .map((e) => e.target);

  // Decide next step
  const nextIndex = index + 1;
  let nextNodes: string[] = afterLoopTargets;
  if (nextIndex < length && bodyTargets.length > 0 && startNodeId) {
    // Continue next iteration: bump index and item on start node output
    state.setOutput({ nodeId: startNodeId, path: ["index"] }, nextIndex);
    state.setOutput({ nodeId: startNodeId, path: ["item"] }, items[nextIndex]);
    nextNodes = bodyTargets;
  }

  // Optional aggregation: if a collect source is configured, resolve its value
  let collected: any[] | undefined = undefined;
  if (node.collect) {
    const v = state.getOutput<any>({ nodeId: node.collect.nodeId, path: node.collect.path });
    if (Array.isArray(v)) collected = v;
  }

  return {
    output: {
      items: collected,
      nextNodes,
    },
  };
};

/**
 * LLM Node Executor
 * Executes Large Language Model interactions with support for:
 * - Multiple messages (system, user, assistant)
 * - References to previous node outputs via mentions
 * - Configurable model selection
 */
export const llmNodeExecutor: NodeExecutor<LLMNodeData> = async ({
  node,
  state,
}) => {
  const model = customModelProvider.getModel(node.model);

  // Convert TipTap JSON messages to AI SDK format, resolving mentions to actual data
  const messages: Omit<Message, "id">[] = node.messages.map((message) =>
    convertTiptapJsonToAiMessage({
      role: message.role,
      getOutput: state.getOutput, // Provides access to previous node outputs
      json: message.content,
    }),
  );

  const isTextResponse =
    node.outputSchema.properties?.answer?.type === "string";

  state.setInput(node.id, {
    chatModel: node.model,
    messages,
    responseFormat: isTextResponse ? "text" : "object",
  });

  if (isTextResponse) {
    const response = await generateText({
      model,
      messages,
      maxSteps: 1,
    });
    return {
      output: {
        totalTokens: response.usage.totalTokens,
        answer: response.text,
      },
    };
  }

  const response = await generateObject({
    model,
    messages,
    schema: jsonSchemaToZod(node.outputSchema.properties.answer),
    maxRetries: 3,
  });

  return {
    output: {
      totalTokens: response.usage.totalTokens,
      answer: response.object,
    },
  };
};

/**
 * Condition Node Executor
 * Evaluates conditional logic and determines which branch(es) to execute next.
 * Supports if-elseIf-else structure with AND/OR logical operators.
 */
export const conditionNodeExecutor: NodeExecutor<ConditionNodeData> = async ({
  node,
  state,
}) => {
  // Compute matched branch id
  const matchedBranch =
    checkConditionBranch(node.branches.if, state.getOutput)
      ? node.branches.if.id
      : ((node.branches.elseIf || []).find((b) => checkConditionBranch(b, state.getOutput)) || node.branches.else).id;

  // Determine dynamic next nodes by matching sourceHandle to branch id
  const nextNodes = (state.edges || [])
    .filter((e) => e.source === node.id && (e.uiConfig as any)?.sourceHandle === matchedBranch)
    .map((e) => e.target);

  // Record evaluation result for history/debugging
  state.setInput(node.id, {
    matchedBranch,
  });

  return {
    output: {
      branch: matchedBranch,
      nextNodes,
    },
  };
};

/**
 * Tool Node Executor
 * Executes external tools (primarily MCP tools) with optional LLM-generated parameters.
 *
 * Workflow:
 * 1. If tool has parameter schema, use LLM to generate parameters from message
 * 2. Execute the tool with generated or empty parameters
 * 3. Return the tool execution result
 */
export const toolNodeExecutor: NodeExecutor<ToolNodeData> = async ({
  node,
  state,
}) => {
  const result: {
    input: any;
    output: any;
  } = {
    input: undefined,
    output: undefined,
  };

  if (!node.tool) throw new Error("Tool not found");

  // Handle parameter generation
  if (!node.tool?.parameterSchema) {
    // Tool doesn't need parameters
    result.input = {
      parameter: undefined,
    };
  } else {
    // Fallback: Use LLM to generate tool parameters from the provided message
    const prompt: string | undefined = node.message
      ? toAny(
          convertTiptapJsonToAiMessage({
            role: "user",
            getOutput: state.getOutput, // Access to previous node outputs
            json: node.message,
          }),
        ).parts[0]?.text
      : undefined;

    const response = await generateText({
      model: customModelProvider.getModel(node.model),
      maxSteps: 1,
      toolChoice: "required", // Force the model to call the tool
      prompt,
      tools: {
        [node.tool.id]: {
          description: node.tool.description,
          parameters: jsonSchemaToZod(node.tool.parameterSchema),
        },
      },
    });

    result.input = {
      parameter: response.toolCalls.find((call) => call.args)?.args,
      prompt,
    };
    }

  // Record computed input for debugging/history
  state.setInput(node.id, result.input);
 
   // Execute the tool based on its type
  if (node.tool.type == "mcp-tool") {
    let toolResult = (await mcpClientsManager.toolCall(
      node.tool.serverId,
      node.tool.id,
      result.input.parameter,
    )) as any;

    // Fallback: resolve by serverName if id is stale or not found
    if (toolResult?.isError && /Client .* not found/i.test(toolResult?.error?.message || "")) {
      toolResult = (await mcpClientsManager.toolCallByServerName(
        node.tool.serverName,
        node.tool.id,
        result.input.parameter,
      )) as any;
    }

    if (toolResult.isError) {
      throw new Error(
        toolResult.error?.message ||
          toolResult.error?.name ||
          JSON.stringify(toolResult),
      );
    }
    result.output = {
      tool_result: toolResult,
    };
  } else if (node.tool.type == "app-tool") {
    const executor =
      node.tool.id == DefaultToolName.WebContent
        ? exaContentsToolForWorkflow.execute
        : node.tool.id == DefaultToolName.WebSearch
          ? exaSearchToolForWorkflow.execute
          : () => "Unknown tool";

    const toolResult = await executor(result.input.parameter, {
      messages: [],
      toolCallId: "",
    });
    result.output = {
      tool_result: toolResult,
    };
  } else {
    // Placeholder for future tool types
    result.output = {
      tool_result: {
        error: `Not implemented "${toAny(node.tool)?.type}"`,
      },
    };
  }

  return result;
};

/**
 * Resolves HttpValue to actual string value
 * Handles string literals and references to other node outputs
 */
function resolveHttpValue(
  value: string | OutputSchemaSourceKey | undefined,
  getOutput: WorkflowRuntimeState["getOutput"],
): string {
  if (value === undefined) return "";

  if (typeof value === "string") return value;

  // It's an OutputSchemaSourceKey - resolve from node output
  const output = getOutput(value);
  if (output === undefined || output === null) return "";

  if (typeof output === "string" || typeof output === "number") {
    return output.toString();
  }

  // For objects/arrays, stringify them
  return JSON.stringify(output);
}

/**
 * HTTP Node Executor
 * Performs HTTP requests to external services with configurable parameters.
 *
 * Features:
 * - Support for all standard HTTP methods (GET, POST, PUT, DELETE, PATCH, HEAD)
 * - Dynamic URL, headers, query parameters, and body with variable substitution
 * - Configurable timeout
 * - Comprehensive response data including status, headers, and body
 */
export const httpNodeExecutor: NodeExecutor<HttpNodeData> = async ({
  node,
  state,
}) => {
  // Default timeout of 30 seconds
  const timeout = node.timeout || 30000;

  // Resolve URL with variable substitution
  const url = resolveHttpValue(node.url, state.getOutput);

  if (!url) {
    throw new Error("HTTP node requires a URL");
  }

  // Build query parameters
  const searchParams = new URLSearchParams();
  for (const queryParam of node.query || []) {
    if (queryParam.key && queryParam.value !== undefined) {
      const value = resolveHttpValue(queryParam.value, state.getOutput);
      if (value) {
        searchParams.append(queryParam.key, value);
      }
    }
  }

  // Construct final URL with query parameters
  const finalUrl = searchParams.toString()
    ? `${url}${url.includes("?") ? "&" : "?"}${searchParams.toString()}`
    : url;

  // Build headers
  const headers: Record<string, string> = {};
  for (const header of node.headers || []) {
    if (header.key && header.value !== undefined) {
      const value = resolveHttpValue(header.value, state.getOutput);
      if (value) {
        headers[header.key] = value;
      }
    }
  }

  // Build request body
  let body: string | undefined;
  if (node.body && ["POST", "PUT", "PATCH"].includes(node.method)) {
    body = resolveHttpValue(node.body, state.getOutput);

    // Set default content-type if not specified and body is present
    if (body && !headers["Content-Type"] && !headers["content-type"]) {
      // Try to detect JSON format
      try {
        JSON.parse(body);
        headers["Content-Type"] = "application/json";
      } catch {
        headers["Content-Type"] = "text/plain";
      }
    }
  }

  const startTime = Date.now();

  try {
    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(finalUrl, {
      method: node.method,
      headers,
      body,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Parse response body as string
    let responseBody: string;
    try {
      responseBody = await response.text();
    } catch {
      // If parsing fails, return empty string
      responseBody = "";
    }

    // Convert response headers to object
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    const duration = Date.now() - startTime;

    const request = {
      url: finalUrl,
      method: node.method,
      headers,
      body,
      timeout,
    };
    const responseData = {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers: responseHeaders,
      body: responseBody,
      duration,
      size: response.headers.get("content-length")
        ? parseInt(response.headers.get("content-length")!)
        : undefined,
    };
    if (!response.ok) {
      state.setInput(node.id, {
        request,
        response: responseData,
      });
      throw new AppError(response.status.toString(), response.statusText);
    }

    return {
      input: {
        request,
      },
      output: {
        response: responseData,
      },
    };
  } catch (error: any) {
    if (error instanceof AppError) {
      throw error;
    }
    const duration = Date.now() - startTime;

    // Handle different types of errors
    let errorMessage = error.message;
    let errorType = "unknown";

    if (error.name === "AbortError") {
      errorMessage = `Request timeout after ${timeout}ms`;
      errorType = "timeout";
    } else if (error.code === "ENOTFOUND") {
      errorMessage = `DNS resolution failed for ${finalUrl}`;
      errorType = "dns";
    } else if (error.code === "ECONNREFUSED") {
      errorMessage = `Connection refused to ${finalUrl}`;
      errorType = "connection";
    }
    state.setInput(node.id, {
      request: { url: finalUrl, method: node.method, headers, body, timeout },
      response: {
        status: 0,
        statusText: errorMessage,
        ok: false,
        headers: {},
        body: "",
        duration,
        error: {
          type: errorType,
          message: errorMessage,
        },
      },
    });
    throw error;
  }
};

/**
 * Template Node Executor
 * Processes text templates with variable substitution using TipTap content.
 *
 * Features:
 * - Variable substitution from previous node outputs
 * - Support for mentions in template content
 * - Simple text output for easy consumption by other nodes
 */
export const templateNodeExecutor: NodeExecutor<TemplateNodeData> = ({
  node,
  state,
}) => {
  let text: string = "";
  // Convert TipTap template content to text with variable substitution
  if (node.template && (node as any).template?.type == "tiptap") {
    text = convertTiptapJsonToText({
      getOutput: state.getOutput, // Access to previous node outputs for variable substitution
      json: (node as any).template.tiptap,
    });
  }
  return {
    output: {
      template: text,
    },
  };
};

export const codeNodeExecutor: NodeExecutor<CodeNodeData> = async ({
  node,
  state,
}) => {
  // Resolve params TipTap content into text then JSON if possible
  let params: any = undefined;
  if (node.params) {
    const text = convertTiptapJsonToText({
      getOutput: state.getOutput,
      json: node.params,
    });
    try {
      params = JSON.parse(text);
    } catch {
      params = text;
    }
  }

  // Normalize: trim whitespace from all string params
  params = deepTrimStrings(params);

  const timeout = node.timeout || 30000;

  // Execute code based on language
  let result: any = undefined;
  let logs: any[] = [];
  let success = false;
  let executionTimeMs: number | undefined = undefined;
  if (node.language === "python") {
    const prelude = `# 'params' is injected below as a dict\n`;
    const code = prelude + node.code;
    const run = await runPythonServer({ code, timeout, params, onLog: (entry) => logs.push(entry) });
    logs = run.logs;
    executionTimeMs = run.executionTimeMs;
    success = run.success;
    result = run.result;
  } else {
    const prelude = `// Params are available in a constant named params\nconst params = ${JSON.stringify(
      params ?? {},
    )};\n`;
    const code = prelude + node.code;
    const run = await safeJsRun({ code, timeout });
    logs = run.logs;
    executionTimeMs = run.executionTimeMs;
    success = run.success;
    result = run.result;
  }

  // Optional CSV export if the result is array of objects
  let csv: string | undefined = undefined;
  if (node.exportCsv && Array.isArray(result) && result.length > 0) {
    const headers = Array.from(
      result.reduce((set: Set<string>, row: any) => {
        Object.keys(row || {}).forEach((k) => set.add(k));
        return set;
      }, new Set<string>()),
    );
    const lines = [headers.join(",")];
    for (const row of result) {
      const line = headers
        .map((h) => {
          const v = row?.[h];
          const s = v === null || v === undefined ? "" : String(v);
          const needsQuote = /[",\n]/.test(s);
          return needsQuote ? `"${s.replace(/"/g, '""')}` + `"` : s;
        })
        .join(",");
      lines.push(line);
    }
    csv = lines.join("\n");
  }

  state.setInput(node.id, { code: node.code, params });
  return {
    output: {
      result,
      csv,
      logs,
      success,
      executionTimeMs,
    },
  };
};
