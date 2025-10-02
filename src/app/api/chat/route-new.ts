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
import { agentRepository, chatRepository } from "lib/db/repository";
import type { AllowedMCPServer } from "app-types/mcp";
import globalLogger from "logger";
import {
  buildUserSystemPrompt,
  buildToolCallUnsupportedModelSystemPrompt,
} from "lib/ai/prompts";
import { chatApiSchemaRequestBodySchema } from "app-types/chat";
import { errorIf, safe } from "ts-safe";
import {
  appendAnnotations,
  handleError,
  mergeSystemPrompt,
  convertToMessage,
} from "./shared.chat";
import {
  rememberAgentAction,
} from "./actions";
import { getSession } from "auth/server";
import { colorize } from "consola/utils";
import { compressPdfAttachmentsIfNeeded } from "lib/pdf/compress";
import { ChatOrchestrator } from "lib/ai/orchestration";
import type { OrchestrationContext } from "lib/ai/orchestration";

const logger = globalLogger.withDefaults({
  message: colorize("blackBright", `Chat API (New): `),
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
      allowedMcpServers,
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

    // Load agent if mentioned
    const agentId = mentions.find((m) => m.type === "agent")?.agentId;
    const agent = await rememberAgentAction(agentId, session.user.id);

    // Merge agent attachments into the user message
    const agentAttachments = (agent?.instructions as any)?.attachments as any[] | undefined;
    const mergedAttachments = Array.isArray(agentAttachments)
      ? [
          ...(((patchedMessage as any).experimental_attachments as any[]) || []),
          ...agentAttachments,
        ]
      : ((patchedMessage as any).experimental_attachments as any[] | undefined);

    const finalPatchedMessage: UIMessage = mergedAttachments && mergedAttachments.length > 0
      ? {
          ...(patchedMessage as any),
          experimental_attachments: await compressPdfAttachmentsIfNeeded(mergedAttachments as any),
        }
      : patchedMessage;

    const previousMessages = (thread?.messages ?? []).map(convertToMessage);

    const messages: Message[] = appendClientMessage({
      messages: previousMessages,
      message: finalPatchedMessage,
    });

    const supportToolCall = !isToolCallUnsupportedModel(model);

    // Extract user query from the latest message
    const userQuery = extractUserQuery(finalPatchedMessage);
    
    logger.info(`Processing query: "${userQuery}"`);

    // Persist the user's message immediately
    try {
      await chatRepository.upsertMessage({
        threadId: thread!.id,
        model: chatModel?.model ?? null,
        role: "user",
        parts: finalPatchedMessage.parts as any,
        attachments: (finalPatchedMessage as any).experimental_attachments,
        id: message.id,
        annotations: appendAnnotations(
          message.annotations,
          agent ? [{ agentId: agent.id }] : [],
        ),
      });
    } catch (e) {
      logger.warn("Failed to upsert user message pre-stream", e as any);
    }

    return createDataStreamResponse({
      execute: async (dataStream) => {
        try {
          // Create orchestration context
          const orchestrationContext: OrchestrationContext = {
            userId: session.user.id,
            sessionId: thread!.id,
            availableCapabilities: [], // Will be populated by orchestrator
            previousMessages: messages,
            userPreferences: thread?.userPreferences || undefined,
            agent: agent || undefined,
          };

          // Initialize orchestrator
          const orchestrator = new ChatOrchestrator(chatModel);

          if (supportToolCall && userQuery.trim().length > 0) {
            // Use new orchestration system for complex queries
            logger.info("Using new orchestration system");
            
            const orchestrationResult = await orchestrator.orchestrate(
              userQuery,
              orchestrationContext,
              dataStream
            );

            // Stream the final response
            const result = streamText({
              model,
              system: buildUserSystemPrompt(session.user, orchestrationContext.userPreferences, agent),
              messages: [
                ...messages,
                {
                  role: "assistant",
                  content: orchestrationResult.finalResponse,
                }
              ],
              temperature: 0.7,
              experimental_transform: smoothStream({ chunking: "word" }),
              maxRetries: 2,
              abortSignal: request.signal,
              onFinish: async ({ response, usage }) => {
                const appendMessages = appendResponseMessages({
                  messages: messages.slice(-1),
                  responseMessages: response.messages,
                });

                const assistantMessage = appendMessages.at(-1);
                if (assistantMessage) {
                  const annotations = appendAnnotations(
                    assistantMessage.annotations,
                    [
                      { usageTokens: usage.completionTokens },
                      ...(agent ? [{ agentId: agent.id }] : []),
                    ],
                  );
                  
                  dataStream.writeMessageAnnotation(annotations.at(-1)!);
                  
                  await chatRepository.upsertMessage({
                    model: chatModel?.model ?? null,
                    threadId: thread!.id,
                    role: assistantMessage.role,
                    id: assistantMessage.id,
                    parts: assistantMessage.parts as UIMessage["parts"],
                    attachments: assistantMessage.experimental_attachments,
                    annotations,
                  });
                }

                if (agent) {
                  await agentRepository.updateAgent(agent.id, session.user.id, {
                    updatedAt: new Date(),
                  } as any);
                }
              },
            });

            result.consumeStream();
            result.mergeIntoDataStream(dataStream, {
              sendReasoning: true,
            });

            result.usage.then((usage) => {
              logger.debug(
                `usage input: ${usage.promptTokens}, usage output: ${usage.completionTokens}, usage total: ${usage.totalTokens}`,
              );
            });

          } else {
            // Fallback to simple LLM response for unsupported models or simple queries
            logger.info("Using fallback LLM response");
            
            const systemPrompt = mergeSystemPrompt(
              buildUserSystemPrompt(session.user, orchestrationContext.userPreferences, agent),
              !supportToolCall && buildToolCallUnsupportedModelSystemPrompt,
            );

            const result = streamText({
              model,
              system: systemPrompt,
              messages,
              temperature: 0.7,
              experimental_transform: smoothStream({ chunking: "word" }),
              maxRetries: 2,
              abortSignal: request.signal,
              onFinish: async ({ response, usage }) => {
                const appendMessages = appendResponseMessages({
                  messages: messages.slice(-1),
                  responseMessages: response.messages,
                });

                const assistantMessage = appendMessages.at(-1);
                if (assistantMessage) {
                  const annotations = appendAnnotations(
                    assistantMessage.annotations,
                    [
                      { usageTokens: usage.completionTokens },
                      ...(agent ? [{ agentId: agent.id }] : []),
                    ],
                  );
                  
                  dataStream.writeMessageAnnotation(annotations.at(-1)!);
                  
                  await chatRepository.upsertMessage({
                    model: chatModel?.model ?? null,
                    threadId: thread!.id,
                    role: assistantMessage.role,
                    id: assistantMessage.id,
                    parts: assistantMessage.parts as UIMessage["parts"],
                    attachments: assistantMessage.experimental_attachments,
                    annotations,
                  });
                }

                if (agent) {
                  await agentRepository.updateAgent(agent.id, session.user.id, {
                    updatedAt: new Date(),
                  } as any);
                }
              },
            });

            result.consumeStream();
            result.mergeIntoDataStream(dataStream, {
              sendReasoning: true,
            });

            result.usage.then((usage) => {
              logger.debug(
                `usage input: ${usage.promptTokens}, usage output: ${usage.completionTokens}, usage total: ${usage.totalTokens}`,
              );
            });
          }
        } catch (error) {
          logger.error("Orchestration failed, falling back to simple response:", error);
          
          // Fallback to simple LLM response on orchestration failure
          const systemPrompt = buildUserSystemPrompt(session.user, orchestrationContext.userPreferences, agent);

          const result = streamText({
            model,
            system: systemPrompt,
            messages,
            temperature: 0.7,
            experimental_transform: smoothStream({ chunking: "word" }),
            maxRetries: 2,
            abortSignal: request.signal,
          });

          result.consumeStream();
          result.mergeIntoDataStream(dataStream, {
            sendReasoning: true,
          });
        }
      },
      onError: handleError,
    });
  } catch (error: any) {
    logger.error(error);
    return Response.json({ message: error.message }, { status: 500 });
  }
}

function extractUserQuery(message: UIMessage): string {
  const parts = (message as any)?.parts as any[] | undefined;
  if (Array.isArray(parts) && parts.length > 0) {
    return parts
      .map((p) => (typeof (p as any)?.text === "string" ? (p as any).text : ""))
      .filter(Boolean)
      .join(" ");
  }
  const content = (message as any)?.content;
  return typeof content === "string" ? content : "";
}
