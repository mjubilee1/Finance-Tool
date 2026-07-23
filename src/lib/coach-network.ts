import { prisma } from "@/lib/prisma";
import {
  contactHasNotes,
  formatContactNotesForAgent,
} from "@/lib/growth-contact-notes";

export type CoachNetworkContact = {
  name: string;
  type: string | null;
  trust: number;
  lastContact: string | null;
  status: string;
  mutualValue: string | null;
  suggestedNext: string | null;
  notes: string | null;
  hasNotes: boolean;
};

/** Compact network map for coach chat — notes only, no screenshot blobs. */
export async function loadCoachNetworkPack(userId: string): Promise<{
  contacts: CoachNetworkContact[];
  withNotesCount: number;
}> {
  const contacts = await prisma.growthContact.findMany({
    where: { userId, status: { in: ["active", "fading"] } },
    orderBy: [{ updatedAt: "desc" }],
    take: 40,
    include: {
      noteEntries: {
        orderBy: { createdAt: "desc" },
        take: 4,
        select: { id: true, body: true, images: true, createdAt: true },
      },
    },
  });

  const mapped: CoachNetworkContact[] = contacts.map((contact) => {
    const hasNotes = contactHasNotes(contact);
    return {
      name: contact.name,
      type: contact.relationshipType,
      trust: contact.trustLevel,
      lastContact: contact.lastContactDate,
      status: contact.status,
      mutualValue: contact.mutualValue,
      suggestedNext: contact.suggestedNextAction,
      notes: formatContactNotesForAgent(contact.noteEntries, contact.notes),
      hasNotes,
    };
  });

  // Prefer people with notes first so the model sees real leverage targets.
  mapped.sort((a, b) => Number(b.hasNotes) - Number(a.hasNotes));

  return {
    contacts: mapped,
    withNotesCount: mapped.filter((c) => c.hasNotes).length,
  };
}
