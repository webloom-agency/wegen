"use client";

import { KeyboardShortcutsPopup } from "@/components/keyboard-shortcuts-popup";
import { ChatPreferencesPopup } from "@/components/chat-preferences-popup";
import { VoiceChatBot } from "@/components/voice-chat-bot";

export function AppPopupProvider() {
  return (
    <>
      <KeyboardShortcutsPopup />
      <ChatPreferencesPopup />
      <VoiceChatBot />
    </>
  );
}
