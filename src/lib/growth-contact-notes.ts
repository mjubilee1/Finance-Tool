import { DateTime } from "luxon";
import { prisma } from "@/lib/prisma";
import { MAX_NOTE_IMAGES } from "@/lib/growth-contact-shared";

export type ContactNoteEntry = {
  id: string;
  body: string | null;
  images: string[];
  createdAt: Date | string;
};

export { MAX_NOTE_IMAGES } from "@/lib/growth-contact-shared";

export function contactHasNotes(contact: {
  notes?: string | null;
  noteEntries?: Array<{ id: string }> | null;
}): boolean {
  if (contact.noteEntries && contact.noteEntries.length > 0) return true;
  return Boolean(contact.notes?.trim());
}

/** Flattened text for LLM context — never includes raw image data URLs. */
export function formatContactNotesForAgent(
  noteEntries: ContactNoteEntry[] | null | undefined,
  legacyNotes?: string | null,
): string | null {
  if (noteEntries && noteEntries.length > 0) {
    const lines = [...noteEntries]
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map((entry) => {
        const when = DateTime.fromJSDate(new Date(entry.createdAt)).toFormat("yyyy-LL-dd HH:mm");
        const imageHint =
          entry.images.length > 0
            ? ` [${entry.images.length} screenshot${entry.images.length === 1 ? "" : "s"}]`
            : "";
        const text = entry.body?.trim() || "(screenshot only)";
        return `${when}${imageHint}: ${text}`;
      });
    return lines.join("\n");
  }

  return legacyNotes?.trim() || null;
}

export function sanitizeNoteImages(images: unknown): string[] {
  if (!Array.isArray(images)) return [];
  return images
    .filter((img): img is string => typeof img === "string" && img.startsWith("data:image/"))
    .slice(0, MAX_NOTE_IMAGES);
}

/** One-time: move flat `notes` blobs into timestamped entries when none exist yet. */
export async function migrateLegacyContactNotes(userId: string) {
  const contacts = await prisma.growthContact.findMany({
    where: {
      userId,
      notes: { not: null },
      noteEntries: { none: {} },
    },
    select: { id: true, userId: true, notes: true, updatedAt: true, createdAt: true },
  });

  if (contacts.length === 0) return;

  await prisma.$transaction(
    contacts
      .filter((c) => c.notes?.trim())
      .map((c) =>
        prisma.growthContactNote.create({
          data: {
            contactId: c.id,
            userId: c.userId,
            body: c.notes!.trim(),
            images: [],
            createdAt: c.updatedAt ?? c.createdAt,
          },
        }),
      ),
  );
}
