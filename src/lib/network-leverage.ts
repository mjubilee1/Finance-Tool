import {
  isBuilderContactType,
  isLeverageContactType,
  isTop10ContactType,
  normalizeContactStatus,
  normalizeContactType,
} from "@/lib/growth-contact-shared";

/** Contact fields needed to rank network leverage. */
export type LeverageRankableContact = {
  id: string;
  name: string;
  relationshipType: string | null;
  status: string;
  lastContactDate: string | null;
  suggestedNextAction: string | null;
  nextActionDate?: string | null;
  mutualValue?: string | null;
  asksOffers?: string | null;
  trustLevel?: number | null;
  hasNotes?: boolean;
};

export type TodaysNetworkMove = {
  contactId: string;
  name: string;
  relationshipType: string | null;
  reason: "overdue" | "top10_gap" | "fading" | "fill_leverage";
  action: string;
  nextActionDate: string | null;
  asksOffers: string | null;
  mutualValue: string | null;
  daysSinceTouch: number | null;
};

export type RankedNetworkTarget = LeverageRankableContact & {
  score: number;
  reasons: string[];
};

function daysBetween(fromIso: string | null | undefined, today: string): number | null {
  if (!fromIso?.trim()) return null;
  const from = Date.parse(`${fromIso.trim()}T12:00:00`);
  const to = Date.parse(`${today}T12:00:00`);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.max(0, Math.round((to - from) / 86_400_000));
}

function hasLeverageFields(contact: LeverageRankableContact) {
  return Boolean(
    contact.asksOffers?.trim() ||
      contact.mutualValue?.trim() ||
      contact.suggestedNextAction?.trim(),
  );
}

function isEligible(contact: LeverageRankableContact) {
  const status = normalizeContactStatus(contact.status);
  if (status === "dormant") return false;
  return isLeverageContactType(contact.relationshipType) || isBuilderContactType(contact.relationshipType);
}

/**
 * Deterministic score: overdue Top-10 founders/connectors beat warm biography dumps.
 * Higher = better target for today's outreach.
 */
export function scoreNetworkLeverage(
  contact: LeverageRankableContact,
  today: string,
): { score: number; reasons: string[] } {
  if (!isEligible(contact)) return { score: -1, reasons: [] };

  const status = normalizeContactStatus(contact.status);
  const type = normalizeContactType(contact.relationshipType);
  const days = daysBetween(contact.lastContactDate, today);
  const due = contact.nextActionDate?.trim() ?? "";
  const overdue = Boolean(due && due <= today);
  const reasons: string[] = [];
  let score = 0;

  if (isTop10ContactType(type)) {
    score += 40;
    reasons.push("top10");
  } else if (type === "investor" || type === "tech_peer") {
    score += 18;
  } else if (type === "dating") {
    score += 12;
  } else {
    score += 8;
  }

  if (overdue) {
    score += 50;
    reasons.push("overdue");
  } else if (due && due > today) {
    // Scheduled but not due — mild priority so they stay visible in ops pack
    score += 5;
  } else if (!due && isTop10ContactType(type)) {
    score += 15;
    reasons.push("needs_date");
  }

  if (status === "quiet") {
    score += 22;
    reasons.push("quiet");
  } else if (status === "warm") {
    score += 12;
  } else if (status === "active") {
    score += 8;
  }

  if (days == null) {
    score += 16;
    reasons.push("never_touched");
  } else if (days >= 21) {
    score += 28;
    reasons.push("fading");
  } else if (days >= 10) {
    score += 14;
    reasons.push("cooling");
  } else if (days <= 2 && !overdue) {
    score -= 20; // already hot this week
  }

  if (contact.suggestedNextAction?.trim()) {
    score += 12;
    reasons.push("has_next");
  } else if (isTop10ContactType(type)) {
    score += 8;
    reasons.push("fill_next");
  }

  if (contact.asksOffers?.trim()) score += 8;
  else if (isTop10ContactType(type)) {
    score += 6;
    reasons.push("fill_asks");
  }

  if (contact.mutualValue?.trim()) score += 4;
  if (contact.hasNotes) score += 4;

  const trust = contact.trustLevel ?? 3;
  score += Math.max(0, Math.min(5, trust));

  return { score, reasons };
}

export function rankNetworkOpsTargets<T extends LeverageRankableContact>(
  contacts: T[],
  today: string,
  limit = 12,
): Array<T & { score: number; reasons: string[] }> {
  return contacts
    .map((contact) => {
      const { score, reasons } = scoreNetworkLeverage(contact, today);
      return { ...contact, score, reasons };
    })
    .filter((contact) => contact.score >= 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (a.nextActionDate ?? "").localeCompare(b.nextActionDate ?? "");
    })
    .slice(0, limit);
}

function moveReason(
  reasons: string[],
): TodaysNetworkMove["reason"] {
  if (reasons.includes("overdue")) return "overdue";
  if (reasons.includes("fading") || reasons.includes("quiet")) return "fading";
  if (reasons.includes("fill_asks") || reasons.includes("fill_next") || reasons.includes("needs_date")) {
    return "fill_leverage";
  }
  return "top10_gap";
}

function defaultAction(contact: LeverageRankableContact): string {
  if (contact.suggestedNextAction?.trim()) return contact.suggestedNextAction.trim();
  if (!hasLeverageFields(contact)) {
    return `Fill ask/offer + next step for ${contact.name}`;
  }
  return `Send one concrete ask to ${contact.name}`;
}

/**
 * One highest-leverage person move for Today — skip if nothing scores well.
 */
export function pickTodaysNetworkMove(
  contacts: LeverageRankableContact[],
  today: string,
): TodaysNetworkMove | null {
  const ranked = rankNetworkOpsTargets(contacts, today, 8);
  const top = ranked[0];
  if (!top || top.score < 35) return null;

  // Don't nag if they already touch-logged today and nothing is overdue.
  const days = daysBetween(top.lastContactDate, today);
  if (days === 0 && !top.reasons.includes("overdue") && top.suggestedNextAction?.trim()) {
    const alternate = ranked.find(
      (c) => c.id !== top.id && (c.reasons.includes("overdue") || c.reasons.includes("fading")),
    );
    if (!alternate) return null;
    return {
      contactId: alternate.id,
      name: alternate.name,
      relationshipType: alternate.relationshipType,
      reason: moveReason(alternate.reasons),
      action: defaultAction(alternate),
      nextActionDate: alternate.nextActionDate ?? null,
      asksOffers: alternate.asksOffers ?? null,
      mutualValue: alternate.mutualValue ?? null,
      daysSinceTouch: daysBetween(alternate.lastContactDate, today),
    };
  }

  return {
    contactId: top.id,
    name: top.name,
    relationshipType: top.relationshipType,
    reason: moveReason(top.reasons),
    action: defaultAction(top),
    nextActionDate: top.nextActionDate ?? null,
    asksOffers: top.asksOffers ?? null,
    mutualValue: top.mutualValue ?? null,
    daysSinceTouch: days,
  };
}

export const NETWORK_MOVE_REASON_LABEL: Record<TodaysNetworkMove["reason"], string> = {
  overdue: "Follow-up due",
  top10_gap: "Top-10 touch",
  fading: "Relationship cooling",
  fill_leverage: "Capture leverage",
};
