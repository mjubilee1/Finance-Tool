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

export const COACH_CONTACT_TYPES = [
  "unlabeled",
  "family",
  "peer",
  "social",
  "dating",
  "mentor",
  "founder",
  "investor",
  "colleague",
  "tenant",
  "other",
] as const;

export type CoachContactType = (typeof COACH_CONTACT_TYPES)[number];

export type CoachContactNoteUpdate = {
  /** @Name or plain contact name */
  contactMention: string;
  note: string;
  /** YYYY-MM-DD when the meet/outreach happened (optional). */
  lastContactDate?: string | null;
  /** active | fading | dormant */
  status?: string | null;
  suggestedNextAction?: string | null;
  /** Relationship label — same options as Growth UI. */
  relationshipType?: CoachContactType | null;
  mutualValue?: string | null;
  /**
   * Create the contact if no @ match exists.
   * Default true when teaching "I met X" style facts.
   */
  createIfMissing?: boolean;
};

export type CoachContactNoteResult = {
  updated: string[];
  created: string[];
};

function parseIsoDate(value: string | null | undefined) {
  if (!value?.trim()) return null;
  const dt = DateTime.fromISO(value.trim());
  return dt.isValid ? dt.toISODate() : null;
}

function normalizeRelationshipType(value: unknown): CoachContactType | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = value.trim().toLowerCase();
  return (COACH_CONTACT_TYPES as readonly string[]).includes(normalized)
    ? (normalized as CoachContactType)
    : null;
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

      const createIfMissing = row.createIfMissing !== false && row.action !== "update";

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
        relationshipType: normalizeRelationshipType(row.relationshipType ?? row.label ?? row.type),
        mutualValue:
          typeof row.mutualValue === "string"
            ? row.mutualValue.trim().slice(0, 300) || null
            : null,
        createIfMissing,
      } satisfies CoachContactNoteUpdate;
    })
    .filter((row): row is CoachContactNoteUpdate => Boolean(row))
    .slice(0, 5);
}

async function appendNoteAndSync(
  userId: string,
  contactId: string,
  update: CoachContactNoteUpdate,
  existingEntries: ContactNoteEntry[],
  options?: { isNew?: boolean },
) {
  const created = await prisma.growthContactNote.create({
    data: {
      userId,
      contactId,
      body: update.note,
      images: [],
    },
  });

  const allEntries: ContactNoteEntry[] = [
    ...existingEntries,
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
    relationshipType?: string | null;
    mutualValue?: string | null;
  } = {
    notes: formatContactNotesForAgent(allEntries, null),
  };

  const today = DateTime.local().toISODate();
  const lastContact = update.lastContactDate ?? (options?.isNew ? today : null);
  if (lastContact) {
    contactData.lastContactDate = lastContact;
  }

  if (update.status) {
    contactData.status = update.status;
  } else if (options?.isNew) {
    contactData.status = "active";
  }

  if (update.suggestedNextAction !== undefined && update.suggestedNextAction !== null) {
    contactData.suggestedNextAction = update.suggestedNextAction;
  }

  if (update.relationshipType) {
    contactData.relationshipType = update.relationshipType;
  }

  if (update.mutualValue) {
    contactData.mutualValue = update.mutualValue;
  }

  await prisma.growthContact.update({
    where: { id: contactId },
    data: contactData,
  });
}

/**
 * Create and/or annotate Growth contacts from coach chat.
 * Uses the same @Name resolution as activities.
 */
export async function applyCoachContactNotes(
  userId: string,
  updates: CoachContactNoteUpdate[],
): Promise<CoachContactNoteResult> {
  const result: CoachContactNoteResult = { updated: [], created: [] };
  if (updates.length === 0) return result;

  let contacts = await prisma.growthContact.findMany({
    where: { userId },
    select: { id: true, name: true },
  });

  for (const update of updates) {
    const rawMention = update.contactMention.replace(/^@+/, "").trim();
    if (!rawMention) continue;

    const mentions = parseAtMentions(`@${rawMention}`);
    if (mentions.length === 0) mentions.push(rawMention);

    let matched = resolveContactMentions(mentions, contacts);

    // Soft fallback: case-insensitive exact name if @ prefix matching missed.
    if (matched.length === 0) {
      const needle = rawMention.toLowerCase();
      matched = contacts.filter((c) => c.name.toLowerCase() === needle);
    }

    if (matched.length === 0) {
      if (!update.createIfMissing) {
        console.warn(`[CHAT] contact note unmatched mention=${update.contactMention}`);
        continue;
      }

      const createdContact = await prisma.growthContact.create({
        data: {
          userId,
          name: rawMention,
          relationshipType: update.relationshipType ?? "peer",
          trustLevel: 3,
          collaborationPotential: 3,
          lastContactDate: update.lastContactDate ?? DateTime.local().toISODate(),
          suggestedNextAction: update.suggestedNextAction ?? null,
          mutualValue: update.mutualValue ?? null,
          notes: null,
          status: update.status ?? "active",
        },
      });

      await appendNoteAndSync(userId, createdContact.id, update, [], { isNew: true });
      result.created.push(createdContact.name);
      contacts = [...contacts, { id: createdContact.id, name: createdContact.name }];
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

      // When updating an existing contact, only move lastContactDate forward.
      const forwardOnlyUpdate: CoachContactNoteUpdate = {
        ...update,
        lastContactDate:
          update.lastContactDate &&
          (!existing.lastContactDate || existing.lastContactDate <= update.lastContactDate)
            ? update.lastContactDate
            : null,
      };

      await appendNoteAndSync(
        userId,
        contact.id,
        forwardOnlyUpdate,
        existing.noteEntries.map((entry) => ({
          id: entry.id,
          body: entry.body,
          images: entry.images,
          createdAt: entry.createdAt,
        })),
      );
      result.updated.push(contact.name);
    }
  }

  return {
    updated: [...new Set(result.updated)],
    created: [...new Set(result.created)],
  };
}

export function formatCoachContactNoteSummary(result: CoachContactNoteResult) {
  const parts: string[] = [];
  if (result.created.length > 0) {
    parts.push(`Created Growth contacts: ${result.created.map((n) => `@${n}`).join(", ")}`);
  }
  if (result.updated.length > 0) {
    parts.push(`Updated Growth notes for: ${result.updated.map((n) => `@${n}`).join(", ")}`);
  }
  return parts.join("\n");
}
