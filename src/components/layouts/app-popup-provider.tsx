"use client";

import { KeyboardShortcutsPopup } from "@/components/keyboard-shortcuts-popup";
import { ChatPreferencesPopup } from "@/components/chat-preferences-popup";
import { VoiceChatBot } from "@/components/voice-chat-bot";
import TemporaryChat from "../temporary-chat";

export function AppPopupProvider() {
  return (
    <>
      <KeyboardShortcutsPopup />
      <ChatPreferencesPopup />
      <VoiceChatBot />
      <TemporaryChat />
    </>
  );
}
