import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getMockUserSession } from "lib/mock";
import type { ChatThread, Project } from "app-types/chat";
import type { User } from "app-types/user";
import { DEFAULT_MODEL } from "lib/ai/models";
import { MCPServerInfo } from "app-types/mcp";
export interface AppState {
  threadList: ChatThread[];
  mcpList: MCPServerInfo[];
  projectList: Omit<Project, "instructions">[];
  currentThreadId: ChatThread["id"] | null;
  currentProjectId: Project["id"] | null;
  user: User;
  toolChoice: "auto" | "none" | "manual";
  model: string;
}

export interface AppDispatch {
  mutate: (state: Mutate<AppState>) => void;
}

export const appStore = create<AppState & AppDispatch>()(
  persist(
    (set) => ({
      threadList: [],
      projectList: [],
      mcpList: [],
      currentThreadId: null,
      currentProjectId: null,
      user: getMockUserSession(),
      toolChoice: "auto",
      modelList: [],

      model: DEFAULT_MODEL,

      mutate: set,
    }),
    {
      name: "mc-app-store",
      partialize: (state) => ({
        model: state.model || DEFAULT_MODEL,
        toolChoice: state.toolChoice,
      }),
    },
  ),
);
