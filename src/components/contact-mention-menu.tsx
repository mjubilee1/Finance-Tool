"use client";

import type { MentionContact } from "@/lib/contact-mention-input";

type Props = {
  contacts: MentionContact[];
  activeIndex: number;
  onSelect: (contact: MentionContact) => void;
  onHover: (index: number) => void;
  emptyLabel?: string;
};

export function ContactMentionMenu({
  contacts,
  activeIndex,
  onSelect,
  onHover,
  emptyLabel = "No matching contacts",
}: Props) {
  return (
    <div
      role="listbox"
      aria-label="Contacts"
      className="absolute bottom-full left-0 right-0 z-30 mb-1 max-h-52 overflow-y-auto rounded-xl border border-[var(--card-border)] bg-[var(--card-solid)] shadow-lg shadow-black/10"
    >
      {contacts.length === 0 ? (
        <p className="px-3 py-2.5 text-xs text-[var(--muted)]">{emptyLabel}</p>
      ) : (
        <ul className="py-1">
          {contacts.map((contact, index) => {
            const isActive = index === activeIndex;
            return (
              <li key={contact.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onMouseDown={(event) => {
                    // Keep textarea focus; prevent blur before select.
                    event.preventDefault();
                  }}
                  onClick={() => onSelect(contact)}
                  onMouseEnter={() => onHover(index)}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition ${
                    isActive
                      ? "bg-[color-mix(in_srgb,var(--ink)_8%,transparent)] text-[var(--ink)]"
                      : "text-[var(--ink)] hover:bg-[color-mix(in_srgb,var(--ink)_5%,transparent)]"
                  }`}
                >
                  <span className="min-w-0 truncate font-medium">@{contact.name}</span>
                  {contact.relationshipType ? (
                    <span className="shrink-0 text-[11px] capitalize text-[var(--muted)]">
                      {contact.relationshipType.replace(/_/g, " ")}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
