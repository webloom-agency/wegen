"use client";

import { KeyboardShortcutsPopup } from "@/components/keyboard-shortcuts-popup";
import { ChatPreferencesPopup } from "@/components/chat-preferences-popup";
import { appStore } from "../app/store";
import { useShallow } from "zustand/shallow";
import { useEffect } from "react";
import { isShortcutEvent, Shortcuts } from "@/lib/keyboard-shortcuts";
import { VoiceChatBot } from "@/components/voice-chat-bot";

export function ShortcutsProvider() {
  const [openChatPreferences, openShortcutsPopup, appStoreMutate] = appStore(
    useShallow((state) => [
      state.openChatPreferences,
      state.openShortcutsPopup,
      state.mutate,
    ]),
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isShortcutPopupEvent = isShortcutEvent(
        e,
        Shortcuts.openShortcutsPopup,
      );
      const isChatPreferencesEvent = isShortcutEvent(
        e,
        Shortcuts.openChatPreferences,
      );
      if (!isShortcutPopupEvent && !isChatPreferencesEvent) return;
      e.preventDefault();
      e.stopPropagation();
      if (isShortcutPopupEvent) {
        appStoreMutate({ openShortcutsPopup: true });
      }
      if (isChatPreferencesEvent) {
        appStoreMutate({ openChatPreferences: true });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
  return (
    <>
      <KeyboardShortcutsPopup
        open={openShortcutsPopup}
        onOpenChange={(open) => appStoreMutate({ openShortcutsPopup: open })}
      />
      <ChatPreferencesPopup
        open={openChatPreferences}
        onOpenChange={(open) => appStoreMutate({ openChatPreferences: open })}
      />
      <VoiceChatBot />
    </>
  );
}
