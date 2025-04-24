import type {
  ChatMessage,
  ChatService,
  ChatThread,
  Project,
} from "app-types/chat";
import {
  ChatMessageSchema,
  ChatThreadSchema,
  ProjectSchema,
} from "./schema.pg";
import { pgDb as db } from "./db.pg";
import { and, desc, eq, gte, sql } from "drizzle-orm";

export const pgChatService: ChatService = {
  insertThread: async (
    thread: PartialBy<ChatThread, "id" | "createdAt">,
  ): Promise<ChatThread> => {
    const result = await db
      .insert(ChatThreadSchema)
      .values({
        ...thread,
        createdAt: thread.createdAt || new Date(),
      })
      .returning();
    return result[0];
  },

  selectThread: async (id: string): Promise<ChatThread | null> => {
    const result = await db
      .select()
      .from(ChatThreadSchema)
      .where(eq(ChatThreadSchema.id, id));
    return result[0] ? result[0] : null;
  },

  selectMessagesByThreadId: async (
    threadId: string,
  ): Promise<ChatMessage[]> => {
    const result = await db
      .select()
      .from(ChatMessageSchema)
      .where(eq(ChatMessageSchema.threadId, threadId))
      .orderBy(ChatMessageSchema.createdAt);
    return result as ChatMessage[];
  },

  selectThreadsByUserId: async (userId: string): Promise<ChatThread[]> => {
    const threadWithLatestMessage = await db
      .select({
        threadId: ChatThreadSchema.id,
        title: ChatThreadSchema.title,
        createdAt: ChatThreadSchema.createdAt,
        userId: ChatThreadSchema.userId,
        projectId: ChatThreadSchema.projectId,
        lastMessageAt: sql<string>`MAX(${ChatMessageSchema.createdAt})`.as(
          "last_message_at",
        ),
      })
      .from(ChatThreadSchema)
      .leftJoin(
        ChatMessageSchema,
        eq(ChatThreadSchema.id, ChatMessageSchema.threadId),
      )
      .where(eq(ChatThreadSchema.userId, userId))
      .groupBy(
        ChatThreadSchema.id,
        ChatThreadSchema.title,
        ChatThreadSchema.createdAt,
      )
      .orderBy(desc(sql`last_message_at`));

    return threadWithLatestMessage.map((row) => {
      return {
        id: row.threadId,
        title: row.title,
        userId: row.userId,
        createdAt: row.createdAt,
        projectId: row.projectId,
      };
    });
  },

  updateThread: async (
    id: string,
    thread: PartialBy<ChatThread, "id" | "createdAt">,
  ): Promise<ChatThread> => {
    const entity = {
      ...thread,
      id,
    } as ChatThread;
    const result = await db
      .update(ChatThreadSchema)
      .set(entity)
      .where(eq(ChatThreadSchema.id, id))
      .returning();
    return result[0];
  },

  deleteThread: async (id: string): Promise<void> => {
    await db
      .delete(ChatMessageSchema)
      .where(eq(ChatMessageSchema.threadId, id));
    await db.delete(ChatThreadSchema).where(eq(ChatThreadSchema.id, id));
  },

  insertMessage: async (
    message: PartialBy<ChatMessage, "id" | "createdAt">,
  ): Promise<ChatMessage> => {
    const entity = {
      ...message,
      createdAt: message.createdAt || new Date(),
      id: message.id,
    };
    const result = await db
      .insert(ChatMessageSchema)
      .values(entity)
      .returning();
    return result[0] as ChatMessage;
  },

  deleteMessagesByChatIdAfterTimestamp: async (
    messageId: string,
  ): Promise<void> => {
    const [message] = await db
      .select()
      .from(ChatMessageSchema)
      .where(eq(ChatMessageSchema.id, messageId));
    if (!message) {
      return;
    }
    // Delete messages that are in the same thread AND created before or at the same time as the target message
    await db
      .delete(ChatMessageSchema)
      .where(
        and(
          eq(ChatMessageSchema.threadId, message.threadId),
          gte(ChatMessageSchema.createdAt, message.createdAt),
        ),
      );
  },
  deleteAllThreads: async (userId: string): Promise<void> => {
    await db
      .delete(ChatThreadSchema)
      .where(eq(ChatThreadSchema.userId, userId));
  },

  insertProject: async (
    project: Omit<Project, "id" | "createdAt" | "updatedAt">,
  ): Promise<Project> => {
    const result = await db
      .insert(ProjectSchema)
      .values({
        ...project,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return result[0] as Project;
  },

  selectProject: async (id: string): Promise<Project | null> => {
    const result = await db
      .select()
      .from(ProjectSchema)
      .where(eq(ProjectSchema.id, id));
    return result[0] ? (result[0] as Project) : null;
  },

  selectProjectsByUserId: async (userId: string): Promise<Project[]> => {
    const result = await db
      .select()
      .from(ProjectSchema)
      .where(eq(ProjectSchema.userId, userId));
    return result as Project[];
  },

  selectProjectThreads: async (projectId: string): Promise<ChatThread[]> => {
    const result = await db
      .select()
      .from(ChatThreadSchema)
      .where(eq(ChatThreadSchema.projectId, projectId));
    return result as ChatThread[];
  },

  updateProject: async (
    id: string,
    project: Omit<Project, "id" | "createdAt" | "updatedAt">,
  ): Promise<Project> => {
    const result = await db
      .update(ProjectSchema)
      .set(project)
      .where(eq(ProjectSchema.id, id))
      .returning();
    return result[0] as Project;
  },

  deleteProject: async (id: string): Promise<void> => {
    const threads = await pgChatService.selectProjectThreads(id);
    const threadIds = threads.map((thread) => thread.id);
    await Promise.all(
      threadIds.map((threadId) => pgChatService.deleteThread(threadId)),
    );
    await db.delete(ProjectSchema).where(eq(ProjectSchema.id, id));
  },
};
