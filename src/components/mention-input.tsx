"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Mention } from "@tiptap/extension-mention";
import React, { useState, useEffect, useMemo, ReactNode, useRef } from "react";
import { createPortal } from "react-dom";
import { useLatest } from "@/hooks/use-latest";
import { cn } from "@/lib/utils";
interface MentionInputProps {
  input?: string;
  onChange?: (value: string) => void;
  onChangeMention?: (mentionItems: { id: string; label: ReactNode }[]) => void;
  onEnter?: () => void;
  placeholder?: string;
  items?: { id: string; label: string }[];
  onPaste?: (e: React.ClipboardEvent) => void;
}

export default function MentionInput({
  input,
  onChange,
  onChangeMention,
  onEnter,
  placeholder = "Type a message...",
  onPaste,
  items = [],
}: MentionInputProps) {
  const [suggestion, setSuggestion] = useState<{
    top: number;
    left: number;
    query: string;
    selectedIndex: number;
    command: (item: { id: string; label: string }) => void;
  } | null>(null);

  const mentionRef = useRef<HTMLDivElement>(null);

  const filteredItems = useMemo(() => {
    if (!suggestion?.query.trim()) return items;
    return items.filter((item) =>
      item.id.toLowerCase().includes(suggestion.query.toLowerCase()),
    );
  }, [suggestion?.query, items]);

  const latestRef = useLatest({ suggestion, filteredItems });

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Mention.configure({
        HTMLAttributes: {
          class: "mention",
        },
        suggestion: {
          char: "@",
          items: ({ query }: { query: string }) => {
            return items;
          },
          render: () => {
            return {
              onStart: (props) => {
                const rect = props.clientRect?.();
                if (rect) {
                  setSuggestion({
                    top: rect.top - +window.scrollY,
                    left: rect.left - +window.scrollX,
                    query: props.query,
                    selectedIndex: 0,
                    command: props.command,
                  });
                }
              },
              onUpdate: (props: any) => {
                setSuggestion((prev) =>
                  prev
                    ? {
                        ...prev,
                        query: props.query,
                        command: props.command,
                      }
                    : null,
                );
              },
              onKeyDown(props) {
                const key = props.event.key;
                const allowedKeys = [
                  "Enter",
                  "Tab",
                  "ArrowUp",
                  "ArrowDown",
                  "Escape",
                ];
                if (!allowedKeys.includes(key)) return false;
                props.event.preventDefault();
                props.event.stopPropagation();

                const suggestion = latestRef.current.suggestion!;
                const filteredItems = latestRef.current.filteredItems;

                if (key === "Escape") {
                  setSuggestion(null);
                } else if (key === "Enter" || key === "Tab") {
                  const commandItem = filteredItems[suggestion.selectedIndex];
                  if (commandItem) {
                    suggestion.command(commandItem);
                  }
                } else if (key === "ArrowUp" || key === "ArrowDown") {
                  const newIndex =
                    suggestion.selectedIndex + (key === "ArrowUp" ? -1 : 1);
                  setSuggestion((prev) => ({
                    ...prev!,
                    selectedIndex: Math.max(
                      0,
                      Math.min(newIndex, filteredItems.length - 1),
                    ),
                  }));
                }
                return true;
              },
              onExit: (props) => {
                const mentionItems =
                  props.editor?.$doc.element.querySelectorAll(
                    "[data-type='mention']",
                  );
                const mentionItemsArray = Array.from(mentionItems).map(
                  (item) => ({
                    id: item.getAttribute("data-id")!,
                    label: item.textContent!,
                  }),
                );
                onChangeMention?.(mentionItemsArray);
                setSuggestion(null);
              },
            };
          },
        },
      }),
    ],
    content: input,
    onUpdate: ({ editor }) => {
      onChange?.(editor.getText());
    },
    editorProps: {
      handlePaste: () => {
        return true;
      },
      attributes: {
        class:
          "w-full max-h-96 min-h-[4rem] break-words overflow-y-auto resize-none focus:outline-none px-2 py-1 prose prose-sm dark:prose-invert",
      },
    },
  });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const isSubmit =
      !suggestion &&
      e.key === "Enter" &&
      editor?.getText().trim().length &&
      !e.shiftKey &&
      !e.nativeEvent.isComposing;
    if (isSubmit) {
      onEnter?.();
    }
  };
  useEffect(() => {
    if (suggestion) {
      setSuggestion((prev) => ({
        ...prev!,
        selectedIndex: 0,
      }));
    }
  }, [filteredItems]);

  useEffect(() => {
    if (input?.trim() !== editor?.getText().trim()) {
      editor?.commands.setContent(input || " ");
    }
  }, [input]);

  useEffect(() => {
    if (suggestion) {
      const handleClick = (e: MouseEvent) => {
        if (
          !mentionRef.current?.contains(e.target as Node) &&
          !editor?.isActive("mention")
        ) {
          setSuggestion(null);
        }
      };
      window.addEventListener("click", handleClick);
      return () => {
        window.removeEventListener("click", handleClick);
      };
    }
  }, [suggestion]);

  return (
    <div className="relative w-full">
      <EditorContent
        editor={editor}
        onPaste={onPaste}
        onKeyDown={handleKeyDown}
        className="relative"
      ></EditorContent>

      {suggestion &&
        createPortal(
          <div
            className="fixed z-50"
            style={{
              top: suggestion.top,
              left: suggestion.left,
            }}
          >
            <div
              ref={mentionRef}
              className="translate-y-[-100%] flex flex-col bg-background border rounded-md shadow-md w-[280px] px-2 py-2 gap-1 max-h-[400px] overflow-y-auto z-50"
            >
              <MentionSelect
                items={filteredItems}
                query={suggestion.query}
                addMention={suggestion.command}
                selectedIndex={suggestion.selectedIndex}
              />
            </div>
          </div>,
          document.body,
        )}

      {editor?.isEmpty && (
        <div className="absolute top-1 left-2 text-muted-foreground pointer-events-none">
          {placeholder}
        </div>
      )}
    </div>
  );
}

function HighlightText({ text, query }: { text: string; query: string }) {
  const parts = text.split(new RegExp(`(${query})`, "gi"));
  return (
    <span>
      {parts.map((part, i) => (
        <span
          key={i}
          className={
            part.toLowerCase() === query.toLowerCase()
              ? "text-blue-500 font-bold"
              : ""
          }
        >
          {part}
        </span>
      ))}
    </span>
  );
}

function MentionItem({
  item,
  query,
  addMention,
  isSelected,
}: {
  item: { id: string; label: string };
  addMention: (item: { id: string; label: string }) => void;
  isSelected: boolean;
  query: string;
}) {
  return (
    <div
      className={cn(
        "px-3 py-2 cursor-pointer hover:bg-card text-xs rounded",
        isSelected && "bg-card",
      )}
      onClick={() => addMention(item)}
    >
      <HighlightText text={item.label} query={query} />
    </div>
  );
}

function MentionSelect({
  items,
  query,
  addMention,
  selectedIndex,
}: {
  items: { id: string; label: string }[];
  query: string;
  addMention: (item: { id: string; label: string }) => void;
  selectedIndex: number;
}) {
  return (
    <div>
      {items.length === 0 && (
        <div className="px-3 py-2 text-xs text-muted-foreground">
          No results found
        </div>
      )}
      {items.map((item, index) => (
        <MentionItem
          key={item.id}
          item={item}
          query={query}
          addMention={addMention}
          isSelected={index === selectedIndex}
        />
      ))}
    </div>
  );
}
