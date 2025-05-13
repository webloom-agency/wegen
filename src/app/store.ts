import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AppDefaultToolkit, ChatThread, Project } from "app-types/chat";

import { DEFAULT_MODEL } from "lib/ai/models";
import { AllowedMCPServer, MCPServerInfo } from "app-types/mcp";
export interface AppState {
  threadList: ChatThread[];
  mcpList: MCPServerInfo[];
  projectList: Omit<Project, "instructions">[];
  currentThreadId: ChatThread["id"] | null;
  currentProjectId: Project["id"] | null;
  toolChoice: "auto" | "none" | "manual";
  allowedMcpServers?: Record<string, AllowedMCPServer>;
  allowedAppDefaultToolkit?: AppDefaultToolkit[];
  model: string;
  temporaryModel: string;
}

export interface AppDispatch {
  mutate: (state: Mutate<AppState>) => void;
}

const initialState: AppState = {
  threadList: [],
  projectList: [],
  mcpList: [],
  currentThreadId: null,
  currentProjectId: null,
  toolChoice: "auto",
  allowedMcpServers: undefined,
  allowedAppDefaultToolkit: ["chart"],
  model: DEFAULT_MODEL,
  temporaryModel: DEFAULT_MODEL,
};

export const appStore = create<AppState & AppDispatch>()(
  persist(
    (set) => ({
      ...initialState,
      mutate: set,
    }),
    {
      name: "mc-app-store",
      partialize: (state) => ({
        model: state.model || initialState.model,
        toolChoice: state.toolChoice || initialState.toolChoice,
        allowedMcpServers:
          state.allowedMcpServers || initialState.allowedMcpServers,
        temporaryModel: state.temporaryModel || initialState.temporaryModel,
      }),
    },
  ),
);
