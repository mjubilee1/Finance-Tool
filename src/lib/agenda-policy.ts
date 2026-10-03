import { DateTime } from "luxon";
import type { GoogleCalendarEvent } from "@/lib/google-calendar";

export const CEO_GROWTH_MARKER = "Life OS layer: CEO Growth";
export const CEO_BLOCK_TYPES = [
  "nearby_story",
  "nearby_demo",
  "people",
  "high_signal_event",
] as const;

export type CeoBlockType = (typeof CEO_BLOCK_TYPES)[number];
export type AgendaLayer = "autopilot" | "ceo_growth" | "flex";

export function isCeoBlockType(value: unknown): value is CeoBlockType {
  return typeof value === "string" && (CEO_BLOCK_TYPES as readonly string[]).includes(value);
}

export function ceoCalendarTitle(type: CeoBlockType, detail?: string | null) {
  const suffix = detail?.trim();
  if (type === "nearby_story") return `Nearby — Story${suffix ? `: ${suffix}` : ""}`;
  if (type === "nearby_demo") return `Nearby — Demo${suffix ? `: ${suffix}` : ""}`;
  if (type === "people") return `People — Reach-outs${suffix ? `: ${suffix}` : ""}`;
  return `High-signal event${suffix ? ` — ${suffix}` : ""}`;
}

export function ceoBlockTypeFromEvent(event: Pick<GoogleCalendarEvent, "title" | "description">) {
  const text = `${event.title}\n${event.description ?? ""}`;
  if (!text.includes(CEO_GROWTH_MARKER)) return null;
  const match = text.match(/Life OS block type:\s*([a-z_]+)/i);
  return isCeoBlockType(match?.[1]) ? match[1] : null;
}

export function isCeoGrowthCalendarEvent(
  event: Pick<GoogleCalendarEvent, "title" | "description">,
) {
  return ceoBlockTypeFromEvent(event) !== null;
}

export function buildCeoEventDescription(input: {
  blockType: CeoBlockType;
  externalId: string;
  outcome?: string | null;
  notes?: string | null;
}) {
  return [
    CEO_GROWTH_MARKER,
    `Life OS block type: ${input.blockType}`,
    `Life OS external id: ${input.externalId}`,
    input.outcome?.trim() ? `Outcome: ${input.outcome.trim()}` : null,
    input.notes?.trim() || null,
  ]
    .filter(Boolean)
    .join("\n");
}

export function saturdayEventDecision(input: {
  startsAt: DateTime;
  endsAt: DateTime;
  signal: "high" | "normal";
}) {
  if (input.startsAt.weekday !== 6) return { allowed: true as const, reason: null };
  if (input.signal !== "high") {
    return {
      allowed: false as const,
      reason: "Saturday events must be high-signal; otherwise protect deep Nearby work.",
    };
  }
  if (!input.startsAt.isValid || !input.endsAt.isValid || input.endsAt <= input.startsAt) {
    return {
      allowed: false as const,
      reason: "Saturday events need a real start and end time.",
    };
  }
  return { allowed: true as const, reason: null };
}
