import { UIMessage } from "ai";

export type UIMessageWithCompleted = UIMessage & { completed: boolean };

export interface VoiceChatSession {
  isActive: boolean;
  isListening: boolean;
  isLoading: boolean;
  messages: UIMessageWithCompleted[];
  error: Error | null;
  micVolume: number;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  startListening: () => Promise<void>;
  stopListening: () => Promise<void>;
}

export type VoiceChatHook = (props?: {
  [key: string]: any;
}) => VoiceChatSession;

export const DEFAULT_VOICE_TOOLS = [
  {
    type: "function",
    name: "toggleBrowserTheme",
    description: "Toggle the browser theme between light and dark",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    type: "function",
    name: "endConversation",
    description: "End the conversation",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
];
