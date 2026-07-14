import { DateTime } from "luxon";

export const LYFT_WEEKLY_PROGRAM_FEE = 334;
export const LYFT_WEEKLY_PROGRAM_FEE_LABEL = "$334/week";
export const LYFT_MONTHLY_PROGRAM_FEE_ESTIMATE = Math.round(LYFT_WEEKLY_PROGRAM_FEE * 4.33);
export const LYFT_GROSS_EARNINGS_NOTE_PREFIX = "Lyft gross earnings";

type LyftActivityLike = {
  date: string;
  category?: string | null;
  title?: string | null;
  notes?: string | null;
};

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function parseCurrency(value: string | undefined) {
  if (!value) return null;
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function parseLyftGrossEarnings(activity: Pick<LyftActivityLike, "category" | "title" | "notes">) {
  const category = activity.category?.toLowerCase();
  const text = `${activity.title ?? ""}\n${activity.notes ?? ""}`;
  const structured = text.match(/Lyft gross earnings:\s*\$?([\d,]+(?:\.\d+)?)/i);
  const structuredAmount = parseCurrency(structured?.[1]);
  if (structuredAmount != null) return structuredAmount;

  if (category !== "lyft") return null;
  const titleAmount = text.match(/\$?([\d,]+(?:\.\d+)?)\s*(?:gross|earned|lyft)/i);
  return parseCurrency(titleAmount?.[1]);
}

export function getLyftWeekRange(dateIso: string) {
  const date = DateTime.fromISO(dateIso);
  const base = date.isValid ? date : DateTime.local();
  const start = base.startOf("week");
  const end = start.plus({ days: 6 });

  return {
    startIso: start.toISODate()!,
    endIso: end.toISODate()!,
  };
}

export function summarizeLyftWeek(activities: LyftActivityLike[], dateIso: string) {
  const { startIso, endIso } = getLyftWeekRange(dateIso);
  const grossEarned = roundCurrency(
    activities.reduce((sum, activity) => {
      if (activity.date < startIso || activity.date > endIso) return sum;
      return sum + (parseLyftGrossEarnings(activity) ?? 0);
    }, 0),
  );

  return {
    weekStart: startIso,
    weekEnd: endIso,
    grossEarned,
    feeRemaining: roundCurrency(Math.max(0, LYFT_WEEKLY_PROGRAM_FEE - grossEarned)),
    profitAfterFee: roundCurrency(Math.max(0, grossEarned - LYFT_WEEKLY_PROGRAM_FEE)),
  };
}

export function calculateLyftEntryImpact(existingWeekGross: number, grossEarnings: number) {
  const feeRemainingBefore = Math.max(0, LYFT_WEEKLY_PROGRAM_FEE - existingWeekGross);
  const feeCoveredByEntry = Math.min(grossEarnings, feeRemainingBefore);
  const profitAfterFee = Math.max(0, grossEarnings - feeRemainingBefore);
  const feeRemainingAfter = Math.max(0, LYFT_WEEKLY_PROGRAM_FEE - existingWeekGross - grossEarnings);

  return {
    feeRemainingBefore: roundCurrency(feeRemainingBefore),
    feeCoveredByEntry: roundCurrency(feeCoveredByEntry),
    profitAfterFee: roundCurrency(profitAfterFee),
    feeRemainingAfter: roundCurrency(feeRemainingAfter),
  };
}

export function buildLyftEarningsNote(params: {
  grossEarnings: number;
  existingWeekGross: number;
  baseNote?: string | null;
}) {
  const impact = calculateLyftEntryImpact(params.existingWeekGross, params.grossEarnings);
  const lines = [
    `${LYFT_GROSS_EARNINGS_NOTE_PREFIX}: $${roundCurrency(params.grossEarnings).toFixed(2)}.`,
    `Applied to ${LYFT_WEEKLY_PROGRAM_FEE_LABEL} fee first: $${impact.feeCoveredByEntry.toFixed(2)}.`,
    `Lyft profit after fee from this entry: $${impact.profitAfterFee.toFixed(2)}.`,
    `Weekly fee remaining after this entry: $${impact.feeRemainingAfter.toFixed(2)}.`,
  ];

  if (params.baseNote?.trim()) {
    lines.push(params.baseNote.trim());
  }

  return lines.join(" ");
}
