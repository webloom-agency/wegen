import {
  appendResponseMessages,
  createDataStreamResponse,
  smoothStream,
  streamText,
  type UIMessage,
  formatDataStreamPart,
  appendClientMessage,
  Message,
} from "ai";

import { customModelProvider, isToolCallUnsupportedModel } from "lib/ai/models";

import { mcpClientsManager } from "lib/ai/mcp/mcp-manager";

import { agentRepository, chatRepository, workflowRepository } from "lib/db/repository";
import type { AllowedMCPServer } from "app-types/mcp";
import globalLogger from "logger";
import {
  buildMcpServerCustomizationsSystemPrompt,
  buildUserSystemPrompt,
  buildToolCallUnsupportedModelSystemPrompt,
  buildThinkingSystemPrompt,
} from "lib/ai/prompts";
import { chatApiSchemaRequestBodySchema } from "app-types/chat";

import { errorIf, safe } from "ts-safe";

import {
  appendAnnotations,
  excludeToolExecution,
  handleError,
  manualToolExecuteByLastMessage,
  mergeSystemPrompt,
  convertToMessage,
  extractInProgressToolPart,
  assignToolResult,
  filterMcpServerCustomizations,
  loadMcpTools,
  loadWorkFlowTools,
  loadAppDefaultTools,
} from "./shared.chat";
import {
  rememberAgentAction,
  rememberMcpServerCustomizationsAction,
} from "./actions";
import { getSession } from "auth/server";
import { colorize } from "consola/utils";
import { isVercelAIWorkflowTool } from "app-types/workflow";
import { SequentialThinkingToolName } from "lib/ai/tools";
import { sequentialThinkingTool } from "lib/ai/tools/thinking/sequential-thinking";
import { compressPdfAttachmentsIfNeeded } from "lib/pdf/compress";

const logger = globalLogger.withDefaults({
  message: colorize("blackBright", `Chat API: `),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();

    const session = await getSession();

    if (!session?.user.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    const {
      id,
      message,
      chatModel,
      toolChoice,
      allowedAppDefaultToolkit,
      allowedMcpServers,
      thinking,
      mentions = [],
    } = chatApiSchemaRequestBodySchema.parse(json);

    // Compress large PDF attachments server-side (data URLs)
    const patchedMessage: UIMessage = await safe()
      .map(async () => {
        const atts = (message as any)?.experimental_attachments as any[] | undefined;
        if (Array.isArray(atts) && atts.length > 0) {
          const compressed = await compressPdfAttachmentsIfNeeded(atts as any);
          return { ...(message as any), experimental_attachments: compressed } as UIMessage;
        }
        return message as UIMessage;
      })
      .orElse(message as UIMessage);

    const model = customModelProvider.getModel(chatModel);

    let thread = await chatRepository.selectThreadDetails(id);

    if (!thread) {
      logger.info(`create chat thread: ${id}`);
      const newThread = await chatRepository.insertThread({
        id,
        title: "",
        userId: session.user.id,
      });
      thread = await chatRepository.selectThreadDetails(newThread.id);
    }

    if (thread!.userId !== session.user.id) {
      return new Response("Forbidden", { status: 403 });
    }

    // if is false, it means the last message is manual tool execution
    const isLastMessageUserMessage = message.role == "user";

    // Load agent and merge its attachments into the user message for richer context
    const agentId = mentions.find((m) => m.type === "agent")?.agentId;
    const agent = await rememberAgentAction(agentId, session.user.id);

    const agentAttachments = (agent?.instructions as any)?.attachments as any[] | undefined;
    const mergedAttachments = Array.isArray(agentAttachments)
      ? [
          ...(((patchedMessage as any).experimental_attachments as any[]) || []),
          ...agentAttachments,
        ]
      : ((patchedMessage as any).experimental_attachments as any[] | undefined);

    let finalPatchedMessage: UIMessage = mergedAttachments && mergedAttachments.length > 0
      ? {
          ...(patchedMessage as any),
          experimental_attachments: await compressPdfAttachmentsIfNeeded(mergedAttachments as any),
        }
      : patchedMessage;

    // Auto-detect mentions (agents/workflows) from user text when not explicitly tagged
    let autoDetectedAgent: any | undefined;
    try {
      const getNormalized = (s: string) =>
        s
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9\s]/g, " ")
          .replace(/\s+/g, " ")
          .trim();

      const extractUserText = (msg: UIMessage): string => {
        const parts = (msg as any)?.parts as any[] | undefined;
        if (Array.isArray(parts) && parts.length > 0) {
          return parts
            .map((p) => (typeof (p as any)?.text === "string" ? (p as any).text : ""))
            .filter(Boolean)
            .join(" ");
        }
        const content = (msg as any)?.content;
        return typeof content === "string" ? content : "";
      };

      const userTextRaw = extractUserText(finalPatchedMessage);
      const userText = getNormalized(userTextRaw);

      if (userText && userText.length >= 3) {
        const existingWorkflowIds = new Set(
          mentions
            .filter((m: any) => m.type === "workflow")
            .map((m: any) => m.workflowId),
        );
        const existingAgentIds = new Set(
          mentions
            .filter((m: any) => m.type === "agent")
            .map((m: any) => m.agentId),
        );

        const containsCandidate = (name: string) => {
          const n = getNormalized(name);
          if (!n) return false;
          if (userText.includes(n)) return true;
          // token-wise containment (near-exact)
          const tokens = n.split(" ").filter(Boolean);
          if (tokens.length >= 2 && tokens.every((t) => userText.includes(t))) {
            return true;
          }
          // space-insensitive containment
          const noSpaceMsg = userText.replace(/\s+/g, "");
          const noSpaceName = n.replace(/\s+/g, "");
          return noSpaceMsg.includes(noSpaceName);
        };

        const STOPWORDS = new Set<string>([
          // EN
          "the","a","an","and","or","of","for","to","in","on","with","by","at","from","as","is","are","be","this","that","it",
          // FR
          "le","la","les","un","une","des","et","ou","de","du","des","pour","dans","sur","avec","par","au","aux","est","ce","cet","cette","ces"
        ]);
        const tokenize = (s: string) => getNormalized(s).split(" ").filter(Boolean);
        const bigramSim = (a: string, b: string) => {
          const A = a.replace(/\s+/g, "");
          const B = b.replace(/\s+/g, "");
          let c = 0;
          for (let i = 0; i < A.length - 1; i++) {
            const bg = A.slice(i, i + 2);
            if (B.includes(bg)) c++;
          }
          return c;
        };

        // Fetch visible workflows and agents
        const [wfList, agentList] = await Promise.all([
          workflowRepository.selectExecuteAbility(session.user.id),
          agentRepository.selectAgents(session.user.id, ["all"], 100),
        ]);

        // Build token frequency maps for uniqueness checks (workflows & agents)
        const wfTokenCounts = (() => {
          const map = new Map<string, number>();
          for (const wf of wfList || []) {
            const tokens = tokenize((wf as any).name).filter((t) => !STOPWORDS.has(t));
            for (const t of tokens) map.set(t, (map.get(t) || 0) + 1);
          }
          return map;
        })();
        const agentTokenCounts = (() => {
          const map = new Map<string, number>();
          for (const a of agentList || []) {
            const tokens = tokenize((a as any).name).filter((t) => !STOPWORDS.has(t));
            for (const t of tokens) map.set(t, (map.get(t) || 0) + 1);
          }
          return map;
        })();

        // Detect workflows by name
        for (const wf of wfList || []) {
          if (existingWorkflowIds.has((wf as any).id)) continue;
          const wfName = (wf as any).name as string;
          const n = getNormalized(wfName);
          if (containsCandidate(wfName)) {
            mentions.push({
              type: "workflow",
              name: wfName,
              description: (wf as any).description ?? null,
              workflowId: (wf as any).id,
              icon: (wf as any).icon ?? null,
            } as any);
            existingWorkflowIds.add((wf as any).id);
            // no-op: we no longer force workflows; keep detection only
            continue;
          }
          // relaxed matching: one significant token with some uniqueness or similarity
          const tokens = tokenize(wfName).filter((t) => !STOPWORDS.has(t));
          const matched = tokens.filter((t) => userText.includes(t));
          if (matched.length > 0) {
            const hasUnique = matched.some((t) => (wfTokenCounts.get(t) || 0) === 1);
            const sim = bigramSim(n, userText);
            let score = matched.length * 30 + (hasUnique ? 20 : 0) + Math.min(sim, 10);
            if (tokens.length === 1 && matched.length === 1) score += 10;
            if (score >= 30) {
              mentions.push({
                type: "workflow",
                name: wfName,
                description: (wf as any).description ?? null,
                workflowId: (wf as any).id,
                icon: (wf as any).icon ?? null,
              } as any);
              existingWorkflowIds.add((wf as any).id);
            }
          }
        }

        // Detect agents by name
        for (const a of agentList || []) {
          if (existingAgentIds.has((a as any).id)) continue;
          if (containsCandidate((a as any).name)) {
            mentions.push({
              type: "agent",
              name: (a as any).name,
              description: (a as any).description ?? null,
              agentId: (a as any).id,
              icon: (a as any).icon ?? null,
            } as any);
            existingAgentIds.add((a as any).id);
            if (!autoDetectedAgent) {
              autoDetectedAgent = a as any;
            }
            continue;
          }
          // relaxed agent matching
          const aName = (a as any).name as string;
          const aNorm = getNormalized(aName);
          const tokens = tokenize(aName).filter((t) => !STOPWORDS.has(t));
          const matched = tokens.filter((t) => userText.includes(t));
          if (matched.length > 0) {
            const hasUnique = matched.some((t) => (agentTokenCounts.get(t) || 0) === 1);
            const sim = bigramSim(aNorm, userText);
            let score = matched.length * 25 + (hasUnique ? 15 : 0) + Math.min(sim, 8);
            if (tokens.length === 1 && matched.length === 1) score += 10;
            if (score >= 30) {
              mentions.push({
                type: "agent",
                name: (a as any).name,
                description: (a as any).description ?? null,
                agentId: (a as any).id,
                icon: (a as any).icon ?? null,
              } as any);
              existingAgentIds.add((a as any).id);
              if (!autoDetectedAgent) {
                autoDetectedAgent = a as any;
              }
            }
          }
        }
      }
    } catch (e) {
      // ignore detection errors; proceed without auto-mentions
    }

    // If no agent was initially selected but one was auto-detected, load it and merge attachments
    if (!agent && autoDetectedAgent?.id) {
      const detectedAgent = await rememberAgentAction(autoDetectedAgent.id, session.user.id);
      if (detectedAgent) {
        const detAgentAtts = (detectedAgent.instructions as any)?.attachments as any[] | undefined;
        const merged = Array.isArray(detAgentAtts)
          ? [
              ...(((patchedMessage as any).experimental_attachments as any[]) || []),
              ...detAgentAtts,
            ]
          : ((patchedMessage as any).experimental_attachments as any[] | undefined);
        finalPatchedMessage = merged && merged.length > 0
          ? {
              ...(patchedMessage as any),
              experimental_attachments: await compressPdfAttachmentsIfNeeded(merged as any),
            }
          : patchedMessage;
      }
    }

    const previousMessages = (thread?.messages ?? []).map(convertToMessage);

    const messages: Message[] = isLastMessageUserMessage
      ? appendClientMessage({
          messages: previousMessages,
          message: finalPatchedMessage,
        })
      : previousMessages;

    const inProgressToolStep = extractInProgressToolPart(messages.slice(-2));

    const supportToolCall = !isToolCallUnsupportedModel(model);

    // agent already loaded above

    // Capture client-provided mentions before augmenting with agent mentions
    const clientMentions = [...mentions];

    if (agent?.instructions?.mentions) {
      mentions.push(...agent.instructions.mentions);
    }
    const mentionedAgentIds = mentions
      .filter((m) => m.type === "agent")
      .map((m: any) => m.agentId)
      .filter(Boolean);

    // Allow tool calls when:
    // - tools are supported by the model, AND
    // - tool mode isn't "none" OR there are explicit mentions of MCP/default tools/workflows.
    // Note: agent mentions alone should NOT block tool usage when toolChoice is "auto"/"manual".
    const hasToolRelevantMentions = (mentions || []).some((m: any) =>
      ["mcpTool", "mcpServer", "defaultTool", "workflow"].includes(m?.type),
    );
    const isToolCallAllowed =
      supportToolCall && (toolChoice != "none" || hasToolRelevantMentions);

    // Persist the user's message immediately so unfinished chats are saved
    if (isLastMessageUserMessage) {
      try {
        await chatRepository.upsertMessage({
          threadId: thread!.id,
          model: chatModel?.model ?? null,
          role: "user",
          parts: finalPatchedMessage.parts as any,
          attachments: (finalPatchedMessage as any).experimental_attachments,
          id: message.id,
          // Save agent annotations now; usage tokens will be appended on finish
          annotations: appendAnnotations(
            message.annotations,
            [...mentionedAgentIds.map((id) => ({ agentId: id }))],
          ),
        });
      } catch (e) {
        logger.warn("Failed to upsert user message pre-stream", e as any);
      }
    }

    return createDataStreamResponse({
      execute: async (dataStream) => {
        const mcpClients = await mcpClientsManager.getClients();
        const mcpTools = await mcpClientsManager.tools();
        logger.info(
          `mcp-server count: ${mcpClients.length}, mcp-tools count :${Object.keys(mcpTools).length}`,
        );

        // Determine workflow mentions and selection (at most one per turn)
        // Only consider client-provided workflow mentions for forcing workflows.
        const explicitClientWorkflowMentions = (clientMentions || []).filter(
          (m: any) => m.type === "workflow",
        );
        const selectedWorkflowMentions = (explicitClientWorkflowMentions || []).slice(0, 1);
        // Do not force workflows only; allow combining workflows with MCP/default tools
        const forceWorkflowOnly = false;

        // Load tools (optionally restricted to explicitly mentioned workflows)
        let MCP_TOOLS: Record<string, any> = {};
        let WORKFLOW_TOOLS: Record<string, any> = {};
        let APP_DEFAULT_TOOLS: Record<string, any> = {};

        if (isToolCallAllowed) {
          MCP_TOOLS = await safe()
            .map(errorIf(() => !isToolCallAllowed && "Not allowed"))
            .map(() =>
              loadMcpTools({
                // Only use client mentions to restrict MCP tools
                mentions: clientMentions as any,
                allowedMcpServers,
              }),
            )
            .orElse({});

          // Load workflows (restrict to selected workflow mentions when present)
          const wfMentionsForLoad = selectedWorkflowMentions.length > 0 ? selectedWorkflowMentions : mentions;
          WORKFLOW_TOOLS = await safe()
            .map(errorIf(() => !isToolCallAllowed && "Not allowed"))
            .map(() =>
              loadWorkFlowTools({
                mentions: wfMentionsForLoad as any,
                dataStream,
              }),
            )
            .orElse({});

          APP_DEFAULT_TOOLS = await safe()
            .map(errorIf(() => !isToolCallAllowed && "Not allowed"))
            .map(() =>
              loadAppDefaultTools({
                // Only use client mentions to restrict default tools
                mentions: clientMentions as any,
                allowedAppDefaultToolkit,
              }),
            )
            .orElse({});
        }

        if (inProgressToolStep) {
          const toolResult = await manualToolExecuteByLastMessage(
            inProgressToolStep,
            patchedMessage,
            { ...MCP_TOOLS, ...WORKFLOW_TOOLS, ...APP_DEFAULT_TOOLS },
            request.signal,
          );
          assignToolResult(inProgressToolStep, toolResult);
          dataStream.write(
            formatDataStreamPart("tool_result", {
              toolCallId: inProgressToolStep.toolInvocation.toolCallId,
              result: toolResult,
            }),
          );
        }

        const userPreferences = thread?.userPreferences || undefined;

        const mcpServerCustomizations = await safe()
          .map(() => {
            if (Object.keys(MCP_TOOLS ?? {}).length === 0)
              throw new Error("No tools found");
            return rememberMcpServerCustomizationsAction(session.user.id);
          })
          .map((v) => filterMcpServerCustomizations(MCP_TOOLS!, v))
          .orElse({});

        // Build workflow mentions from both client-provided and auto-detected (non-exclusive)
        const clientWorkflowMentions = (clientMentions || []).filter(
          (m: any) => m.type === "workflow",
        ) as any[];
        const autoWorkflowMentions = (mentions || []).filter(
          (m: any) => m.type === "workflow",
        ) as any[];
        const allWorkflowMentions = (() => {
          const ids = new Set<string>();
          const list: any[] = [];
          for (const m of [...clientWorkflowMentions, ...autoWorkflowMentions]) {
            const id = (m as any)?.workflowId ?? (m as any)?.name;
            if (!id || ids.has(id)) continue;
            ids.add(id);
            list.push(m);
          }
          return list;
        })();
        const forcedWorkflowHint = (allWorkflowMentions.length > 0)
          ? (() => {
              const items = allWorkflowMentions.map((m) => {
                const human = m.name || m.description || "";
                // Mirror how workflow tool names are generated in workflowToVercelAITool
                const toolKey = String(human)
                  .replace(/[^a-zA-Z0-9\s]/g, "")
                  .trim()
                  .replace(/\s+/g, "-")
                  .toUpperCase();
                return `${human}${toolKey ? ` (tool: ${toolKey})` : ""}`.trim();
              });
              const list = items.length > 0 ? items.join(", ") : "the detected workflow(s)";
              const activeAgent = (agent || autoDetectedAgent) as any;
              const agentContext = activeAgent ? `You are collaborating with agent '${activeAgent.name}'. Incorporate the agent's context in the summary.` : "";
              const argHygiene = `When constructing workflow tool arguments, derive values strictly from the user's latest prompt text and explicit mentions. Do NOT infer variables (e.g., client_name, email, topic, urls) from attachments or previous files; attachments are context only. If prompt and attachments conflict, prefer the prompt.`;
              const flexibility = `Include the following workflow(s) if helpful this turn: ${list}. You may also call MCP or default tools as needed. Avoid duplicate invocations of the same workflow unless inputs change.`;
              return `${flexibility} ${agentContext}\n\n${argHygiene}`.trim();
            })()
          : undefined;

        const effectiveAgent = agent || autoDetectedAgent || undefined;
        // Build MCP mention hint (client-provided only) to ensure a post-tool summary
        const clientMcpMentions = (clientMentions || []).filter(
          (m: any) => m.type === "mcpServer" || m.type === "mcpTool",
        ) as any[];
        const forcedMcpHint = clientMcpMentions.length > 0
          ? (() => {
              const items = clientMcpMentions.map((m: any) =>
                m.type === "mcpServer" ? `MCP server '${m.name}'` : `MCP tool '${m.name}'`,
              );
              const list = items.join(", ");
              const chaining = `If a tool returns a list (e.g., properties or accounts), choose the best match from the user's prompt and context (including any mentioned domain or agent) and then call the necessary follow-up tool(s) from the SAME MCP to gather the required KPIs for the requested time window. Do not stop after the first tool call; continue tool calls until you can fully answer, then summarize.`;
              return `Invoke tool(s) from ${list} as needed to answer the user's request this turn. ${chaining} After tool execution, produce a concise assistant summary of the findings and recommended next steps.`;
            })()
          : undefined;
        const systemPrompt = mergeSystemPrompt(
          buildUserSystemPrompt(session.user, userPreferences, effectiveAgent),
          buildMcpServerCustomizationsSystemPrompt(mcpServerCustomizations),
          forcedWorkflowHint,
          forcedMcpHint,
          !supportToolCall && buildToolCallUnsupportedModelSystemPrompt,
          (!supportToolCall ||
            ["openai", "anthropic"].includes(chatModel?.provider ?? "")) &&
            thinking &&
            buildThinkingSystemPrompt(supportToolCall),
        );

        const vercelAITooles = safe({ ...MCP_TOOLS, ...WORKFLOW_TOOLS })
          .map((t) => {
            const bindingTools =
              toolChoice === "manual" ? excludeToolExecution(t) : t;
            return {
              ...bindingTools,
              ...APP_DEFAULT_TOOLS, // APP_DEFAULT_TOOLS Not Supported Manual
            };
          })
          .map((t) => {
            const allowThinkingTool = supportToolCall && thinking && !forceWorkflowOnly;
            if (allowThinkingTool) {
              return {
                ...t,
                [SequentialThinkingToolName]: sequentialThinkingTool,
              };
            }
            return t;
          })
          .map((allTools) => {
            // Hard cap per provider limitation: 128 tools max
            const MAX_TOOLS = 128;
            const toolEntries = Object.entries(allTools);
            if (toolEntries.length <= MAX_TOOLS) return allTools;

            // Prioritize mentioned tools first, then app default tools, then others
            const mentionedNames = new Set(
              (mentions || [])
                .filter((m) => m.type === "mcpTool" || m.type === "workflow" || m.type === "defaultTool")
                .map((m: any) => m.name)
                .filter(Boolean),
            );
            const appDefaultNames = new Set(Object.keys(APP_DEFAULT_TOOLS));

            const mentioned = toolEntries.filter(([name]) => mentionedNames.has(name));
            const appDefaults = toolEntries.filter(
              ([name]) => !mentionedNames.has(name) && appDefaultNames.has(name),
            );
            const others = toolEntries.filter(
              ([name]) => !mentionedNames.has(name) && !appDefaultNames.has(name),
            );

            const prioritized = [...mentioned, ...appDefaults, ...others].slice(0, MAX_TOOLS);
            return Object.fromEntries(prioritized);
          })
          .unwrap();

        const allowedMcpTools = Object.values(allowedMcpServers ?? {})
          .map((t: AllowedMCPServer) => t.tools)
          .flat();

        logger.info(
          `${effectiveAgent ? `agent: ${effectiveAgent.name}, ` : ""}tool mode: ${toolChoice}, mentions: ${mentions.length}, thinking: ${thinking}`,
        );

        logger.info(
          `allowedMcpTools: ${allowedMcpTools.length ?? 0}, allowedAppDefaultToolkit: ${allowedAppDefaultToolkit?.length ?? 0}`,
        );
        logger.info(
          `binding tool count APP_DEFAULT: ${Object.keys(APP_DEFAULT_TOOLS ?? {}).length}, MCP: ${Object.keys(MCP_TOOLS ?? {}).length}, Workflow: ${Object.keys(WORKFLOW_TOOLS ?? {}).length}`,
        );
        logger.info(`model: ${chatModel?.provider}/${chatModel?.model}`);

        // Prefer requiring a tool call when a workflow is explicitly requested or confidently auto-detected,
        // unless client also specified MCP mentions (in which case AUTO lets the model orchestrate freely).
        const hasClientWorkflowMention = clientWorkflowMentions.length > 0;
        const hasAutoWorkflowMention = autoWorkflowMentions.length > 0;
        const hasClientMcpMention = (clientMentions || []).some((m: any) =>
          m.type === "mcpServer" || m.type === "mcpTool",
        );
        const toolChoiceForRun: "auto" | "required" =
          hasClientWorkflowMention || (hasAutoWorkflowMention && !hasClientMcpMention)
            ? "required"
            : "auto";

        // When forcing workflows, allow as many steps as the number of distinct explicitly-mentioned workflows (cap to 10)
        // Let the model take as many steps as it needs; do not cap maxSteps

        // Per-turn dedup guard and restriction: if forcing workflows, expose only workflow tools and prevent duplicate calls
        const toolsForRun = vercelAITooles as Record<string, any>;

        // Post-process: if the selected tool expects a 'client_name' parameter,
        // and the user's latest prompt includes a domain (URL or bare domain),
        // fill args.client_name from that domain when the model omitted it.
        const augmentToolsWithClientName = (tools: Record<string, any>): Record<string, any> => {
          // Extract last user text
          const lastUserText = (() => {
            const lastUser = [...messages].reverse().find((m) => m.role === "user");
            const parts: any[] = (lastUser?.parts as any[]) || [];
            const t = parts.find((p) => p?.type === "text")?.text || parts[0]?.text;
            return typeof t === "string" ? t : "";
          })();

          const pickLastDomain = (text?: string): string | undefined => {
            if (!text) return undefined;
            const urlRegex = /https?:\/\/[^\s)]+/gi;
            const urls = text.match(urlRegex) || [];
            const bareDomainRegex = /\b((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,})\b/gi;
            const bareDomains: string[] = [];
            let m: RegExpExecArray | null;
            while ((m = bareDomainRegex.exec(text)) !== null) {
              if (m[1]) bareDomains.push(m[1]);
            }
            const candidates: string[] = [];
            for (const u of urls) {
              try {
                const host = new URL(u).hostname.replace(/^www\./i, "");
                candidates.push(host);
              } catch {}
            }
            for (const d of bareDomains) {
              const host = d.replace(/^www\./i, "");
              candidates.push(host);
            }
            if (candidates.length === 0) return undefined;
            return candidates[candidates.length - 1];
          };

          const inferredDomain = pickLastDomain(lastUserText);
          if (!inferredDomain) return tools;

          const wrapped: Record<string, any> = {};
          for (const [name, tool] of Object.entries(tools)) {
            const originalExecute = (tool as any)?.execute;
            const zodParams = (tool as any)?.parameters;
            const hasClientNameField = (() => {
              try {
                const shape = (zodParams as any)?._def?.shape?.() || (zodParams as any)?.shape;
                return !!(shape && shape.client_name);
              } catch {
                return false;
              }
            })();
            if (typeof originalExecute === "function" && hasClientNameField) {
              wrapped[name] = {
                ...tool,
                execute: async (args: any, ctx: any) => {
                  const nextArgs = args && typeof args === "object"
                    ? { ...args }
                    : {};
                  if (nextArgs.client_name == null || String(nextArgs.client_name).trim() === "") {
                    nextArgs.client_name = inferredDomain;
                  }
                  return originalExecute(nextArgs, ctx);
                },
              };
            } else {
              wrapped[name] = tool;
            }
          }
          return wrapped;
        };

        const toolsForRunAugmented = augmentToolsWithClientName(toolsForRun);

        const result = streamText({
          model,
          system: systemPrompt,
          messages,
          temperature: 1,
          // Allow ample planning and chaining of tool calls before summarizing
          maxSteps: 20,
          toolCallStreaming: true,
          experimental_transform: smoothStream({ chunking: "word" }),
          maxRetries: 2,
          tools: toolsForRunAugmented,
          toolChoice: toolChoiceForRun,
          abortSignal: request.signal,
          onFinish: async ({ response, usage }) => {
            const appendMessages = appendResponseMessages({
              messages: messages.slice(-1),
              responseMessages: response.messages,
            });
            if (isLastMessageUserMessage) {
              await chatRepository.upsertMessage({
                threadId: thread!.id,
                model: chatModel?.model ?? null,
                role: "user",
                parts: message.parts,
                attachments: (patchedMessage as any).experimental_attachments,
                id: message.id,
                annotations: appendAnnotations(
                  message.annotations,
                  [
                    { usageTokens: usage.promptTokens },
                    ...mentionedAgentIds.map((id) => ({ agentId: id })),
                  ],
                ),
              });
            }
            const assistantMessage = appendMessages.at(-1);
            if (assistantMessage) {
              // Deduplicate tool-invocation parts by tool name
              // - Keep only the last 'result' per tool
              // - Drop earlier 'call' entries for tools that have a 'result' later in the same message
              const dedupParts = (() => {
                const parts = (assistantMessage.parts as UIMessage["parts"]) || [];
                const resultToolNames = new Set<string>();
                for (const p of parts) {
                  const pv: any = p;
                  if (
                    pv?.type === "tool-invocation" &&
                    pv?.toolInvocation?.state === "result" &&
                    typeof pv?.toolInvocation?.toolName === "string"
                  ) {
                    resultToolNames.add(pv.toolInvocation.toolName);
                  }
                }
                const seen = new Set<string>();
                const result: typeof parts = [];
                for (let i = parts.length - 1; i >= 0; i--) {
                  const p = parts[i] as any;
                  if (
                    p?.type === "tool-invocation" &&
                    typeof p?.toolInvocation?.toolName === "string"
                  ) {
                    const key = p.toolInvocation.toolName;
                    if (p?.toolInvocation?.state !== "result" && resultToolNames.has(key)) {
                      continue; // drop earlier 'call' when a 'result' exists later
                    }
                    if (p?.toolInvocation?.state === "result") {
                      if (seen.has(key)) continue;
                      seen.add(key);
                    }
                  }
                  result.push(parts[i]);
                }
                return result.reverse();
              })();

              const annotations = appendAnnotations(
                assistantMessage.annotations,
                [
                  { usageTokens: usage.completionTokens, toolChoice: toolChoiceForRun },
                  ...mentionedAgentIds.map((id) => ({ agentId: id })),
                ],
              );
              dataStream.writeMessageAnnotation(annotations.at(-1)!);
              chatRepository.upsertMessage({
                model: chatModel?.model ?? null,
                threadId: thread!.id,
                role: assistantMessage.role,
                id: assistantMessage.id,
                parts: (dedupParts as UIMessage["parts"]).map(
                  (v) => {
                    if (
                      v.type == "tool-invocation" &&
                      v.toolInvocation.state == "result" &&
                      isVercelAIWorkflowTool(v.toolInvocation.result)
                    ) {
                      return {
                        ...v,
                        toolInvocation: {
                          ...v.toolInvocation,
                          result: {
                            ...v.toolInvocation.result,
                            history: v.toolInvocation.result.history.map(
                              (h) => {
                                return {
                                  ...h,
                                  result: undefined,
                                };
                              },
                            ),
                          },
                        },
                      };
                    }
                    if (
                      v.type == "tool-invocation" &&
                      v.toolInvocation.state == "result" &&
                      v.toolInvocation.toolName == SequentialThinkingToolName
                    ) {
                      return {
                        ...v,
                        toolInvocation: {
                          ...v.toolInvocation,
                          args: {},
                        },
                      };
                    }
                    return v;
                  },
                ),
                attachments: assistantMessage.experimental_attachments,
                annotations,
              });
            }
            if (effectiveAgent) {
              await agentRepository.updateAgent(effectiveAgent.id, session.user.id, {
                updatedAt: new Date(),
              } as any);
            }
          },
        });
        result.consumeStream();
        result.mergeIntoDataStream(dataStream, {
          sendReasoning: true,
        });
        result.usage.then((useage) => {
          logger.debug(
            `usage input: ${useage.promptTokens}, usage output: ${useage.completionTokens}, usage total: ${useage.totalTokens}`,
          );
        });
      },
      onError: handleError,
    });
  } catch (error: any) {
    logger.error(error);
    return Response.json({ message: error.message }, { status: 500 });
  }
}
