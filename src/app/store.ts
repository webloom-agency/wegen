import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getMockUserSession } from "lib/mock";
import type { ChatThread } from "app-types/chat";
import type { User } from "app-types/user";
import { DEFAULT_MODEL } from "lib/ai/models";
import { MCPServerInfo } from "app-types/mcp";
export interface AppState {
  threadList: ChatThread[];
  mcpList: MCPServerInfo[];
  currentThreadId: ChatThread["id"] | null;
  user: User;
  activeTool: boolean;
  model: string;
}

export interface AppDispatch {
  mutate: (state: Mutate<AppState>) => void;
}

export interface AppGetters {
  getCurrentThread(): ChatThread | null;
}
export const appStore = create<AppState & AppDispatch & AppGetters>()(
  persist(
    (set, get) => ({
      threadList: [],
      mcpList: [],
      currentThreadId: null,
      user: getMockUserSession(),
      activeTool: true,
      modelList: [],

      model: DEFAULT_MODEL,
      getCurrentThread: () =>
        get().threadList.find(
          (thread) => thread.id === get().currentThreadId,
        ) || null,
      mutate: set,
    }),
    {
      name: "mc-app-store",
      partialize: (state) => ({
        model: state.model || DEFAULT_MODEL,
        activeTool: state.activeTool,
      }),
    },
  ),
);
