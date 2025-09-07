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
    let forceWorkflowAuto = false;
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
        if (!Array.isArray(parts)) return "";
        return parts
          .map((p) => (typeof p?.text === "string" ? p.text : ""))
          .filter(Boolean)
          .join(" ");
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
          const strong = !!n && userText.includes(n);
          if (containsCandidate(wfName)) {
            mentions.push({
              type: "workflow",
              name: wfName,
              description: (wf as any).description ?? null,
              workflowId: (wf as any).id,
              icon: (wf as any).icon ?? null,
            } as any);
            existingWorkflowIds.add((wf as any).id);
            if (strong) forceWorkflowAuto = true;
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

    const isToolCallAllowed =
      supportToolCall && (toolChoice != "none" || mentions.length > 0);

    return createDataStreamResponse({
      execute: async (dataStream) => {
        const mcpClients = await mcpClientsManager.getClients();
        const mcpTools = await mcpClientsManager.tools();
        logger.info(
          `mcp-server count: ${mcpClients.length}, mcp-tools count :${Object.keys(mcpTools).length}`,
        );

        // Auto-detect MCP servers (and tools) from user text to create mentions
        try {
          const getNormalized = (s: string) =>
            (s || "")
              .toLowerCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .replace(/[^a-z0-9\s]/g, " ")
              .replace(/\s+/g, " ")
              .trim();
          const STOPWORDS = new Set<string>([
            "the","a","an","and","or","of","for","to","in","on","with","by","at","from","as","is","are","be","this","that","it",
            "le","la","les","un","une","des","et","ou","de","du","pour","dans","sur","avec","par","au","aux","est","ce","cet","cette","ces",
          ]);
          const tokenize = (s: string) => getNormalized(s).split(" ").filter(Boolean).filter((t) => !STOPWORDS.has(t));
          const userTextParts = ((finalPatchedMessage as any)?.parts as any[]) || [];
          const userTextRaw = userTextParts
            .map((p) => (typeof p?.text === "string" ? p.text : ""))
            .filter(Boolean)
            .join(" ");
          const userText = getNormalized(userTextRaw);
          const strongMcpServerIds = new Set<string>();
          if (userText && userText.length >= 3) {
            const existingServers = new Set(
              (mentions || [])
                .filter((m: any) => m.type === "mcpServer")
                .map((m: any) => m.serverId),
            );
            // Index servers from tools
            const servers: Record<string, { id: string; name: string }> = {};
            Object.values(mcpTools || {}).forEach((tool: any) => {
              if (!tool?._mcpServerId) return;
              if (!servers[tool._mcpServerId]) {
                servers[tool._mcpServerId] = {
                  id: tool._mcpServerId,
                  name: tool._mcpServerName || "",
                };
              }
            });
            // Simple scoring per server based on name token overlap
            for (const srv of Object.values(servers)) {
              if (!srv?.id) continue;
              if (existingServers.has(srv.id)) continue;
              const tokens = tokenize(srv.name);
              if (tokens.length === 0) continue;
              const matched = tokens.filter((t) => userText.includes(t));
              if (matched.length === 0) continue;
              // Require at least 2 tokens, or 1 if server name is single-token
              const ok = matched.length >= Math.min(2, tokens.length);
              if (!ok) continue;
              const fullIncluded = userText.includes(getNormalized(srv.name));
              mentions.push({
                type: "mcpServer",
                name: srv.name,
                description: undefined,
                toolCount: undefined,
                serverId: srv.id,
              } as any);
              existingServers.add(srv.id);
              if (fullIncluded) strongMcpServerIds.add(srv.id);
            }
          }
          // attach strong server ids to request for later hinting/forcing
          (request as any)._strongMcpServerIds = strongMcpServerIds;
        } catch {}

        // Determine if the user explicitly mentioned workflow(s)
        const explicitClientWorkflowMentions = (clientMentions || []).filter(
          (m: any) => m.type === "workflow",
        );
        const forceWorkflowOnly =
          supportToolCall && explicitClientWorkflowMentions.length > 0;

        // Load tools (optionally restricted to explicitly mentioned workflows)
        let MCP_TOOLS: Record<string, any> = {};
        let WORKFLOW_TOOLS: Record<string, any> = {};
        let APP_DEFAULT_TOOLS: Record<string, any> = {};

        // Re-evaluate allowance after auto-mention detection
        const toolAllowed = isToolCallAllowed || (mentions?.length ?? 0) > 0;

        if (toolAllowed) {
          if (forceWorkflowOnly) {
            WORKFLOW_TOOLS = await safe()
              .map(() =>
                loadWorkFlowTools({
                  mentions: explicitClientWorkflowMentions as any,
                  dataStream,
                }),
              )
              .orElse({});
            // When forcing workflows, do not bind other tools
            MCP_TOOLS = {};
            APP_DEFAULT_TOOLS = {};
          } else {
            MCP_TOOLS = await safe()
              .map(errorIf(() => !isToolCallAllowed && "Not allowed"))
              .map(() =>
                loadMcpTools({
                  mentions,
                  allowedMcpServers,
                }),
              )
              .orElse({});

            WORKFLOW_TOOLS = await safe()
              .map(errorIf(() => !isToolCallAllowed && "Not allowed"))
              .map(() =>
                loadWorkFlowTools({
                  mentions,
                  dataStream,
                }),
              )
              .orElse({});

            APP_DEFAULT_TOOLS = await safe()
              .map(errorIf(() => !isToolCallAllowed && "Not allowed"))
              .map(() =>
                loadAppDefaultTools({
                  mentions,
                  allowedAppDefaultToolkit,
                }),
              )
              .orElse({});
          }
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

        const clientMcpMentions = (clientMentions || []).filter(
          (m: any) => m.type === "mcpServer" || m.type === "mcpTool",
        );

        const strongMcpServerIds: Set<string> = (request as any)
          ?._strongMcpServerIds || new Set<string>();
        const forceMcpAuto = strongMcpServerIds.size > 0;

        const hasWorkflowMention = (mentions || []).some(
          (m: any) => m.type === "workflow",
        );
        const hasMcpMention = (mentions || []).some(
          (m: any) => m.type === "mcpServer" || m.type === "mcpTool",
        );

        const forcedWorkflowHint = (forceWorkflowOnly || forceWorkflowAuto)
          ? "If specific workflows are explicitly mentioned, you MUST invoke each mentioned workflow exactly once, then provide a final assistant answer summarizing the results. Do not re-invoke the same workflow multiple times in the same turn."
          : undefined;

        const effectiveAgent = agent || autoDetectedAgent || undefined;
        const forcedMcpHint = (clientMcpMentions.length > 0 || forceMcpAuto)
          ? "If specific MCP servers or tools are mentioned, you MUST invoke at least one most relevant tool from those servers to answer the user's question before responding. Prefer one call per server unless clearly necessary."
          : undefined;

        // Ask confirmation if ambiguous (multiple relaxed mentions without a strong exact match)
        const ambiguous = !forceWorkflowAuto && !forceMcpAuto && (
          ((mentions || []).filter((m: any) => m.type === "workflow").length > 1) ||
          (((mentions || []).filter((m: any) => m.type === "workflow").length >= 1) &&
            ((mentions || []).filter((m: any) => m.type === "mcpServer" || m.type === "mcpTool").length >= 1))
        );
        const disambiguationHint = ambiguous
          ? "If multiple workflows or MCP servers could match and none is an exact name match, ask the user to confirm which to use before calling any tools."
          : undefined;

        const systemPrompt = mergeSystemPrompt(
          buildUserSystemPrompt(session.user, userPreferences, effectiveAgent),
          buildMcpServerCustomizationsSystemPrompt(mcpServerCustomizations),
          forcedWorkflowHint,
          disambiguationHint,
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
              // Include App Default tools only when no workflow/MCP mentions exist
              ...(!hasWorkflowMention && !hasMcpMention ? APP_DEFAULT_TOOLS : {}),
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

            // Prioritize mentioned tools and MCP servers first, then app default tools, then others
            const mentionedNames = new Set(
              (mentions || [])
                .filter((m) => m.type === "mcpTool" || m.type === "workflow" || m.type === "defaultTool")
                .map((m: any) => m.name)
                .filter(Boolean),
            );
            const mentionedServerIds = new Set(
              (mentions || [])
                .filter((m) => m.type === "mcpServer")
                .map((m: any) => m.serverId)
                .filter(Boolean),
            );
            const appDefaultNames = new Set(Object.keys(APP_DEFAULT_TOOLS));

            const mentioned = toolEntries.filter(([name, tool]: any) => {
              return (
                mentionedNames.has(name) ||
                (tool && mentionedServerIds.has(tool._mcpServerId))
              );
            });
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

        // Decide final toolChoice: force required when explicit client workflow(s) were mentioned
        const preferWorkflow = forceWorkflowOnly || forceWorkflowAuto;
        const preferMcp = !preferWorkflow && (clientMcpMentions.length > 0 || forceMcpAuto);
        const toolChoiceForRun: "auto" | "required" = preferWorkflow || preferMcp ? "required" : "auto";

        // Ensure at least one post-tool step for an assistant summary
        const maxStepsForRun = (() => {
          if (preferWorkflow) {
            const wfCount = Math.max(
              1,
              explicitClientWorkflowMentions.length || 1,
            );
            // one step per workflow (capped) + 1 for summary
            return Math.min(5, wfCount + 1);
          }
          if (preferMcp) {
            // one tool call + one summary step
            return 2;
          }
          return 10;
        })();

        // Per-turn dedup guard: prevent re-invoking the same workflow tool within this run
        const DUP_NOTE =
          "Le workflow a déjà été exécuté pour cette requête. J'ai inclus le résultat ci-dessus. Dites-moi si vous souhaitez relancer avec des paramètres différents.";

        const toolsForRun = (() => {
          if (preferWorkflow) {
            const onlyWorkflows = Object.fromEntries(
              Object.entries(vercelAITooles as Record<string, any>).filter(
                ([, tool]: any) => tool?.__$ref__ === "workflow",
              ),
            );
            const invoked = new Set<string>();
            const toolsRef = onlyWorkflows as Record<string, any>;
            for (const [name, tool] of Object.entries(toolsRef)) {
              const originalExecute = tool?.execute;
              if (typeof originalExecute !== "function") continue;
              toolsRef[name].execute = async (args: any, ctx: any) => {
                if (invoked.has(name)) {
                  // On duplicate attempt, short-circuit with a friendly text result
                  return {
                    content: [
                      {
                        type: "text",
                        text: DUP_NOTE,
                      },
                    ],
                  } as any;
                }
                invoked.add(name);
                return originalExecute(args, ctx);
              };
            }
            return toolsRef;
          }
          if (preferMcp) {
            const onlyMcp = Object.fromEntries(
              Object.entries(vercelAITooles as Record<string, any>).filter(
                ([, tool]: any) => tool?.__$ref__ === "mcp",
              ),
            );
            return onlyMcp as Record<string, any>;
          }
          return vercelAITooles;
        })();

        const result = streamText({
          model,
          system: systemPrompt,
          messages,
          temperature: 1,
          maxSteps: maxStepsForRun,
          toolCallStreaming: true,
          experimental_transform: smoothStream({ chunking: "word" }),
          maxRetries: 2,
          tools: toolsForRun,
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
              // If model didn't produce a text answer, synthesize one from workflow result(s)
              const partsArray = (assistantMessage.parts as UIMessage["parts"]) as any[];
              const hasAssistantText = Array.isArray(partsArray)
                ? partsArray.some((p) => p?.type === "text" && typeof p?.text === "string" && p.text.trim().length > 0)
                : false;
              let workflowText: string | undefined;
              if (!hasAssistantText && Array.isArray(partsArray)) {
                const wfResults: string[] = partsArray
                  .filter(
                    (p) =>
                      p?.type === "tool-invocation" &&
                      p?.toolInvocation?.state === "result" &&
                      isVercelAIWorkflowTool(p?.toolInvocation?.result),
                  )
                  .map((p) => {
                    const r = p.toolInvocation.result?.result;
                    if (typeof r === "string") return r;
                    try {
                      return JSON.stringify(r, null, 2);
                    } catch {
                      return String(r ?? "");
                    }
                  })
                  .filter((t) => t && t.trim().length > 0);
                if (wfResults.length > 0) {
                  workflowText = wfResults.join("\n\n");
                  (assistantMessage as any).parts = [
                    ...partsArray,
                    { type: "text", text: workflowText },
                  ];
                }
              }
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
                parts: (assistantMessage.parts as UIMessage["parts"]).map(
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
