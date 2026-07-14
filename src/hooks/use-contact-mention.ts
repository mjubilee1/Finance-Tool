"use client";

import { useState } from "react";
import {
  filterMentionContacts,
  getActiveMention,
  insertMention,
  type MentionContact,
} from "@/lib/contact-mention-input";
import { useGrowthContacts } from "@/hooks/use-growth-contacts";

type Options = {
  value: string;
  onChange: (value: string) => void;
  /** When false, skip mention UI entirely. */
  enabled?: boolean;
  /** Optional preloaded contacts (e.g. Growth dashboard already has them). */
  contacts?: MentionContact[];
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
};

function mentionKey(start: number, query: string) {
  return `${start}:${query}`;
}

export function useContactMention({
  value,
  onChange,
  enabled = true,
  contacts: providedContacts,
  textareaRef,
}: Options) {
  const [cursor, setCursor] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [highlightKey, setHighlightKey] = useState<string | null>(null);
  const [dismissedStart, setDismissedStart] = useState<number | null>(null);

  const detectedMention = enabled ? getActiveMention(value, cursor) : null;

  // Keep Escape dismissal only while the same @ token is still active.
  const stillDismissed =
    dismissedStart !== null &&
    detectedMention !== null &&
    detectedMention.start === dismissedStart;

  const activeMention =
    detectedMention && !stillDismissed ? detectedMention : null;

  const currentKey = activeMention
    ? mentionKey(activeMention.start, activeMention.query)
    : null;

  const resolvedActiveIndex =
    currentKey !== null && currentKey === highlightKey ? activeIndex : 0;

  const shouldFetch = enabled && !providedContacts && activeMention !== null;
  const query = useGrowthContacts(shouldFetch);
  const contacts = providedContacts ?? query.data?.contacts ?? [];

  const suggestions =
    activeMention !== null ? filterMentionContacts(contacts, activeMention.query) : [];

  const syncCursor = (nextCursor?: number, nextValue = value) => {
    const el = textareaRef.current;
    const resolved = nextCursor ?? el?.selectionStart ?? nextValue.length;
    setCursor(resolved);

    const mention = enabled ? getActiveMention(nextValue, resolved) : null;

    if (dismissedStart !== null && (!mention || mention.start !== dismissedStart)) {
      setDismissedStart(null);
    }

    const key = mention ? mentionKey(mention.start, mention.query) : null;
    if (key !== highlightKey) {
      setHighlightKey(key);
      setActiveIndex(0);
    }
  };

  const applyMention = (contact: MentionContact) => {
    if (!activeMention) return;
    const { text, cursor: nextCursor } = insertMention(value, activeMention, contact.name);
    onChange(text);
    setDismissedStart(null);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(nextCursor, nextCursor);
      syncCursor(nextCursor, text);
    });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (!activeMention) return false;

    if (suggestions.length > 0 && event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightKey(currentKey);
      setActiveIndex((index) => {
        const base = currentKey === highlightKey ? index : 0;
        return (base + 1) % suggestions.length;
      });
      return true;
    }

    if (suggestions.length > 0 && event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightKey(currentKey);
      setActiveIndex((index) => {
        const base = currentKey === highlightKey ? index : 0;
        return (base - 1 + suggestions.length) % suggestions.length;
      });
      return true;
    }

    if (suggestions.length > 0 && (event.key === "Enter" || event.key === "Tab")) {
      event.preventDefault();
      const contact = suggestions[resolvedActiveIndex] ?? suggestions[0];
      if (contact) applyMention(contact);
      return true;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setDismissedStart(activeMention.start);
      return true;
    }

    return false;
  };

  return {
    activeMention,
    suggestions,
    activeIndex: resolvedActiveIndex,
    setActiveIndex: (index: number) => {
      setHighlightKey(currentKey);
      setActiveIndex(index);
    },
    applyMention,
    syncCursor,
    onKeyDown,
    isLoadingContacts: shouldFetch && query.isLoading,
    showMenu: activeMention !== null,
  };
}
