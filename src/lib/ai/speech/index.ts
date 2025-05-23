import { UIMessage } from "ai";

export interface VoiceChatSession {
  isActive: boolean;
  isListening: boolean;
  error: Error | null;
  messages: UIMessage[];
  start: () => Promise<void>;
  stop: () => Promise<void>;
  startListening: () => Promise<void>;
  stopListening: () => Promise<void>;
  isLoading: boolean;
}
