import {
  appendResponseMessages,
  createDataStreamResponse,
  smoothStream,
  streamText,
  tool as createTool,
  Tool,
  type UIMessage,
} from "ai";

import {
  generateTitleFromUserMessageAction,
  rememberProjectInstructionsAction,
} from "@/app/api/chat/actions";
import { customModelProvider, isToolCallUnsupportedModel } from "lib/ai/models";

import { getMockUserSession } from "lib/mock";
import { mcpClientsManager } from "../mcp/mcp-manager";

import { chatService } from "lib/db/chat-service";
import logger from "logger";
import { SYSTEM_TIME_PROMPT } from "lib/ai/prompts";
import { ChatMessageAnnotation } from "app-types/chat";
import { generateUUID, objectFlow } from "lib/utils";
import { z } from "zod";

const { insertMessage, insertThread, selectThread } = chatService;

export const maxDuration = 120;

const requestBodySchema = z.object({
  id: z.string().optional(),
  messages: z.array(z.any()),
  model: z.string(),
  projectId: z.string().optional(),
  action: z.enum(["update-assistant", ""]).optional(),
  activeTool: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const {
      id,
      messages,
      model: modelName,
      action,
      projectId,
      activeTool,
    } = requestBodySchema.parse(json);

    let thread = id ? await selectThread(id) : null;

    const userId = getMockUserSession().id;

    const message = messages
      .filter((message) => message.role === "user")
      .at(-1);

    if (!message) {
      return new Response("No user message found", { status: 400 });
    }

    if (!thread) {
      const title = await generateTitleFromUserMessageAction({
        message,
        model: customModelProvider.getModel(modelName),
      });

      thread = await insertThread({
        title,
        id: id ?? generateUUID(),
        userId,
        projectId: projectId ?? null,
      });
    }

    const projectInstructions = projectId
      ? await rememberProjectInstructionsAction(projectId)
      : null;

    const annotations: ChatMessageAnnotation[] =
      (message.annotations as ChatMessageAnnotation[]) ?? [];

    const requiredToolsAnnotations = annotations
      .flatMap((annotation) => annotation.requiredTools)
      .filter(Boolean) as string[];

    const mcpTools = mcpClientsManager.tools();

    const model = customModelProvider.getModel(modelName);

    const systemPrompt = mergeSystemPrompt(
      SYSTEM_TIME_PROMPT,
      projectInstructions?.systemPrompt,
    );

    const isToolCallAllowed = !isToolCallUnsupportedModel(model) && activeTool;

    const tools = isToolCallAllowed
      ? filterToolsByMentions(requiredToolsAnnotations, mcpTools)
      : undefined;

    return createDataStreamResponse({
      execute: (dataStream) => {
        const result = streamText({
          model,
          system: systemPrompt,
          messages,
          maxSteps: 10,
          experimental_transform: smoothStream({ chunking: "word" }),
          tools,
          toolChoice: !activeTool ? "none" : "auto",
          onFinish: async ({ response, usage }) => {
            const [, assistantMessage] = appendResponseMessages({
              messages: [message],
              responseMessages: response.messages,
            });
            if (action !== "update-assistant") {
              await insertMessage({
                threadId: thread.id,
                model: null,
                role: "user",
                parts: message.parts,
                attachments: [],
                id: message.id,
                annotations: appendAnnotations(message.annotations, {
                  usageTokens: usage.promptTokens,
                }),
              });
            }

            await insertMessage({
              model: modelName,
              threadId: thread.id,
              role: "assistant",
              id: assistantMessage.id,
              parts: assistantMessage.parts as UIMessage["parts"],
              attachments: [],
              annotations: appendAnnotations(assistantMessage.annotations, {
                usageTokens: usage.completionTokens,
              }),
            });
          },
        });
        result.consumeStream();
        result.mergeIntoDataStream(dataStream, {
          sendReasoning: true,
        });
      },
      onError: (error: any) => {
        logger.error(error);
        return JSON.stringify(error) || "Oops, an error occured!";
      },
    });
  } catch (error: any) {
    logger.error(error);
    return new Response(error.message || "Oops, an error occured!", {
      status: 500,
    });
  }
}

function filterToolsByMentions(
  mentions: string[],
  tools: Record<string, Tool>,
) {
  if (mentions.length === 0) {
    return tools;
  }
  return objectFlow(tools).filter((_tool, key) =>
    mentions.some((mention) => key.startsWith(mention)),
  );
}

// function disableToolExecution(
//   tool: Record<string, Tool>,
// ): Record<string, Tool> {
//   return objectFlow(tool).map((value) => {
//     return createTool({
//       parameters: value.parameters,
//       description: value.description,
//     });
//   });
// }

function appendAnnotations(
  annotations: any[] = [],
  annotationsToAppend: ChatMessageAnnotation[] | ChatMessageAnnotation,
): ChatMessageAnnotation[] {
  const newAnnotations = Array.isArray(annotationsToAppend)
    ? annotationsToAppend
    : [annotationsToAppend];
  return [...annotations, ...newAnnotations];
}

function mergeSystemPrompt(...prompts: (string | undefined)[]) {
  return prompts
    .map((prompt) => prompt?.trim())
    .filter(Boolean)
    .join("\n\n---\n\n");
}
