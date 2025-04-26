import type { UIMessage } from "ai";

export type ChatThread = {
  id: string;
  title: string;
  userId: string;
  createdAt: Date;
  projectId: string | null;
};

export type Project = {
  id: string;
  name: string;
  userId: string;
  instructions: { type: "text"; text: string }[];
  createdAt: Date;
  updatedAt: Date;
};

export type ChatMessage = {
  id: string;
  threadId: string;
  role: UIMessage["role"];
  parts: UIMessage["parts"];
  attachments: unknown[];
  model: string | null;
  createdAt: Date;
};

export type ChatMessageAnnotation = {
  requiredTools?: string[];
};

export type ChatService = {
  insertThread(
    thread: PartialBy<ChatThread, "id" | "createdAt" | "projectId">,
  ): Promise<ChatThread>;

  selectThread(id: string): Promise<ChatThread | null>;

  selectMessagesByThreadId(threadId: string): Promise<ChatMessage[]>;

  selectThreadsByUserId(userId: string): Promise<ChatThread[]>;

  updateThread(
    id: string,
    thread: Partial<Omit<ChatThread, "id" | "createdAt">>,
  ): Promise<ChatThread>;

  deleteThread(id: string): Promise<void>;

  insertMessage(
    message: PartialBy<ChatMessage, "id" | "createdAt">,
  ): Promise<ChatMessage>;

  deleteMessagesByChatIdAfterTimestamp(messageId: string): Promise<void>;

  deleteAllThreads(userId: string): Promise<void>;

  insertProject(
    project: Omit<Project, "id" | "createdAt" | "updatedAt">,
  ): Promise<Project>;

  selectProjectById(id: string): Promise<
    | (Project & {
        threads: ChatThread[];
      })
    | null
  >;

  selectProjectsByUserId(
    userId: string,
  ): Promise<Omit<Project, "instructions">[]>;

  updateProject(
    id: string,
    project: Partial<Pick<Project, "name" | "instructions">>,
  ): Promise<Project>;

  deleteProject(id: string): Promise<void>;
};
