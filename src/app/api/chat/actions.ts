"use server";

import {
  generateObject,
  generateText,
  jsonSchema,
  LanguageModel,
  type Message,
} from "ai";

import { CREATE_THREAD_TITLE_PROMPT } from "lib/ai/prompts";

import type { ChatThread, Project } from "app-types/chat";

import { getMockUserSession } from "lib/mock";

import { chatService } from "lib/db/chat-service";
import { customModelProvider } from "lib/ai/models";
import { toAny } from "lib/utils";
import { MCPToolInfo } from "app-types/mcp";

const {
  deleteThread,
  deleteMessagesByChatIdAfterTimestamp,
  selectMessagesByThreadId,
  selectThread,
  selectThreadsByUserId,
  updateThread,
  deleteAllThreads,
  selectProjectsByUserId,
  insertProject,
  selectProjectById,
  updateProject,
  deleteProject,
} = chatService;

export async function generateTitleFromUserMessageAction({
  message,
  model,
}: { message: Message; model: LanguageModel }) {
  const { text: title } = await generateText({
    model,
    system: CREATE_THREAD_TITLE_PROMPT,
    prompt: JSON.stringify(message),
  });

  return title.trim();
}

export async function selectThreadWithMessagesAction(threadId: string) {
  const thread = await selectThread(threadId);
  if (!thread) {
    return null;
  }
  const messages = await selectMessagesByThreadId(threadId);
  return { ...thread, messages: messages ?? [] };
}

export async function deleteThreadAction(threadId: string) {
  await deleteThread(threadId);
}

export async function deleteMessagesByChatIdAfterTimestampAction(
  messageId: string,
) {
  await deleteMessagesByChatIdAfterTimestamp(messageId);
}

export async function selectThreadListByUserIdAction() {
  const userId: string = getMockUserSession().id;
  const threads = await selectThreadsByUserId(userId);
  return threads;
}

export async function updateThreadAction(
  id: string,
  thread: Partial<Omit<ChatThread, "createdAt" | "updatedAt" | "userId">>,
) {
  await updateThread(id, { ...thread, userId: getMockUserSession().id });
}

export async function deleteAllThreadsAction() {
  const userId: string = getMockUserSession().id;
  await deleteAllThreads(userId);
}

export async function generateExampleToolSchemaAction(options: {
  modelName: string;
  toolInfo: MCPToolInfo;
  prompt?: string;
}) {
  const model = customModelProvider.getModel(options.modelName);

  const schema = jsonSchema(
    toAny({
      ...options.toolInfo.inputSchema,
      properties: options.toolInfo.inputSchema?.properties ?? {},
      additionalProperties: false,
    }),
  );
  const { object } = await generateObject({
    model,
    schema,
    prompt: `
You are given a tool with the following details:
- Tool Name: ${options.toolInfo.name}
- Tool Description: ${options.toolInfo.description}

${
  options.prompt ||
  `
Step 1: Create a realistic example question or scenario that a user might ask to use this tool.
Step 2: Based on that question, generate a valid JSON input object that matches the input schema of the tool.
`.trim()
}
`.trim(),
  });

  return object;
}

export async function selectProjectListByUserIdAction() {
  const userId: string = getMockUserSession().id;
  const projects = await selectProjectsByUserId(userId);
  return projects;
}

export async function insertProjectAction({ name }: { name: string }) {
  const userId: string = getMockUserSession().id;
  const project = await insertProject({ name, userId, instructions: [] });
  return project;
}

export async function selectProjectByIdAction(id: string) {
  const project = await selectProjectById(id);
  return project;
}

export async function updateProjectAction(
  id: string,
  project: Partial<Pick<Project, "name" | "instructions">>,
) {
  const updatedProject = await updateProject(id, project);
  return updatedProject;
}

export async function deleteProjectAction(id: string) {
  await deleteProject(id);
}
