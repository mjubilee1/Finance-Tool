export type MentionContact = {
  id: string;
  name: string;
  relationshipType?: string | null;
  lastContactDate?: string | null;
  status?: string | null;
};

export type ActiveMention = {
  start: number;
  end: number;
  query: string;
};

/**
 * Find an active @mention being typed at the cursor.
 * Keeps the menu open through a first-name trailing space so last names can be typed,
 * then closes once a multi-word query is followed by a space (typical after selection).
 */
export function getActiveMention(text: string, cursor: number): ActiveMention | null {
  if (cursor < 0 || cursor > text.length) return null;

  const before = text.slice(0, cursor);
  const atIndex = before.lastIndexOf("@");
  if (atIndex < 0) return null;

  // Require start-of-text or a separator before @ so emails don't trigger.
  if (atIndex > 0) {
    const prev = before[atIndex - 1];
    if (prev && !/[\s([{,:]/.test(prev)) return null;
  }

  const query = before.slice(atIndex + 1);
  if (/[\n@]/.test(query)) return null;
  if (/[.,!?;:]/.test(query)) return null;

  const trimmedEnd = query.replace(/\s+$/, "");
  const trailingSpaceCount = query.length - trimmedEnd.length;
  if (trailingSpaceCount > 1) return null;
  // After inserting "@Jane Doe ", query ends with a space past a multi-word name — close.
  if (trailingSpaceCount > 0 && trimmedEnd.includes(" ")) return null;

  // Allow letters/numbers/._- plus optional spaces while composing a name.
  if (trimmedEnd && !/^[A-Za-z0-9._\-]+(?: [A-Za-z0-9._\-]+)*$/.test(trimmedEnd)) {
    return null;
  }

  return {
    start: atIndex,
    end: cursor,
    query: trimmedEnd,
  };
}

export function filterMentionContacts(
  contacts: MentionContact[],
  query: string,
  limit = 8,
): MentionContact[] {
  const needle = query.trim().toLowerCase().replace(/\s+/g, " ");
  const scored = contacts
    .map((contact) => {
      const name = contact.name.trim();
      const normalized = name.toLowerCase().replace(/\s+/g, " ");
      if (!normalized) return null;

      let score = 0;
      if (!needle) {
        score = contact.lastContactDate ? 2 : 1;
      } else if (normalized === needle) {
        score = 100;
      } else if (normalized.startsWith(needle)) {
        score = 80;
      } else if (normalized.split(" ").some((part) => part.startsWith(needle))) {
        score = 60;
      } else if (normalized.includes(needle)) {
        score = 40;
      } else {
        return null;
      }

      return { contact, score, name };
    })
    .filter((row): row is { contact: MentionContact; score: number; name: string } => row !== null)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aDate = a.contact.lastContactDate ?? "";
      const bDate = b.contact.lastContactDate ?? "";
      if (aDate !== bDate) return bDate.localeCompare(aDate);
      return a.name.localeCompare(b.name);
    });

  return scored.slice(0, limit).map((row) => row.contact);
}

export function insertMention(
  text: string,
  mention: ActiveMention,
  contactName: string,
): { text: string; cursor: number } {
  const insertion = `@${contactName} `;
  const next = `${text.slice(0, mention.start)}${insertion}${text.slice(mention.end)}`;
  return {
    text: next,
    cursor: mention.start + insertion.length,
  };
}
