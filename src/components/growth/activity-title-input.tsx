"use client";

import { useRef } from "react";
import { ContactMentionMenu } from "@/components/contact-mention-menu";
import { VoiceToTextButton } from "@/components/voice-to-text-button";
import { useContactMention } from "@/hooks/use-contact-mention";
import type { MentionContact } from "@/lib/contact-mention-input";

type Props = {
  value: string;
  onChange: (value: string) => void;
  contacts: MentionContact[];
  disabled?: boolean;
};

export function ActivityTitleInput({ value, onChange, contacts, disabled = false }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mention = useContactMention({
    value,
    onChange,
    contacts,
    textareaRef,
  });

  return (
    <div className="relative flex min-w-0 items-start gap-2 sm:col-span-2">
      {mention.showMenu ? (
        <ContactMentionMenu
          contacts={mention.suggestions}
          activeIndex={mention.activeIndex}
          onSelect={mention.applyMention}
          onHover={mention.setActiveIndex}
          emptyLabel="No matching contacts"
        />
      ) : null}
      <textarea
        ref={textareaRef}
        required
        className="app-input min-h-[72px] min-w-0 flex-1 resize-y px-3 py-2 text-sm"
        placeholder="What did you do? e.g. Network mixer @Jane Smith — tap mic to speak…"
        value={value}
        disabled={disabled}
        onChange={(event) => {
          onChange(event.target.value);
          mention.syncCursor(event.target.selectionStart, event.target.value);
        }}
        onClick={(event) => mention.syncCursor(event.currentTarget.selectionStart)}
        onKeyUp={(event) => mention.syncCursor(event.currentTarget.selectionStart)}
        onSelect={(event) => mention.syncCursor(event.currentTarget.selectionStart)}
        onKeyDown={(event) => {
          mention.onKeyDown(event);
        }}
      />
      <VoiceToTextButton
        value={value}
        onChange={onChange}
        disabled={disabled}
        aria-label="Speak activity"
      />
    </div>
  );
}
