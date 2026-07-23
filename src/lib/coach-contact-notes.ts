import { DateTime } from "luxon";
import { prisma } from "@/lib/prisma";
import {
  formatContactNotesForAgent,
  type ContactNoteEntry,
} from "@/lib/growth-contact-notes";
import {
  parseAtMentions,
  resolveContactMentions,
} from "@/lib/growth-contact-mentions";

export type CoachContactNoteUpdate = {
  /** @Name or plain contact name from GROWTH_CONTACTS */
  contactMention: string;
  note: string;
  /** YYYY-MM-DD when the outreach/event happened (optional). */
  lastContactDate?: string | null;
  /** active | fading | dormant */
  status?: string | null;
  suggestedNextAction?: string | null;
};

function parseIsoDate(value: string | null | undefined) {
  if (!value?.trim()) return null;
  const dt = DateTime.fromISO(value.trim());
  return dt.isValid ? dt.toISODate() : null;
}

export function parseCoachContactNotes(value: unknown): CoachContactNoteUpdate[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((raw) => {
      if (!raw || typeof raw !== "object") return null;
      const row = raw as Record<string, unknown>;
      const contactMention =
        typeof row.contactMention === "string"
          ? row.contactMention.trim()
          : typeof row.contact === "string"
            ? row.contact.trim()
            : typeof row.name === "string"
              ? row.name.trim()
              : "";
      const note = typeof row.note === "string" ? row.note.trim() : "";
      if (!contactMention || !note) return null;

      const status =
        typeof row.status === "string" &&
        ["active", "fading", "dormant"].includes(row.status.trim().toLowerCase())
          ? row.status.trim().toLowerCase()
          : null;

      return {
        contactMention,
        note: note.slice(0, 800),
        lastContactDate: parseIsoDate(
          typeof row.lastContactDate === "string" ? row.lastContactDate : null,
        ),
        status,
        suggestedNextAction:
          typeof row.suggestedNextAction === "string"
            ? row.suggestedNextAction.trim().slice(0, 200) || null
            : null,
      } satisfies CoachContactNoteUpdate;
    })
    .filter((row): row is CoachContactNoteUpdate => Boolean(row))
    .slice(0, 5);
}

/**
 * Append coach-taught notes onto Growth contacts (same @ resolution as activities).
 * Returns display names that were updated.
 */
export async function applyCoachContactNotes(
  userId: string,
  updates: CoachContactNoteUpdate[],
): Promise<string[]> {
  if (updates.length === 0) return [];

  const contacts = await prisma.growthContact.findMany({
    where: { userId },
    select: { id: true, name: true },
  });
  if (contacts.length === 0) return [];

  const savedNames: string[] = [];

  for (const update of updates) {
    const rawMention = update.contactMention.replace(/^@+/, "").trim();
    const mentions = parseAtMentions(`@${rawMention}`);
    if (mentions.length === 0 && rawMention) {
      mentions.push(rawMention);
    }

    const matched = resolveContactMentions(mentions, contacts);
    if (matched.length === 0) {
      console.warn(`[CHAT] contact note unmatched mention=${update.contactMention}`);
      continue;
    }

    for (const contact of matched) {
      const existing = await prisma.growthContact.findFirst({
        where: { id: contact.id, userId },
        include: {
          noteEntries: { orderBy: { createdAt: "asc" } },
        },
      });
      if (!existing) continue;

      const created = await prisma.growthContactNote.create({
        data: {
          userId,
          contactId: contact.id,
          body: update.note,
          images: [],
        },
      });

      const allEntries: ContactNoteEntry[] = [
        ...existing.noteEntries.map((entry) => ({
          id: entry.id,
          body: entry.body,
          images: entry.images,
          createdAt: entry.createdAt,
        })),
        {
          id: created.id,
          body: created.body,
          images: created.images,
          createdAt: created.createdAt,
        },
      ];

      const contactData: {
        notes: string | null;
        lastContactDate?: string;
        status?: string;
        suggestedNextAction?: string | null;
      } = {
        notes: formatContactNotesForAgent(allEntries, null),
      };

      if (update.lastContactDate) {
        const prev = existing.lastContactDate;
        if (!prev || prev <= update.lastContactDate) {
          contactData.lastContactDate = update.lastContactDate;
        }
      }

      if (update.status) {
        contactData.status = update.status;
      }

      if (update.suggestedNextAction !== undefined && update.suggestedNextAction !== null) {
        contactData.suggestedNextAction = update.suggestedNextAction;
      }

      await prisma.growthContact.update({
        where: { id: contact.id },
        data: contactData,
      });

      savedNames.push(contact.name);
    }
  }

  return [...new Set(savedNames)];
}
