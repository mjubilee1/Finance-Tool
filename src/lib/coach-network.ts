import { prisma } from "@/lib/prisma";
import {
  contactHasNotes,
  formatContactNotesForAgent,
} from "@/lib/growth-contact-notes";
import {
  pickTodaysNetworkMove,
  rankNetworkOpsTargets,
  type TodaysNetworkMove,
} from "@/lib/network-leverage";
import { userToday } from "@/lib/user-timezone";

export type CoachNetworkContact = {
  name: string;
  type: string | null;
  trust: number;
  lastContact: string | null;
  status: string;
  mutualValue: string | null;
  asksOffers: string | null;
  suggestedNext: string | null;
  nextActionDate: string | null;
  notes: string | null;
  hasNotes: boolean;
  leverageScore?: number;
  leverageReasons?: string[];
};

/** Compact network map for coach chat — notes only, no screenshot blobs. */
export async function loadCoachNetworkPack(userId: string): Promise<{
  contacts: CoachNetworkContact[];
  withNotesCount: number;
  todaysMove: TodaysNetworkMove | null;
  opsTargets: Array<{
    name: string;
    type: string | null;
    score: number;
    reasons: string[];
    nextAction: string | null;
    nextActionDate: string | null;
    asksOffers: string | null;
  }>;
}> {
  const today = userToday();
  const contacts = await prisma.growthContact.findMany({
    where: { userId, status: { in: ["active", "warm", "quiet", "fading"] } },
    orderBy: [{ updatedAt: "desc" }],
    take: 80,
    include: {
      noteEntries: {
        orderBy: { createdAt: "desc" },
        take: 4,
        select: { id: true, body: true, images: true, createdAt: true },
      },
    },
  });

  const rankable = contacts.map((contact) => ({
    id: contact.id,
    name: contact.name,
    relationshipType: contact.relationshipType,
    status: contact.status,
    lastContactDate: contact.lastContactDate,
    suggestedNextAction: contact.suggestedNextAction,
    nextActionDate: contact.nextActionDate,
    mutualValue: contact.mutualValue,
    asksOffers: contact.asksOffers,
    trustLevel: contact.trustLevel,
    hasNotes: contactHasNotes(contact),
    noteEntries: contact.noteEntries,
    notes: contact.notes,
  }));

  const ranked = rankNetworkOpsTargets(rankable, today, 16);
  const rankedIds = new Set(ranked.map((c) => c.id));

  // Prefer ranked leverage targets, then fill with remaining noted contacts.
  const ordered = [
    ...ranked,
    ...rankable.filter((c) => !rankedIds.has(c.id)),
  ].slice(0, 40);

  const mapped: CoachNetworkContact[] = ordered.map((contact) => {
    const rankedHit = ranked.find((r) => r.id === contact.id);
    return {
      name: contact.name,
      type: contact.relationshipType,
      trust: contact.trustLevel ?? 3,
      lastContact: contact.lastContactDate,
      status: contact.status,
      mutualValue: contact.mutualValue,
      asksOffers: contact.asksOffers,
      suggestedNext: contact.suggestedNextAction,
      nextActionDate: contact.nextActionDate,
      notes: formatContactNotesForAgent(contact.noteEntries, contact.notes),
      hasNotes: contact.hasNotes,
      leverageScore: rankedHit?.score,
      leverageReasons: rankedHit?.reasons,
    };
  });

  const todaysMove = pickTodaysNetworkMove(rankable, today);

  return {
    contacts: mapped,
    withNotesCount: mapped.filter((c) => c.hasNotes).length,
    todaysMove,
    opsTargets: ranked.slice(0, 8).map((c) => ({
      name: c.name,
      type: c.relationshipType,
      score: c.score,
      reasons: c.reasons,
      nextAction: c.suggestedNextAction,
      nextActionDate: c.nextActionDate ?? null,
      asksOffers: c.asksOffers ?? null,
    })),
  };
}
