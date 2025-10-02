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
import { AppDefaultToolkit, DefaultToolName, SequentialThinkingToolName } from "lib/ai/tools";
import { sequentialThinkingTool } from "lib/ai/tools/thinking/sequential-thinking";
import { compressPdfAttachmentsIfNeeded } from "lib/pdf/compress";
import { APP_DEFAULT_TOOL_KIT } from "lib/ai/tools/tool-kit";

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

    // Auto-detect mentions (agents/workflows/MCP/default tools) from user text when not explicitly tagged
    let autoDetectedAgent: any | undefined;
    // Hold workflow candidates across detection and later selection
    let workflowCandidates: Array<{ mention: any; score: number; exact: boolean }> = [];
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

      // Explicit @tool('...') parsing to force default tool mentions
      try {
        const raw = (userTextRaw || "").toString();
        const re = /@?tool\(\s*['"]([^'"]+)['"]\s*\)/gi;
        const seen = new Set<string>();
        const defaultToolEntries = Object.values(APP_DEFAULT_TOOL_KIT).flatMap((group) => Object.keys(group));
        const norm = (s: string) =>
          (s || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9\s-]/gi, " ")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
        let m: RegExpExecArray | null;
        while ((m = re.exec(raw)) !== null) {
          const label = (m[1] || "").trim();
          if (!label) continue;
          // Prefer exact id match, then normalized match against known tool ids
          const found = defaultToolEntries.find((id) => id === label) ||
            defaultToolEntries.find((id) => norm(id) === norm(label));
          if (found && !seen.has(found)) {
            mentions.push({ type: "defaultTool", name: found } as any);
            seen.add(found);
          }
        }
      } catch {}
      const userText = getNormalized(userTextRaw);
      const userTextLower = userTextRaw.toLowerCase();
      const hasUrlInUserText = /(https?:\/\/|www\.)\S+/.test(userTextLower);
      const hasBareDomainInUserText = /\b((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,})\b/.test(
        userTextLower,
      );
      const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const isExactWordMatch = (name: string) => {
        const n = getNormalized(name);
        if (!n) return false;
        const re = new RegExp(`(^|\\s)${escapeRegExp(n)}(\\s|$)`);
        return re.test(userText);
      };

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
          const tokens = n.split(" ").filter(Boolean);
          // Only allow fuzzy/containment for multi-word names; single-word names must be exact
          if (tokens.length <= 1) return false;
          // Full phrase containment
          if (userText.includes(n)) return true;
          // token-wise containment: require at least two token matches
          const matchedCount = tokens.filter((t) => userText.includes(t)).length;
          if (matchedCount >= Math.min(2, tokens.length)) return true;
          // space-insensitive containment for multi-word names
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

        // Fetch visible workflows, agents, and MCP tools
        const [wfList, agentList, mcpToolMap] = await Promise.all([
          workflowRepository.selectExecuteAbility(session.user.id),
          agentRepository.selectAgents(session.user.id, ["all"], 100),
          mcpClientsManager
            .tools()
            .catch(() => ({} as Record<string, any>)),
        ]);
        // Reset candidates for this detection pass
        workflowCandidates = [];

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

        // Detect workflows by name (exact first, then fuzzy)
        for (const wf of wfList || []) {
          if (existingWorkflowIds.has((wf as any).id)) continue;
          const wfName = (wf as any).name as string;
          const n = getNormalized(wfName);
          const wfTokens = tokenize(wfName).filter(Boolean);
          const isExactAcceptable = (() => {
            // For single-word workflow names, require the ENTIRE user text to equal the name
            if (wfTokens.length <= 1) {
              return (
                userText === n ||
                (isExactWordMatch(wfName) && (hasUrlInUserText || hasBareDomainInUserText))
              );
            }
            // For multi-word workflow names, allow exact phrase with boundaries
            return isExactWordMatch(wfName);
          })();

          if (isExactAcceptable || containsCandidate(wfName)) {
            const cand = {
              type: "workflow",
              name: wfName,
              description: (wf as any).description ?? null,
              workflowId: (wf as any).id,
              icon: (wf as any).icon ?? null,
            } as any;
            mentions.push(cand);
            existingWorkflowIds.add((wf as any).id);
            const baseScore = isExactAcceptable ? 100 : 70;
            workflowCandidates.push({ mention: cand, score: baseScore, exact: !!isExactAcceptable });
            // exact match tracked implicitly via candidate score; no global flag needed
            continue;
          }
          // relaxed matching: require at least two significant tokens for multi-word names
          const tokens = tokenize(wfName).filter((t) => !STOPWORDS.has(t));
          const matched = tokens.filter((t) => userText.includes(t));
          // Disallow relaxed matching for single-word workflow names; must be exact
          if (tokens.length >= 2 && matched.length >= 2) {
            const hasUnique = matched.some((t) => (wfTokenCounts.get(t) || 0) === 1);
            const sim = bigramSim(n, userText);
            const score = matched.length * 30 + (hasUnique ? 20 : 0) + Math.min(sim, 10);
            if (score >= 30) {
              const cand = {
                type: "workflow",
                name: wfName,
                description: (wf as any).description ?? null,
                workflowId: (wf as any).id,
                icon: (wf as any).icon ?? null,
              } as any;
              mentions.push(cand);
              existingWorkflowIds.add((wf as any).id);
              workflowCandidates.push({ mention: cand, score, exact: false });
            }
          }
        }

        // Detect agents by name (exact first, then fuzzy)
        for (const a of agentList || []) {
          if (existingAgentIds.has((a as any).id)) continue;
          if (isExactWordMatch((a as any).name) || containsCandidate((a as any).name)) {
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
            // exact match tracked at candidate-level; no global flag needed
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

        // Detect MCP tools by name (exact first, then fuzzy)
        try {
          const mcpToolsArr = Object.values(mcpToolMap || {}) as any[];
          for (const tool of mcpToolsArr) {
            const toolName = String(tool?._originToolName || "");
            if (!toolName) continue;
            if (isExactWordMatch(toolName) || containsCandidate(toolName)) {
              mentions.push({
                type: "mcpTool",
                name: toolName,
                serverId: tool?._mcpServerId,
              } as any);
              // exact tool name noted but no global flag necessary
              continue;
            }
            const tokens = tokenize(toolName).filter((t) => !STOPWORDS.has(t));
            const matched = tokens.filter((t) => userText.includes(t));
            if (matched.length > 0) {
              const hasUnique = matched.some((t) => tokens.filter((x) => x === t).length === 1);
              const sim = bigramSim(getNormalized(toolName), userText);
              let score = matched.length * 25 + (hasUnique ? 15 : 0) + Math.min(sim, 8);
              if (tokens.length === 1 && matched.length === 1) score += 10;
              if (score >= 30) {
                mentions.push({
                  type: "mcpTool",
                  name: toolName,
                  serverId: tool?._mcpServerId,
                } as any);
              }
            }
          }
        } catch {}

        // Detect App Default tools by name (exact first, then fuzzy)
        try {
          const defaultToolEntries = Object.values(APP_DEFAULT_TOOL_KIT).flatMap((group) => Object.keys(group));
          for (const tName of defaultToolEntries) {
            if (isExactWordMatch(tName) || containsCandidate(tName)) {
              mentions.push({ type: "defaultTool", name: tName } as any);
              // exact default tool name noted but no global flag necessary
              continue;
            }
            const tokens = tokenize(tName).filter((tk) => !STOPWORDS.has(tk));
            const matched = tokens.filter((tk) => userText.includes(tk));
            if (matched.length > 0) {
              const sim = bigramSim(getNormalized(tName), userText);
              let score = matched.length * 20 + Math.min(sim, 8);
              if (tokens.length === 1 && matched.length === 1) score += 10;
              if (score >= 28) {
                mentions.push({ type: "defaultTool", name: tName } as any);
              }
            }
          }
        } catch {}
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

        // INTELLIGENT MCP TOOL DETECTION - Natural language understanding
        const lastUserTextForMcp = (() => {
          const lastUser = [...messages].reverse().find((m) => m.role === "user");
          const parts: any[] = (lastUser?.parts as any[]) || [];
          const t = parts.find((p) => p?.type === "text")?.text || parts[0]?.text;
          return typeof t === "string" ? t : "";
        })();
        const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const userTextNorm = norm(lastUserTextForMcp);
        
        // App default tool detection (legacy patterns for backward compatibility)
        
        const wantsWebSearch = /recherche\s*web/.test(userTextNorm) || 
                              /web\s*search/.test(userTextNorm) ||
                              /search.*nike/i.test(userTextNorm);
        
        const wantsImageGen = /image/.test(userTextNorm) || 
                             /seelab/.test(userTextNorm) ||
                             /persona.*image/i.test(userTextNorm);
        
        // Smart visualization detection
        const wantsVisualization = /tableau/.test(userTextNorm) || 
                                  /table/.test(userTextNorm) ||
                                  /graphique/.test(userTextNorm) ||
                                  /chart/.test(userTextNorm);
        const wantsTable = wantsVisualization;
        // FUTURE-PROOF: Dynamic MCP detection based on natural language understanding
        const autoMcpMentions: any[] = (() => {
          const arr: any[] = [];
          if (!mcpTools || Object.keys(mcpTools).length === 0) return arr;
          const entries = Object.entries(mcpTools);
          
          // DYNAMIC MCP DETECTION: Analyze user intent and match against available MCP servers
          const analyzeUserIntent = (text: string): string[] => {
            const intents: string[] = [];
            const lowerText = text.toLowerCase();
            
            // Expandable data source patterns - automatically works with any MCP
            const dataSourcePatterns = [
              { keywords: ['search console', 'gsc', 'google search console', 'mots-clés', 'keywords'], intent: 'search-analytics' },
              { keywords: ['google ads', 'adwords', 'ads', 'publicité', 'advertising'], intent: 'advertising-data' },
              { keywords: ['drive', 'google drive', 'workspace', 'docs', 'sheets', 'fathom', 'search drive', 'drive files', 'google docs', 'google sheets', 'gdrive'], intent: 'document-storage' },
              { keywords: ['analytics', 'ga', 'google analytics', 'traffic'], intent: 'web-analytics' },
              { keywords: ['youtube', 'video', 'channel'], intent: 'video-platform' },
              { keywords: ['facebook', 'meta', 'instagram', 'social'], intent: 'social-media' },
              { keywords: ['shopify', 'ecommerce', 'store', 'products'], intent: 'ecommerce' },
              { keywords: ['salesforce', 'crm', 'customers'], intent: 'customer-management' },
              { keywords: ['slack', 'teams', 'discord', 'chat'], intent: 'communication' },
              { keywords: ['github', 'git', 'repository', 'code'], intent: 'code-repository' },
              { keywords: ['database', 'sql', 'postgres', 'mysql'], intent: 'database' },
              { keywords: ['api', 'rest', 'graphql', 'endpoint'], intent: 'api-integration' },
              { keywords: ['email', 'gmail', 'outlook', 'mail'], intent: 'email-service' },
              { keywords: ['calendar', 'events', 'meetings'], intent: 'calendar-service' },
              { keywords: ['notion', 'notes', 'wiki'], intent: 'knowledge-management' },
              { keywords: ['stripe', 'payment', 'billing'], intent: 'payment-processing' }
            ];
            
            for (const pattern of dataSourcePatterns) {
              if (pattern.keywords.some(keyword => lowerText.includes(keyword))) {
                intents.push(pattern.intent);
              }
            }
            
            return intents;
          };
          
          // Match detected intents against available MCP servers dynamically
          const matchMcpServers = (intents: string[]): any[] => {
            const serverScores: Record<string, { score: number, name: string }> = {};
            
            for (const [toolKey, toolVal] of entries as any) {
              const serverName = (toolVal._mcpServerName || '').toLowerCase();
              const toolName = (toolVal._originToolName || toolKey).toLowerCase();
              const serverId = toolVal._mcpServerId;
              
              if (!serverId) continue;
              
              let score = 0;
              
              // Score based on server/tool name matching intents
              for (const intent of intents) {
                const intentWords = intent.split('-');
                for (const word of intentWords) {
                  if (serverName.includes(word) || toolName.includes(word)) {
                    score += 10;
                  }
                }
              }
              
              // Boost score for semantic matches
              if (intents.includes('search-analytics') && (serverName.includes('search') || serverName.includes('console') || toolName.includes('search'))) score += 20;
              if (intents.includes('advertising-data') && (serverName.includes('ads') || serverName.includes('google') || toolName.includes('ads'))) score += 20;
              if (intents.includes('document-storage') && (
                serverName.includes('drive') || serverName.includes('workspace') || serverName.includes('google') ||
                toolName.includes('drive') || toolName.includes('workspace') || toolName.includes('search_drive') || 
                toolName.includes('files') || toolName.includes('docs') || toolName.includes('sheets')
              )) score += 20;
              if (intents.includes('web-analytics') && (serverName.includes('analytics') || toolName.includes('analytics'))) score += 20;
              if (intents.includes('ecommerce') && (serverName.includes('shopify') || toolName.includes('product'))) score += 20;
              
              // Generic fuzzy matching for any MCP server
              const allWords = [...intents.join(' ').split(/[-_\s]+/), ...lastUserTextForMcp.toLowerCase().split(/\s+/)];
              for (const word of allWords) {
                if (word.length > 3) { // Only match meaningful words
                  if (serverName.includes(word) || toolName.includes(word)) {
                    score += 5;
                  }
                }
              }
              
              if (score > 0) {
                if (!serverScores[serverId] || serverScores[serverId].score < score) {
                  serverScores[serverId] = { score, name: serverName || serverId };
                }
              }
            }
            
            // Return top scoring servers (up to 3 most relevant)
            const sortedServers = Object.entries(serverScores)
              .sort((a, b) => b[1].score - a[1].score)
              .slice(0, 3);
            
            return sortedServers.map(([serverId, { score, name }]) => ({
              type: "mcpServer",
              serverId,
              name: serverId,
              score,
              displayName: name
            }));
          };
          
          const detectedIntents = analyzeUserIntent(lastUserTextForMcp);
          const matchedServers = matchMcpServers(detectedIntents);
          
          // Log the dynamic detection for debugging
          logger.info(`🔍 MCP INTENT ANALYSIS: query="${lastUserTextForMcp}" → intents [${detectedIntents.join(', ')}]`);
          if (detectedIntents.length > 0 || matchedServers.length > 0) {
            logger.info(`🔍 FUTURE-PROOF MCP DETECTION: intents [${detectedIntents.join(', ')}] → servers [${matchedServers.map(s => s.displayName || s.name).join(', ')}]`);
          } else {
            logger.info(`❌ NO MCP SERVERS DETECTED: No intents matched or no servers available`);
          }
          
          return matchedServers;
        })();
        const effectiveClientMentions = [...clientMentions, ...autoMcpMentions];

        // Determine workflow mentions and selection (at most one per turn)
        // Prefer client-provided workflow mentions. If none, pick the closest auto-detected candidate by score.
        const explicitClientWorkflowMentions = (clientMentions || []).filter((m: any) => m.type === "workflow");
        const selectedWorkflowMentions = (() => {
          const clientSel = (explicitClientWorkflowMentions || []).slice(0, 1);
          if (clientSel.length > 0) return clientSel;
          if (Array.isArray(workflowCandidates) && workflowCandidates.length > 0) {
            const best = workflowCandidates
              .slice()
              .sort((a, b) => (b.exact === a.exact ? b.score - a.score : Number(b.exact) - Number(a.exact)))[0];
            // Only force when the best is exact OR sufficiently high-scoring
            if (best && (best.exact || best.score >= 80)) {
              return [best.mention];
            }
            return [];
          }
          return [] as any[];
        })();
        // Initially determine if workflow should be forced based on mentions
        let forceWorkflowOnly = supportToolCall && selectedWorkflowMentions.length > 0;
        
        // FUTURE-PROOF: Multi-step orchestration detection for any MCP + workflow combination
        // Note: This is declared early because it's used in workflow hints
        let needsMultiStepOrchestration = false;

        // Load tools (optionally restricted to explicitly mentioned workflows)
        let MCP_TOOLS: Record<string, any> = {};
        let WORKFLOW_TOOLS: Record<string, any> = {};
        let APP_DEFAULT_TOOLS: Record<string, any> = {};

        if (isToolCallAllowed) {
          // Always load all tool categories; restrict by mentions/allow-lists but do not exclude others when a workflow is selected
          MCP_TOOLS = await safe()
            .map(errorIf(() => !isToolCallAllowed && "Not allowed"))
            .map(() =>
              loadMcpTools({
                // Only use client mentions to restrict MCP tools
                mentions: effectiveClientMentions as any,
                allowedMcpServers,
              }),
            )
            .orElse({});

          // Prefer at most one workflow mention when any exist for loading, but keep other tool categories available
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

          // Ensure Visualization toolkit (incl. createTable) is available by default in chat when tools are allowed
          const allowedToolkitEffective = (() => {
            const base = (allowedAppDefaultToolkit && allowedAppDefaultToolkit.length > 0)
              ? allowedAppDefaultToolkit
              : Object.values(AppDefaultToolkit);
            return Array.from(new Set(base as any[])) as any[];
          })();

          APP_DEFAULT_TOOLS = await safe()
            .map(errorIf(() => !isToolCallAllowed && "Not allowed"))
            .map(() =>
              loadAppDefaultTools({
                // Only use client mentions to restrict default tools
                mentions: effectiveClientMentions as any,
                allowedAppDefaultToolkit: allowedToolkitEffective as any,
              }),
            )
            .orElse({});

          // Do not heuristically remove visualization tools; keep them available by default

          // If a workflow is explicitly mentioned (forced) but default code/http tools were not explicitly mentioned,
          // temporarily exclude them to prevent the model from picking them instead of the workflow first.
          if (forceWorkflowOnly && Object.keys(APP_DEFAULT_TOOLS).length > 0) {
            const explicitlyMentionedDefaultNames = new Set(
              (clientMentions || [])
                .filter((m: any) => m.type === "defaultTool")
                .map((m: any) => m.name)
                .filter(Boolean),
            );
            const codeHttpNames = new Set(["http", "mini-javascript-execution", "python-execution"]);
            const shouldKeep = (name: string) => explicitlyMentionedDefaultNames.has(name) || !codeHttpNames.has(name);
            if (![...Object.keys(APP_DEFAULT_TOOLS)].every(shouldKeep)) {
              const filtered: Record<string, any> = {};
              for (const [k, v] of Object.entries(APP_DEFAULT_TOOLS)) {
                if (shouldKeep(k)) filtered[k] = v;
              }
              APP_DEFAULT_TOOLS = filtered;
            }
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

        // For hints, use the actually selected workflow mention (client or auto)
        const allWorkflowMentions = selectedWorkflowMentions as any[];
        const forcedWorkflowHint = (forceWorkflowOnly)
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
              const ambiguityRule = `If required inputs like 'url' are ambiguous (e.g., multiple different URLs/domains detected), ask a short clarifying question and wait for the user's confirmation before invoking the workflow. If the workflow requires a 'brief' or 'summary', only propose using the user's latest message as the brief when it appears to be an actual brief (long or structured); otherwise ask the user to provide a brief (or proceed with an empty brief). Do not block on long briefs; use them as provided.`;
              const sequencingRule = needsMultiStepOrchestration 
                ? `CRITICAL ORCHESTRATION SEQUENCE: This query requires data from multiple sources. You MUST follow this exact sequence:
                   1) FIRST: Gather all required data using available MCP tools (Google Search Console, Google Ads, etc.)
                   2) SECOND: Analyze and process the collected data if needed
                   3) THIRD: Use the real data as input for the workflow (${selectedWorkflowMentions[0]?.name || 'detected workflow'})
                   4) FOURTH: Present the final results
                   DO NOT skip steps or use placeholder data. The workflow requires actual data from MCP tools.`
                : `Do not use general-purpose code or HTTP tools before invoking the workflow.`;
              return `Invoke the following workflow(s) exactly once this turn: ${list}. ${sequencingRule} You may also use other tools (MCP or app defaults) as needed to gather data or perform follow-ups. After the workflow completes, produce a brief assistant summary in the chat: highlight key findings, actionable next steps, and link to any generated artifacts. Do not re-invoke the same workflow in this turn. ${agentContext}\n\n${argHygiene}\n\n${ambiguityRule}`.trim();
            })()
          : undefined;

        const effectiveAgent = agent || autoDetectedAgent || undefined;
        // Build MCP mention hint (client-provided only) to ensure a post-tool summary
        const clientMcpMentions = (effectiveClientMentions || []).filter(
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
        const orchestrationPolicy = [
          "INTELLIGENT ORCHESTRATION POLICY:",
          "",
          "🧠 NATURAL LANGUAGE UNDERSTANDING:",
          "- Analyze user intent beyond keywords - understand what they actually want to accomplish",
          "- Dynamically detect required capabilities from available MCP servers and app tools",
          "- Identify entities: domains, timeframes, actions (compare, analyze, create, summarize)",
          "- Recognize language and respond accordingly",
          "- Adapt to new MCP tools automatically without hardcoded patterns",
          "",
          "🔄 MULTI-STEP ORCHESTRATION:",
          "- For complex queries requiring multiple data sources, ALWAYS follow this sequence:",
          "  1. DATA GATHERING: Use MCP tools first (Google Search Console, Google Ads, Analytics, etc.)",
          "  2. DATA PROCESSING: Analyze, compare, or transform the collected data if needed",
          "  3. WORKFLOW EXECUTION: Use workflows with the real data as input (never placeholder data)",
          "  4. FINAL OUTPUT: Present results with tables, charts, or summaries as requested",
          "- CRITICAL: Never skip data gathering steps - workflows need real data to function properly",
          "- Execute steps in logical dependency order - don't call tools with incomplete data",
          "- Chain tool outputs intelligently - use results from step N as inputs for step N+1",
          "- Automatically adapt to new MCP servers and their capabilities",
          "",
          "📊 EXAMPLE ORCHESTRATIONS:",
          "- 'compare Google Ads vs Search Console keywords' → Get Ads data → Get GSC data → Compare → Summarize",
          "- 'volume de recherche des mots-clés GSC vs Ads' → Get GSC data → Get Ads data → Run volume-de-recherche workflow → Present table",
          "- 'donne moi le volume de recherche des top mots-clés search console vs google ads' → Get Search Console data → Get Google Ads data → Run volume-de-recherche workflow → Create comparative table",
          "- 'web search Nike + create personas + generate images' → Web search → Define personas → Generate 4 images → Present results",
          "- 'Search Console data in table format' → Get GSC data → Create table → Present with insights",
          "",
          "🔑 CRITICAL SEQUENCING RULES:",
          "- ALWAYS gather data from MCP tools BEFORE running workflows that need that data",
          "- Workflows need real data as input - get it from relevant MCP servers first",
          "- Don't run workflows with placeholder data - ensure data dependencies are satisfied",
          "- Workflows can also generate data that feeds into subsequent MCP tool calls",
          "- Support bidirectional flow: MCP → Workflow → MCP or Workflow → MCP → Analysis",
          "- Automatically detect which MCP servers provide the required data types",
          "",
          "✅ EXECUTION RULES:",
          "- Always end with a comprehensive assistant text response that directly answers the user's question",
          "- Provide responses in the user's language (French if they wrote in French)",
          "- Include actionable insights, key findings, and next steps when relevant",
          "- For data queries, present results clearly with context and interpretation",
          "- Maximum 5 steps total - be efficient but thorough",
        ].join("\n");

        const forcedSummaryHint =
          "If a workflow was selected, you MUST invoke it in this turn unless inputs are ambiguous. After any tool/workflow calls, end the turn with a final assistant text answer that synthesizes outputs and directly answers the user's request in the user's language (FR if the user wrote in French). Be concise but complete. If the user asked 'qui est …', provide a short description and key facts with links if available.";
        
        // Determine if this is a complex query that would benefit from thinking mode
        const isComplexQuery = needsMultiStepOrchestration || 
                              selectedWorkflowMentions.length > 0 ||
                              Object.keys({ ...MCP_TOOLS, ...WORKFLOW_TOOLS }).length > 5;
            
            const systemPrompt = mergeSystemPrompt(
          buildUserSystemPrompt(session.user, userPreferences, effectiveAgent),
          buildMcpServerCustomizationsSystemPrompt(mcpServerCustomizations),
          forcedWorkflowHint,
          forcedMcpHint,
          orchestrationPolicy,
          forcedSummaryHint,
              !supportToolCall && buildToolCallUnsupportedModelSystemPrompt,
            (!supportToolCall ||
            ["openai", "anthropic"].includes(chatModel?.provider ?? "")) &&
            thinking &&
            isComplexQuery &&
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
            // Only add thinking tool for complex queries that would benefit from planning
            const allowThinkingTool = supportToolCall && thinking && isComplexQuery;
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

            // Prioritize exact-match mentions first, then fuzzy mentions, then app default tools, then others
            const toWorkflowToolKey = (human?: string) => {
              if (!human) return undefined;
              return String(human)
                .replace(/[^a-zA-Z0-9\s]/g, "")
                .trim()
                .replace(/\s+/g, "-")
                .toUpperCase();
            };
            const exactMentioned = new Set<string>();
            const fuzzyMentioned = new Set<string>();
            for (const m of (clientMentions || [])) {
              if (!m || !("type" in (m as any))) continue;
              if ((m as any).type === "mcpTool" || (m as any).type === "defaultTool") {
                if ((m as any).name) exactMentioned.add((m as any).name);
              } else if ((m as any).type === "workflow") {
                const key = toWorkflowToolKey((m as any).name || (m as any).description);
                if (key) exactMentioned.add(key);
              }
            }
            // Add fuzzy mentions captured earlier in runtime mentions (excluding exacts)
            for (const m of (mentions || [])) {
              if (!m || !("type" in (m as any))) continue;
              if ((m as any).type === "mcpTool" || (m as any).type === "defaultTool") {
                const name = (m as any).name;
                if (name && !exactMentioned.has(name)) fuzzyMentioned.add(name);
              } else if ((m as any).type === "workflow") {
                const key = toWorkflowToolKey((m as any).name || (m as any).description);
                if (key && !exactMentioned.has(key)) fuzzyMentioned.add(key);
              }
            }
            const appDefaultNames = new Set(Object.keys(APP_DEFAULT_TOOLS));
            const vizDefaultNames = new Set<string>([
              DefaultToolName.CreateTable,
              wantsVisualization ? DefaultToolName.CreateBarChart : "",
              wantsVisualization ? DefaultToolName.CreateLineChart : "",
              wantsVisualization ? DefaultToolName.CreatePieChart : "",
            ].filter(Boolean) as string[]);

            const exact = toolEntries.filter(([name]) => exactMentioned.has(name));
            const fuzzy = toolEntries.filter(([name]) => !exactMentioned.has(name) && fuzzyMentioned.has(name));
            const appDefaults = toolEntries.filter(
              ([name]) => !exactMentioned.has(name) && !fuzzyMentioned.has(name) && appDefaultNames.has(name),
            );
            const others = toolEntries.filter(
              ([name]) => !exactMentioned.has(name) && !fuzzyMentioned.has(name) && !appDefaultNames.has(name),
            );

            // If we have any matches (exact or fuzzy), filter down to those only, but always keep
            // default visualization table tool when the user asked for a table.
            if (exact.length + fuzzy.length > 0) {
              const allowedNames = new Set<string>([...exact.map(([n]) => n), ...fuzzy.map(([n]) => n)]);
              if (wantsTable) {
                for (const name of vizDefaultNames) allowedNames.add(name);
              }
              return Object.fromEntries(toolEntries.filter(([name]) => allowedNames.has(name)).slice(0, MAX_TOOLS));
            }

            // Otherwise keep priority order (others first, then app defaults) within cap to reduce default tool bias
            const prioritized = [...others, ...appDefaults].slice(0, MAX_TOOLS);
            return Object.fromEntries(prioritized);
          })
          .unwrap();

        // Detect ambiguity for selected workflow inputs (e.g., url/brief) and, if ambiguous,
        // avoid exposing that workflow tool this turn so the model asks a clarification first.
        let toolsForRun: Record<string, any> = vercelAITooles as Record<string, any>;
        let isSelectedWorkflowAmbiguous = false;
        try {
          const selectedMention = (selectedWorkflowMentions || [])[0] as any;
          if (selectedMention) {
            const toWorkflowToolKey = (human?: string) => {
              if (!human) return undefined;
              return String(human)
                .replace(/[^a-zA-Z0-9\s]/g, "")
                .trim()
                .replace(/\s+/g, "-")
                .toUpperCase();
            };
            const toolKey = toWorkflowToolKey(selectedMention.name || selectedMention.description);
            const tool = toolKey ? (toolsForRun as any)[toolKey] : undefined;
            if (tool && tool.parameters) {
              const shape = (tool.parameters as any)?._def?.shape?.() || (tool.parameters as any)?.shape;
              const hasUrlField = !!(shape && shape.url);
              const lastUser = [...messages].reverse().find((m) => m.role === "user");
              const parts: any[] = (lastUser?.parts as any[]) || [];
              const lastUserText = (parts.find((p) => p?.type === "text")?.text || parts[0]?.text || "").toString();
              // If brief/summary is required but the tool omitted it, we'll still proceed,
              // but the system hint already instructs to ask for confirmation, and the
              // tool parameter generation will default to using the latest user text.
              const extractUniqueDomains = (text?: string): string[] => {
                if (!text) return [];
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
                return Array.from(new Set(candidates.map((h) => h.toLowerCase())));
              };
              const uniqueDomains = extractUniqueDomains(lastUserText);
              const ambiguousUrl = hasUrlField && uniqueDomains.length !== 1;
              const ambiguous = ambiguousUrl; // long briefs are allowed; don't treat length as ambiguous
              if (ambiguous && toolKey && (toolKey in toolsForRun)) {
                isSelectedWorkflowAmbiguous = true;
                const entries = Object.entries(toolsForRun).filter(([name]) => name !== toolKey);
                toolsForRun = Object.fromEntries(entries);
              }
            }
          }
        } catch {}

        const allowedMcpTools = Object.values(allowedMcpServers ?? {})
          .map((t: AllowedMCPServer) => t.tools)
          .flat();

        // FUTURE-PROOF: Dynamic capability detection based on detected MCP servers and intents
        const detectedCapabilities: string[] = [];
        
        // Add capabilities from detected MCP servers
        logger.info(`🔍 MCP DETECTION: Found ${autoMcpMentions.length} auto MCP mentions: [${autoMcpMentions.map(m => m.displayName || m.name).join(', ')}]`);
        
        for (const mcpMention of autoMcpMentions) {
          const serverName = (mcpMention.displayName || mcpMention.name || '').toLowerCase();
          logger.info(`🔍 MCP SERVER ANALYSIS: "${serverName}"`);
          
          // Map server names to capability categories
          if (serverName.includes('search') || serverName.includes('console')) {
            detectedCapabilities.push('google-search-console');
            logger.info(`✅ DETECTED CAPABILITY: google-search-console from "${serverName}"`);
          }
          if (serverName.includes('ads') || serverName.includes('adwords')) {
            detectedCapabilities.push('google-ads');
            logger.info(`✅ DETECTED CAPABILITY: google-ads from "${serverName}"`);
          }
          if (serverName.includes('drive') || serverName.includes('workspace')) {
            detectedCapabilities.push('google-workspace');
            logger.info(`✅ DETECTED CAPABILITY: google-workspace from "${serverName}"`);
          }
          if (serverName.includes('analytics')) {
            detectedCapabilities.push('web-analytics');
            logger.info(`✅ DETECTED CAPABILITY: web-analytics from "${serverName}"`);
          }
          if (serverName.includes('shopify') || serverName.includes('ecommerce')) {
            detectedCapabilities.push('ecommerce');
            logger.info(`✅ DETECTED CAPABILITY: ecommerce from "${serverName}"`);
          }
          if (serverName.includes('github') || serverName.includes('git')) {
            detectedCapabilities.push('code-repository');
            logger.info(`✅ DETECTED CAPABILITY: code-repository from "${serverName}"`);
          }
          if (serverName.includes('slack') || serverName.includes('discord')) {
            detectedCapabilities.push('communication');
            logger.info(`✅ DETECTED CAPABILITY: communication from "${serverName}"`);
          }
          // Add more mappings as needed for future MCP servers
        }
        
        // Add traditional app default capabilities
        if (wantsWebSearch) detectedCapabilities.push('web-search');
        if (wantsImageGen) detectedCapabilities.push('seelab-text-to-image');
        if (wantsVisualization) detectedCapabilities.push('visualization');
        
        // ENHANCED FALLBACK: Always check for data source keywords when workflows are present
        // This ensures multi-step orchestration even if MCP auto-detection fails
        if (selectedWorkflowMentions.length > 0) {
          const queryLower = lastUserTextForMcp.toLowerCase();
          // Check for data source keywords that suggest MCP tools are needed
          if (queryLower.includes('search console') || queryLower.includes('gsc') || queryLower.includes('mots-clés')) {
            if (!detectedCapabilities.includes('google-search-console')) {
              detectedCapabilities.push('google-search-console');
              logger.info(`🔄 FALLBACK DETECTION: Added google-search-console capability`);
            }
          }
          if (queryLower.includes('google ads') || queryLower.includes('ads') || queryLower.includes('adwords')) {
            if (!detectedCapabilities.includes('google-ads')) {
              detectedCapabilities.push('google-ads');
              logger.info(`🔄 FALLBACK DETECTION: Added google-ads capability`);
            }
          }
          if (queryLower.includes('analytics') || queryLower.includes('ga')) {
            if (!detectedCapabilities.includes('web-analytics')) {
              detectedCapabilities.push('web-analytics');
              logger.info(`🔄 FALLBACK DETECTION: Added web-analytics capability`);
            }
          }
          // Check for comparison keywords that suggest multi-step processing
          if (queryLower.includes('vs') || queryLower.includes('compare') || queryLower.includes('comparatif')) {
            if (!detectedCapabilities.includes('data-comparison')) {
              detectedCapabilities.push('data-comparison');
              logger.info(`🔄 FALLBACK DETECTION: Added data-comparison capability for multi-step processing`);
            }
          }
        }
        
        // Remove duplicates
        const uniqueCapabilities = Array.from(new Set(detectedCapabilities));
        
        // FUTURE-PROOF: Multi-step orchestration detection for any MCP + workflow combination
        const hasDataSourceCapabilities = uniqueCapabilities.some(cap => 
          // Data source capabilities that need to be gathered before workflows
          ['google-ads', 'google-search-console', 'google-workspace', 'web-search', 'web-analytics', 'ecommerce', 'code-repository', 'communication', 'data-comparison'].includes(cap)
        );
        const hasWorkflowCapabilities = selectedWorkflowMentions.length > 0;
        const hasVisualizationCapabilities = uniqueCapabilities.includes('visualization');
        
        // Multi-step orchestration is needed when:
        // 1. Multiple capabilities are detected AND
        // 2. There are data sources that need to feed into workflows OR visualization
        // 3. OR there are workflows that might need follow-up MCP calls
        needsMultiStepOrchestration = (
          (uniqueCapabilities.length > 1) && 
          (
            (hasDataSourceCapabilities && (hasWorkflowCapabilities || hasVisualizationCapabilities)) ||
            (hasWorkflowCapabilities && hasDataSourceCapabilities)
          )
        );
        
        // CRITICAL FIX: When multi-step orchestration is needed, don't force workflow-only mode
        // This allows the model to gather MCP data first, then use workflows
        if (needsMultiStepOrchestration) {
          // Reset forceWorkflowOnly to allow proper orchestration
          // The model will still have access to the workflow but won't be forced to use it immediately
          forceWorkflowOnly = false;
          logger.info(
            `🔄 MULTI-STEP ORCHESTRATION: Disabling workflow-only mode to allow data gathering first. Workflow will be available after MCP data collection.`,
          );
        }
        
        logger.info(
          `🧠 INTELLIGENT ORCHESTRATION: detected capabilities [${uniqueCapabilities.join(', ')}] from query: "${lastUserTextForMcp.substring(0, 100)}${lastUserTextForMcp.length > 100 ? '...' : ''}"`,
        );
        
        logger.info(
          `🔍 ORCHESTRATION ANALYSIS: hasDataSource=${hasDataSourceCapabilities}, hasWorkflow=${hasWorkflowCapabilities}, hasVisualization=${hasVisualizationCapabilities}, needsMultiStep=${needsMultiStepOrchestration}`,
        );
        
        logger.info(
          `🎯 WORKFLOW FORCING: forceWorkflowOnly=${forceWorkflowOnly}, selectedWorkflowMentions=${selectedWorkflowMentions.length}, workflowNames=[${selectedWorkflowMentions.map(w => w.name).join(', ')}]`,
        );
        
        logger.info(
          `🔧 FINAL DECISION: shouldForceWorkflowOnly will be ${forceWorkflowOnly && !needsMultiStepOrchestration}, maxSteps will be ${needsMultiStepOrchestration ? 6 : (forceWorkflowOnly && !needsMultiStepOrchestration) ? 3 : 5}`,
        );
        
        logger.info(
          `🧠 THINKING MODE: thinking=${thinking}, isComplexQuery=${isComplexQuery}, willUseThinking=${thinking && isComplexQuery}`,
        );

        if (needsMultiStepOrchestration) {
          logger.info(
            `🔄 MULTI-STEP ORCHESTRATION: Detected need for data gathering before workflow execution. Will not force workflow-only mode.`,
          );
        }

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

        // Always allow the model to choose when to call tools so it can finish with a text answer
        // Use 'auto' to avoid rare stalls after a tool call; we narrow tools to the selected workflow
        const toolChoiceForRun: "auto" | "required" = "auto";

        // When forcing workflows, allow as many steps as the number of distinct explicitly-mentioned workflows (cap to 10)
        // Let the model take as many steps as it needs; do not cap maxSteps

        // UPDATED LOGIC: Only force workflow-only mode for simple queries without multi-step orchestration
        const shouldForceWorkflowOnly = forceWorkflowOnly && !isSelectedWorkflowAmbiguous && !needsMultiStepOrchestration;
        
        if (shouldForceWorkflowOnly) {
          // Only force workflow-only for simple single-capability queries
          logger.info(`🎯 FORCING WORKFLOW-ONLY MODE: Simple query detected, restricting to workflow tool only`);
          try {
            const selectedMention = (selectedWorkflowMentions || [])[0] as any;
            const toWorkflowToolKey = (human?: string) => {
              if (!human) return undefined;
              return String(human)
                .replace(/[^a-zA-Z0-9\s]/g, "")
                .trim()
                .replace(/\s+/g, "-")
                .toUpperCase();
            };
            const toolKey = toWorkflowToolKey(selectedMention?.name || selectedMention?.description);
            if (toolKey && (toolsForRun as any)[toolKey]) {
              toolsForRun = { [toolKey]: (toolsForRun as any)[toolKey] } as Record<string, any>;
            }
          } catch {}
        } else if (needsMultiStepOrchestration) {
          // For multi-step orchestration, ensure all tools are available for proper sequencing
          logger.info(`🔄 MULTI-STEP MODE: Keeping all tools available for orchestrated execution`);
        }

        // Allow the model to orchestrate multiple steps across tools/workflows as needed
        const maxStepsForRun = needsMultiStepOrchestration ? 6 : 
                              shouldForceWorkflowOnly ? 3 : 5;

        // Post-process: if the selected tool expects a 'client_name' parameter,
        // only derive it from an explicit 'url' field or the active agent's name.
        // Never infer from free text.
        const augmentToolsWithClientName = (tools: Record<string, any>): Record<string, any> => {
          const wrapped: Record<string, any> = {};
          for (const [name, tool] of Object.entries(tools)) {
            const originalExecute = (tool as any)?.execute;
            if (typeof originalExecute === "function") {
              // Check if this tool actually expects a client_name parameter
              const toolSchema = (tool as any)?.parameters;
              const hasClientNameParam = toolSchema && 
                ((toolSchema.properties && toolSchema.properties.client_name) ||
                 (toolSchema._def?.shape && toolSchema._def.shape().client_name));
              
              if (!hasClientNameParam) {
                // Tool doesn't expect client_name, don't modify it
                wrapped[name] = tool;
                continue;
              }

              wrapped[name] = {
                ...tool,
                execute: async (args: any, ctx: any) => {
                  const nextArgs = args && typeof args === "object"
                    ? { ...args }
                    : {};
                  // Prefer client_name derived from explicit args.url when present; else from agent name
                  const deriveDomainFromUrl = (maybeUrl: any): string | undefined => {
                    try {
                      if (typeof maybeUrl !== "string" || maybeUrl.trim().length === 0) return undefined;
                      const raw = maybeUrl.trim();
                      const url = raw.startsWith("http") ? new URL(raw) : new URL(`https://${raw}`);
                      return url.hostname.replace(/^www\./i, "");
                    } catch {
                      return undefined;
                    }
                  };
                  // Deep-scan args for any url fields to derive a consistent domain
                  const collectDomainsFromArgs = (obj: any): string[] => {
                    const domains: string[] = [];
                    const visit = (v: any) => {
                      if (!v || typeof v !== "object") return;
                      for (const entry of Object.entries(v)) {
                        const val = entry[1];
                        if (typeof val === "string") {
                          const d = deriveDomainFromUrl(val);
                          if (d) domains.push(d);
                        } else if (val && typeof val === "object") {
                          visit(val);
                        }
                      }
                    };
                    visit(obj);
                    return Array.from(new Set(domains.map((d) => d.toLowerCase())));
                  };
                  const deepDomains = collectDomainsFromArgs(nextArgs);
                  const topUrlDomain = deriveDomainFromUrl((nextArgs as any)?.url);
                  const domainFromArgs = topUrlDomain || (deepDomains.length === 1 ? deepDomains[0] : undefined);
                  const fromAgentName = (agent && (agent as any).name)
                    ? String((agent as any).name).trim()
                    : undefined;
                  // Prefer URL/domain from args; otherwise use explicitly selected agent. No prompt inference.
                  const candidate = domainFromArgs || fromAgentName;
                  const enforceClientNameDeep = (obj: any, value: string | undefined) => {
                    const stack: any[] = [obj];
                    while (stack.length) {
                      const cur = stack.pop();
                      if (!cur || typeof cur !== "object") continue;
                      for (const key of Object.keys(cur)) {
                        const v = (cur as any)[key];
                        if (key === "client_name") {
                          if (value) {
                            (cur as any)[key] = value;
                          } else {
                            delete (cur as any)[key];
                          }
                          continue;
                        }
                        if (v && typeof v === "object") stack.push(v);
                      }
                    }
                  };
                  // Enforce everywhere; then also ensure top-level presence when candidate exists
                  enforceClientNameDeep(nextArgs, candidate);
                  if (candidate) {
                    const existing = (nextArgs as any)?.client_name;
                    if (existing == null || String(existing).trim().length === 0) {
                      (nextArgs as any).client_name = candidate;
                    }
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
          // Keep tool-chaining bounded for responsiveness
          maxSteps: maxStepsForRun,
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

              // Ensure there is a final assistant text answer even if the model omitted one
              const hasTextAnswer = (dedupParts as any[]).some(
                (p) => p?.type === "text" && typeof p?.text === "string" && p.text.trim().length > 0,
              );
              let finalParts = dedupParts as UIMessage["parts"];
              if (!hasTextAnswer) {
                // Build a minimal fallback answer based on detected tool outputs
                const lastUser = [...messages].reverse().find((m) => m.role === "user");
                const lastUserText = (() => {
                  const parts: any[] = (lastUser?.parts as any[]) || [];
                  const t = parts.find((p) => p?.type === "text")?.text || parts[0]?.text;
                  return typeof t === "string" ? t : "";
                })().toLowerCase();

                const isFrench = /\b(le|la|les|un|une|des|de|du|et|ou|qui|est|tableau|recherche)\b/.test(
                  lastUserText,
                );
                const mk = (fr: string, en: string) => (isFrench ? fr : en);

                // Try to extract a few links from web search results if present
                const links: string[] = [];
                for (const p of finalParts as any) {
                  if (
                    p?.type === "tool-invocation" &&
                    p?.toolInvocation?.state === "result" &&
                    typeof p?.toolInvocation?.toolName === "string"
                  ) {
                    const r = p.toolInvocation.result;
                    const candidates: any[] = ([] as any[])
                      .concat((r?.results as any[]) || [])
                      .concat((r?.items as any[]) || [])
                      .concat((r?.documents as any[]) || [])
                      .concat((r?.data as any[]) || []);
                    for (const c of candidates) {
                      const url = c?.url || c?.link || c?.source || c?.href;
                      if (typeof url === "string" && url.startsWith("http")) {
                        links.push(url);
                        if (links.length >= 3) break;
                      }
                    }
                    if (links.length >= 3) break;
                  }
                }

                const tableMentioned = /\btable\b|\btableau(x)?\b|\btabular\b|\bcsv\b/i.test(
                  lastUserText,
                );

                const summaryLines: string[] = [];
                if (links.length > 0) {
                  summaryLines.push(mk("Sources:", "Sources:"));
                  summaryLines.push(...links.map((u) => `- ${u}`));
                }
                if (tableMentioned) {
                  summaryLines.push(
                    mk(
                      "Un tableau interactif est disponible ci-dessus. Dites-moi si vous souhaitez des colonnes supplémentaires ou un autre format.",
                      "An interactive table is available above. Tell me if you want extra columns or a different format.",
                    ),
                  );
                }
                const fallbackText =
                  summaryLines.join("\n") ||
                  mk(
                    "Voici un bref résumé des résultats. Souhaitez-vous que je développe ou que je formate différemment ?",
                    "Here is a brief summary of the results. Would you like me to expand or format differently?",
                  );

                finalParts = [
                  ...finalParts,
                  { type: "text", text: fallbackText } as any,
                ] as UIMessage["parts"];
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
                parts: (finalParts as UIMessage["parts"]).map(
                  (v) => {
                    // Normalize displayed tool args to reflect enforced client_name rules (only for tools that expect client_name)
                    if (
                      v.type == "tool-invocation" &&
                      v.toolInvocation &&
                      typeof (v as any).toolInvocation.args === "object"
                    ) {
                      try {
                        const toolName = (v as any).toolInvocation.toolName;
                        const tool = toolsForRunAugmented[toolName];
                        const toolSchema = tool?.parameters;
                        const hasClientNameParam = toolSchema && 
                          ((toolSchema.properties && toolSchema.properties.client_name) ||
                           (toolSchema._def?.shape && toolSchema._def.shape().client_name));
                        
                        if (!hasClientNameParam) {
                          // Tool doesn't expect client_name, don't normalize
                          return v;
                        }

                        const normalizeArgs = (inputArgs: any): any => {
                          const next = inputArgs && typeof inputArgs === "object" ? { ...inputArgs } : {};
                          const deriveDomainFromUrl = (maybeUrl: any): string | undefined => {
                            try {
                              if (typeof maybeUrl !== "string" || maybeUrl.trim().length === 0) return undefined;
                              const raw = maybeUrl.trim();
                              const url = raw.startsWith("http") ? new URL(raw) : new URL(`https://${raw}`);
                              return url.hostname.replace(/^www\./i, "");
                            } catch {
                              return undefined;
                            }
                          };
                          const collectDomainsFromArgs = (obj: any): string[] => {
                            const domains: string[] = [];
                            const visit = (v: any) => {
                              if (!v || typeof v !== "object") return;
                              for (const entry of Object.entries(v)) {
                                const key = entry[0];
                                const val = entry[1];
                                if (key === "url" && typeof val === "string") {
                                  const d = deriveDomainFromUrl(val);
                                  if (d) domains.push(d);
                                } else if (val && typeof val === "object") {
                                  visit(val);
                                }
                              }
                            };
                            visit(obj);
                            return Array.from(new Set(domains.map((d) => d.toLowerCase())));
                          };
                          const deepDomains = collectDomainsFromArgs(next);
                          const topUrlDomain = deriveDomainFromUrl((next as any)?.url);
                          const domainFromArgs = topUrlDomain || (deepDomains.length === 1 ? deepDomains[0] : undefined);
                          const fromAgentName = (agent && (agent as any).name) ? String((agent as any).name).trim() : undefined;
                          const candidate = domainFromArgs || fromAgentName;
                          const enforceClientNameDeep = (obj: any, value: string | undefined) => {
                            const stack: any[] = [obj];
                            while (stack.length) {
                              const cur = stack.pop();
                              if (!cur || typeof cur !== "object") continue;
                              for (const key of Object.keys(cur)) {
                                const val = (cur as any)[key];
                                if (key === "client_name") {
                                  if (value) {
                                    (cur as any)[key] = value;
                                  } else {
                                    delete (cur as any)[key];
                                  }
                                  continue;
                                }
                                if (val && typeof val === "object") stack.push(val);
                              }
                            }
                          };
                          if (!candidate) enforceClientNameDeep(next, undefined);
                          if (candidate) {
                            enforceClientNameDeep(next, candidate);
                            if (next.client_name == null || String(next.client_name).trim().length === 0) {
                              next.client_name = candidate;
                            }
                          }
                          return next;
                        };
                        return {
                          ...v,
                          toolInvocation: {
                            ...v.toolInvocation,
                            args: normalizeArgs((v as any).toolInvocation.args),
                          },
                        } as any;
                      } catch {}
                    }
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
