import { DateTime } from "luxon";
import { formatCurrency } from "@/lib/format";
import { dayShapeFor } from "@/lib/joy-ideas-shared";
import type { GrowthMetrics } from "@/lib/growth-agent";

export type TodayPlanBlockKey = "gym" | "leverage" | "joy" | "lyft";

export type TodayPlanBlock = {
  key: TodayPlanBlockKey;
  label: string;
  time: string;
  why: string;
  domain: string;
  category: string;
  leverage: "immediate_income" | "long_term_leverage";
  minutes: number;
};

type RecommendationLike = {
  action: string;
  domain: string | null;
  timeRequiredMinutes: number;
} | null;

type ProfileLike = {
  promotionTarget: string | null;
  promotionDeadline: string | null;
  promotionUpsideAnnual: number | null;
  fitnessGoal: string | null;
} | null;

function firstSentence(text: string | null | undefined, max = 120) {
  if (!text?.trim()) return null;
  const sentence = text.split(/(?<=[.!?])\s+/)[0]?.trim() ?? text.trim();
  return sentence.length > max ? `${sentence.slice(0, max - 1).trim()}…` : sentence;
}

export function buildTodayPlan(
  metrics: GrowthMetrics,
  recommendation: RecommendationLike,
  profile: ProfileLike,
) {
  const now = DateTime.local();
  const shape = dayShapeFor(now.weekday);
  const isWeekend = shape === "weekend";
  const isOffice = shape === "office";
  const leverageMinutes = Math.min(
    isOffice ? 60 : isWeekend ? 90 : 75,
    Math.max(45, recommendation?.timeRequiredMinutes ?? (isOffice ? 45 : 60)),
  );
  const cashTight =
    metrics.financialSignals.safeSpendToday < 20 || metrics.financialSignals.cashAvailable < 1000;
  const socialThin = metrics.domains.social < 55 || metrics.activityCounts.social === 0;
  const promotionUpside = profile?.promotionUpsideAnnual ?? 0;
  const promotionDeadline = profile?.promotionDeadline
    ? DateTime.fromISO(profile.promotionDeadline)
    : null;
  const promotionSoon = promotionDeadline?.isValid
    ? promotionDeadline.diff(now, "days").days <= 60
    : Boolean(profile?.promotionTarget);
  const leverageLabel = promotionSoon
    ? isOffice
      ? "Promotion desk block"
      : "Promotion project block"
    : recommendation?.domain === "social" || socialThin
      ? isOffice
        ? "Network / async outreach"
        : "Network / startup leverage"
      : isOffice
        ? "Desk leverage block"
        : "Startup leverage";
  const leverageWhy = promotionSoon
    ? `Career hour toward ${profile?.promotionTarget ?? "your promotion"} (${
        promotionUpside > 0 ? formatCurrency(promotionUpside) : "big upside"
      }/yr).`
    : (firstSentence(recommendation?.action, 120) ??
      (isOffice
        ? "Desk-compatible ship, outreach, or learning that compounds."
        : "Ship, outreach, or learn something that compounds."));
  const joyLabel = isWeekend
    ? "Intentional joy block"
    : isOffice
      ? "Small evening joy"
      : "Short joy reset";
  const joyTime = isWeekend ? "2-4 hr cap" : isOffice ? "20-40 min" : "30-60 min";
  const joyMinutes = isWeekend ? 150 : isOffice ? 30 : 45;
  const lyftLabel = cashTight
    ? isOffice
      ? "Lyft cash block (evening if fee needs it)"
      : "Lyft cash block"
    : isOffice
      ? "Morning Lyft (~2 hr) + optional evening"
      : "Optional Lyft";
  const lyftTime = cashTight
    ? isOffice
      ? "60-90 min evening"
      : "2-3 hr"
    : isOffice
      ? "~2 hr morning; 60-90 min evening optional"
      : "60-90 min";
  const lyftWhy = cashTight
    ? "Weekly Hertz/Lyft fee may still need covering — weigh vs leverage blocks."
    : isOffice
      ? "Office rhythm often includes early morning Lyft before commute."
      : "Optional after body + leverage + joy.";
  const summary =
    shape === "weekend"
      ? "Protect body, one leverage block, and intentional joy. Lyft fills cash gaps, not the whole day."
      : shape === "office"
        ? "Office day — desk leverage around work, small evening joy, Lyft morning/evening."
        : "WFH day — deeper leverage block, capped joy, Lyft after deep work.";

  return {
    dayLabel: now.toFormat("cccc"),
    dateLabel: now.toFormat("MMMM d"),
    dayShape: shape,
    summary,
    blocks: [
      {
        key: "lyft" as const,
        label: lyftLabel,
        time: lyftTime,
        why: lyftWhy,
        domain: "financial",
        category: "lyft",
        leverage: "immediate_income" as const,
        minutes: cashTight ? (isOffice ? 75 : 150) : isOffice ? 120 : 75,
      },
      {
        key: "gym" as const,
        label: profile?.fitnessGoal ? "Gym / body goal" : "Gym / body reset",
        time: "45-75 min",
        why: profile?.fitnessGoal ?? "Keeps tomorrow's work energy from borrowing against today.",
        domain: "fitness",
        category: "gym",
        leverage: "long_term_leverage" as const,
        minutes: 60,
      },
      {
        key: "leverage" as const,
        label: leverageLabel,
        time: `${leverageMinutes} min`,
        why: leverageWhy,
        domain: promotionSoon
          ? "career"
          : recommendation?.domain ?? (socialThin ? "social" : "startup"),
        category: promotionSoon
          ? "promotion"
          : recommendation?.domain === "social" || socialThin
            ? "networking"
            : "build",
        leverage: "long_term_leverage" as const,
        minutes: leverageMinutes,
      },
      {
        key: "joy" as const,
        label: joyLabel,
        time: joyTime,
        why: isWeekend
          ? "Longer intentional joy fits weekends."
          : "Capped joy that fits the day shape.",
        domain: "personal",
        category: "joy",
        leverage: "long_term_leverage" as const,
        minutes: joyMinutes,
      },
    ],
  };
}
