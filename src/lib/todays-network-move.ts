import { prisma } from "@/lib/prisma";
import { contactHasNotes } from "@/lib/growth-contact-notes";
import {
  NETWORK_MOVE_REASON_LABEL,
  pickTodaysNetworkMove,
  type TodaysNetworkMove,
} from "@/lib/network-leverage";

export type TodaysNetworkMovePayload = TodaysNetworkMove & {
  reasonLabel: string;
};

export async function loadTodaysNetworkMove(
  userId: string,
  today: string,
): Promise<TodaysNetworkMovePayload | null> {
  const contacts = await prisma.growthContact.findMany({
    where: {
      userId,
      status: { in: ["active", "warm", "quiet", "fading"] },
    },
    select: {
      id: true,
      name: true,
      relationshipType: true,
      status: true,
      lastContactDate: true,
      suggestedNextAction: true,
      nextActionDate: true,
      mutualValue: true,
      asksOffers: true,
      trustLevel: true,
      notes: true,
      noteEntries: { select: { id: true }, take: 1 },
    },
  });

  const move = pickTodaysNetworkMove(
    contacts.map((c) => ({
      ...c,
      hasNotes: contactHasNotes(c),
    })),
    today,
  );

  if (!move) return null;
  return {
    ...move,
    reasonLabel: NETWORK_MOVE_REASON_LABEL[move.reason],
  };
}
