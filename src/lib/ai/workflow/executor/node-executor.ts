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
  LoopNodeData,
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
import { AppDefaultToolkit } from "lib/ai/tools";
import { APP_DEFAULT_TOOL_KIT } from "lib/ai/tools/tool-kit";
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
  const forceTempOne = node.model?.provider === "openai" && node.model?.model === "gpt-5";

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
      ...(forceTempOne ? { temperature: 1 } : {}),
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
    ...(forceTempOne ? { temperature: 1 } : {}),
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
  // Record evaluation result for history/debugging
  state.setInput(node.id, {
    matchedBranch:
      checkConditionBranch(node.branches.if, state.getOutput)
        ? node.branches.if.id
        : ((node.branches.elseIf || []).find((b) => checkConditionBranch(b, state.getOutput)) || node.branches.else).id,
  });

  // The dynamic edge resolution in workflow-executor will route based on branch id handles
  return {
    output: {
      // Keep branch for UI/debug information
      branch: (() => {
        const matched = checkConditionBranch(node.branches.if, state.getOutput)
          ? node.branches.if.id
          : ((node.branches.elseIf || []).find((b) => checkConditionBranch(b, state.getOutput)) || node.branches.else).id;
        return matched;
      })(),
      // Provide explicit routing targets for dynamic edges
      nextNodes: (() => {
        const matched = checkConditionBranch(node.branches.if, state.getOutput)
          ? node.branches.if.id
          : ((node.branches.elseIf || []).find((b) => checkConditionBranch(b, state.getOutput)) || node.branches.else).id;
        const edges = state.edges || [];
        const targets = edges
          .filter((e) => e.source === node.id && (e.uiConfig?.sourceHandle ?? "right") === matched)
          .map((e) => e.target);
        return targets;
      })(),
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

  // If rawArgs is provided and non-empty, resolve mentions and parse JSON directly
  if (node.rawArgs) {
    // Build two variants to support both syntaxes:
    // 1) Mentions placed inside quoted JSON strings → escape only (no surrounding quotes)
    // 2) Mentions used as raw JSON values → full JSON.stringify including quotes for strings
    const renderArgsText = (mode: "escape-only" | "json-value") =>
      convertTiptapJsonToText({
        getOutput: state.getOutput,
        json: node.rawArgs!,
        mentionParser: (part) => {
          try {
            const key = JSON.parse(part.attrs.label);
            const mentionItem = state.getOutput(key);
            if (typeof mentionItem === "string") {
              // Escape control characters safely; optionally include quotes
              const s = JSON.stringify(mentionItem);
              return mode === "escape-only" ? s.slice(1, -1) : s;
            }
            // For non-strings, always inject as JSON value
            return JSON.stringify(mentionItem);
          } catch {
            return "";
          }
        },
      }).trim();

    const candidates = [renderArgsText("escape-only"), renderArgsText("json-value")].filter((t) => t.length > 0);

    // Helper repairs for common JSON authoring issues in rich text
    const replaceSmartQuotes = (s: string) => s.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
    const normalizeInvisibleSpaces = (s: string) =>
      s
        .replace(/[\u00A0]/g, " ") // NBSP → space
        .replace(/[\u200B-\u200D]/g, "") // zero-width spaces
        .replace(/\uFEFF/g, ""); // BOM
    const escapeLineSeparatorsInQuotedStrings = (s: string) => {
      // Escape U+2028 and U+2029 when inside strings
      let out = "";
      let inString = false;
      let escape = false;
      let quote: string | null = null;
      for (let i = 0; i < s.length; i++) {
        const ch = s[i]!;
        if (!inString) {
          if (ch === '"' || ch === "'") {
            inString = true;
            quote = ch;
            out += ch;
          } else {
            out += ch;
          }
          continue;
        }
        if (escape) {
          out += ch;
          escape = false;
          continue;
        }
        if (ch === "\\") {
          out += ch;
          escape = true;
          continue;
        }
        if (ch === "\u2028") {
          out += "\\u2028";
          continue;
        }
        if (ch === "\u2029") {
          out += "\\u2029";
          continue;
        }
        if (quote && ch === quote) {
          inString = false;
          quote = null;
          out += ch;
          continue;
        }
        out += ch;
      }
      return out;
    };
    const escapeNewlinesInQuotedStrings = (s: string) => {
      let out = "";
      let inString = false;
      let escape = false;
      let quote: string | null = null;
      for (let i = 0; i < s.length; i++) {
        const ch = s[i]!;
        if (!inString) {
          if (ch === '"' || ch === "'") {
            inString = true;
            quote = ch;
            out += ch;
          } else {
            out += ch;
          }
          continue;
        }
        if (escape) {
          out += ch;
          escape = false;
          continue;
        }
        if (ch === "\\") {
          out += ch;
          escape = true;
          continue;
        }
        if (ch === "\n") {
          out += "\\n";
          continue;
        }
        if (ch === "\r") {
          out += "\\r";
          continue;
        }
        if (quote && ch === quote) {
          inString = false;
          quote = null;
          out += ch;
          continue;
        }
        out += ch;
      }
      return out;
    };
    const removeTrailingCommas = (s: string) => s.replace(/,(\s*[}[\]])/g, "$1");

    let parsedOk = false;
    for (const txt of candidates) {
      try {
        const parsed = JSON.parse(txt);
        result.input = { parameter: parsed, via: "raw" };
        parsedOk = true;
        break;
      } catch {
        // try repaired parsing: smart quotes → escaped newlines (in strings) → no trailing commas
        try {
          const repaired = removeTrailingCommas(
            escapeLineSeparatorsInQuotedStrings(
              escapeNewlinesInQuotedStrings(
                replaceSmartQuotes(normalizeInvisibleSpaces(txt)),
              ),
            ),
          );
          const parsed = JSON.parse(repaired);
          result.input = { parameter: parsed, via: "raw-repaired" };
          parsedOk = true;
          break;
        } catch {
          // try next strategy
        }
      }
    }
    if (!parsedOk && candidates.length > 0) {
      try {
        // Throw the last error context for better message
        JSON.parse(candidates[candidates.length - 1]!);
      } catch (e: any) {
        throw new Error(`Invalid rawArgs JSON: ${e?.message || "parse error"}`);
      }
    }
  }

  if (result.input === undefined) {
    if (!node.tool?.parameterSchema) {
      // Tool doesn't need parameters
      result.input = {
        parameter: undefined,
      };
    } else {
      // Fallback: Use LLM to generate tool parameters from the provided message
      // Build prompt from the immediate user message only (ignore attachments/previous files for variable extraction)
      const prompt: string | undefined = node.message
        ? (() => {
            const msg = toAny(
              convertTiptapJsonToAiMessage({
                role: "user",
                getOutput: state.getOutput,
                json: node.message,
              }),
            );
            const text = msg?.parts?.find((p: any) => p?.type === "text")?.text || msg?.parts?.[0]?.text;
            return typeof text === "string" ? text : undefined;
          })()
        : undefined;

      // Add light guidance to improve parameter grounding (e.g., derive client_name from provided URL domain)
      const hasClientNameField = !!(toAny(node.tool.parameterSchema)?.properties?.client_name);
      const guidance = hasClientNameField
        ? "When generating tool parameters, if the user provided a URL, derive 'client_name' from that URL's domain (e.g., https://example.com -> example.com). Do not invent a different brand. Prefer the most recent URL in the user input."
        : undefined;

      const response = await generateText({
        model: customModelProvider.getModel(node.model),
        maxSteps: 1,
        toolChoice: "required", // Force the model to call the tool
        prompt: (() => {
          const hygiene = "Use only the user's latest prompt text to fill parameters. Treat attachments as supporting context, never as the source of parameter values. If prompt and other context disagree, prefer the prompt.";
          const guidancePrefix = guidance ? `${guidance}\n` : "";
          return `${guidancePrefix}${hygiene}\n\n${prompt || ""}`.trim();
        })(),
        tools: {
          [node.tool.id]: {
            description: node.tool.description,
            parameters: jsonSchemaToZod(node.tool.parameterSchema),
          },
        },
        ...((node.model?.provider === "openai" && node.model?.model === "gpt-5") ? { temperature: 1 } : {}),
      });

      // Prefer prompt-derived variables over anything else (e.g., attachment hints)
      const pickLastUrlDomain = (text?: string): string | undefined => {
        if (!text) return undefined;
        const urlRegex = /https?:\/\/[^\s)]+/gi;
        const matches = text.match(urlRegex) || [];
        if (matches.length === 0) return undefined;
        try {
          const last = matches[matches.length - 1]!;
          const u = new URL(last);
          const host = u.hostname.replace(/^www\./i, "");
          return host;
        } catch {
          return undefined;
        }
      };
      const toolCall = response.toolCalls.find((call) => call.args);
      const argsFromModel = (toolCall?.args ?? {}) as Record<string, any>;
      if (hasClientNameField) {
        const domain = pickLastUrlDomain(prompt);
        if (domain) {
          argsFromModel.client_name = domain;
        }
      }

      result.input = {
        parameter: argsFromModel,
        prompt,
      };
    }
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

    return {
      output: { tool_result: toolResult },
    };
  }

  // Default app tools path
  const appTool = APP_DEFAULT_TOOL_KIT[AppDefaultToolkit.WebSearch]?.[node.tool.id] ||
    APP_DEFAULT_TOOL_KIT[AppDefaultToolkit.Code]?.[node.tool.id] ||
    APP_DEFAULT_TOOL_KIT[AppDefaultToolkit.Http]?.[node.tool.id] ||
    APP_DEFAULT_TOOL_KIT[AppDefaultToolkit.Visualization]?.[node.tool.id];
  if (!appTool) throw new Error(`Tool not found: ${node.tool.id}`);

  const exec = (appTool as any).execute as
    | ((args: any, ctx: { toolCallId: string; abortSignal: AbortSignal; messages: any[] }) => Promise<any>)
    | undefined;
  if (typeof exec !== "function") {
    throw new Error(`Tool '${node.tool.id}' is not executable`);
  }

  const res = await exec(result.input.parameter as any, {
    toolCallId: `${node.id}:${Date.now()}`,
    abortSignal: new AbortController().signal,
    messages: [],
  });
  return { output: { tool_result: res } };
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
  if (node.template.type == "tiptap") {
    text = convertTiptapJsonToText({
      getOutput: state.getOutput, // Access to previous node outputs for variable substitution
      json: node.template.tiptap,
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

/**
 * Loop Node Executor (robust v2)
 * Behavior:
 * - Determines array to iterate from configured source, or auto-detects upstream array
 * - Decides body entry (all non-LoopEnd targets) and paired LoopEnd (targets that are LoopEnd)
 * - Initializes iteration state on Loop node output, and routes into body if items exist, otherwise to end
 */
export const loopNodeExecutor: NodeExecutor<LoopNodeData> = ({ node, state }) => {
  let items: any[] = [];
  if (node.source) {
    const v = state.getOutput<any>({ nodeId: node.source.nodeId, path: node.source.path });
    if (Array.isArray(v)) items = v; else if (v != null) items = [v];
  } else {
    const incoming = (state.edges || []).filter((e) => e.target === node.id);
    const prevId = incoming[0]?.source;
    if (prevId) {
      const v = state.getOutput<any>({ nodeId: prevId, path: [] });
      if (Array.isArray(v)) items = v; else if (v && typeof v === "object") {
        const firstArray = Object.values(v).find((x) => Array.isArray(x));
        if (firstArray) items = firstArray as any[];
      }
    }
  }
  // Enforce hard cap if provided
  const maxRuns = Number.isFinite(node.maxRuns as any) && (node.maxRuns as any) > 0 ? Math.floor(node.maxRuns as any) : undefined;
  if (maxRuns !== undefined) items = items.slice(0, maxRuns);

  const outgoing = (state.edges || []).filter((e) => e.source === node.id);
  const nodesById = new Map((state.nodes || []).map((n) => [n.id, n]));
  const endTargets = outgoing.filter((e) => nodesById.get(e.target)?.kind === "loopEnd").map((e) => e.target);
  const bodyTargets = outgoing.filter((e) => nodesById.get(e.target)?.kind !== "loopEnd").map((e) => e.target);
  const index = 0;
  const nextNodes: string[] = items.length > 0 && bodyTargets.length > 0 ? bodyTargets : (endTargets.length > 0 ? endTargets : []);
  return { output: { items, index, item: items[0], acc: [], nextNodes } };
};

/**
 * LoopEnd Node Executor (robust v2)
 * Behavior:
 * - Finds paired Loop node (prefer direct Loop->LoopEnd edge)
 * - If more iterations remain, increments index on Loop output and routes back to body entry
 * - Otherwise routes beyond LoopEnd to its static outgoing edges
 * - Optional collect: if configured and resolves to array, expose as output.items
 */
export const loopEndNodeExecutor: NodeExecutor<LoopEndNodeData> = ({ node, state }) => {
  const nodes = state.nodes || []; const edges = state.edges || [];
  const nodesById = new Map(nodes.map((n) => [n.id, n]));
  const directLoop = edges.find((e) => e.target === node.id && nodesById.get(e.source)?.kind === "loop");
  const loopId = (node.startNodeId && nodesById.get(node.startNodeId)?.kind === "loop") ? node.startNodeId : (directLoop?.source);
  const bodyTargets = loopId ? edges.filter((e) => e.source === loopId && nodesById.get(e.target)?.kind !== "loopEnd").map((e) => e.target) : [];
  const afterLoopTargets = edges.filter((e) => e.source === node.id).map((e) => e.target);
  const items = loopId ? (state.getOutput<any[]>({ nodeId: loopId, path: ["items"] }) || []) : [];
  const length = items.length;
  const index = loopId ? (state.getOutput<number>({ nodeId: loopId, path: ["index"] }) || 0) : 0;

  // Determine value to accumulate for this iteration
  let valueToCollect: any = undefined;
  if (node.collect) {
    valueToCollect = state.getOutput<any>({ nodeId: node.collect.nodeId, path: node.collect.path });
  } else if (loopId) {
    valueToCollect = state.getOutput<any>({ nodeId: loopId, path: ["item"] });
  }

  if (loopId !== undefined) {
    const acc: any[] = state.getOutput<any[]>({ nodeId: loopId, path: ["acc"] }) || [];
    if (valueToCollect !== undefined) acc.push(valueToCollect);
    state.setOutput({ nodeId: loopId, path: ["acc"] }, acc);
  }

  const nextIndex = index + 1;
  let nextNodes: string[] = afterLoopTargets;
  if (loopId && nextIndex < length && bodyTargets.length > 0) {
    state.setOutput({ nodeId: loopId, path: ["index"] }, nextIndex);
    state.setOutput({ nodeId: loopId, path: ["item"] }, items[nextIndex]);
    nextNodes = bodyTargets;
    return { output: { nextNodes } };
  }

  // Finalize: emit collected array at loop end
  let collected: any[] | undefined = undefined;
  if (loopId) {
    collected = state.getOutput<any[]>({ nodeId: loopId, path: ["acc"] }) || [];
  }
  return { output: { items: collected, nextNodes } };
};
