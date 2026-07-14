import { DateTime } from "luxon";
import { dayShapeFor } from "@/lib/joy-ideas-shared";
import { LYFT_WEEKLY_PROGRAM_FEE_LABEL } from "@/lib/lyft";
import type { GrowthMetrics } from "@/lib/growth-agent";
import type { DayShape } from "@/lib/joy-ideas-shared";

export type TodayPlanBlockKey = "gym" | "leverage" | "joy" | "lyft";
export type TodayPlanBlockRole = "cash" | "training" | "focus" | "recovery";
export type TodayPlanBlockPriority = "locked" | "protect" | "optional";

export type TodayPlanBlock = {
  key: TodayPlanBlockKey;
  label: string;
  time: string;
  fit: string;
  why: string;
  domain: string;
  category: string;
  leverage: "immediate_income" | "long_term_leverage";
  minutes: number;
  impact: number;
  tone: "teal" | "sky" | "amber" | "slate";
  role: TodayPlanBlockRole;
  priority: TodayPlanBlockPriority;
  evidence: string | null;
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
  currentWeight?: number | null;
  targetWeight?: number | null;
  notes?: string | null;
} | null;

type BuildTodayPlanOptions = {
  memorySnippets?: string[];
};

const GYM_CONTEXT_RE =
  /\b(gym|workout|work out|training|lift|lifting|cardio|fitness|planet fitness|body|push|pull|legs|upper|lower|run)\b/i;
const GYM_SCHEDULE_RE =
  /\b(mon|tue|wed|thu|fri|sat|sun|morning|evening|after work|before work|office|wfh|split|push|pull|legs|upper|lower|cardio|chest|back|shoulder|arms)\b/i;

function compactSnippet(text: string, max = 150) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.length > max ? `${normalized.slice(0, max - 1).trim()}…` : normalized;
}

function gymRoutineFrom(profile: ProfileLike, memorySnippets: string[] = []) {
  const candidates = [
    profile?.fitnessGoal,
    profile?.notes,
    ...memorySnippets,
  ].filter((item): item is string => Boolean(item?.trim()));

  const chunks = candidates.flatMap((item) =>
    item
      .split(/\n+|[•*-]\s+|(?<=[.!?])\s+/)
      .map((part) => part.trim())
      .filter(Boolean),
  );

  const scheduled = chunks.find((part) => GYM_CONTEXT_RE.test(part) && GYM_SCHEDULE_RE.test(part));
  const general = chunks.find((part) => GYM_CONTEXT_RE.test(part));
  return compactSnippet(scheduled ?? general ?? "");
}

function weightTarget(profile: ProfileLike) {
  if (profile?.currentWeight && profile.targetWeight) {
    return ` Weight target: ${profile.currentWeight} -> ${profile.targetWeight} lb.`;
  }
  if (profile?.targetWeight) {
    return ` Weight target: ${profile.targetWeight} lb.`;
  }
  return "";
}

function gymFitFor(shape: DayShape) {
  if (shape === "office") {
    return {
      time: "45-75 min evening",
      fit: "After commute; do not pretend office midday is open.",
      label: "Training window",
    };
  }
  if (shape === "wfh") {
    return {
      time: "45-60 min midday",
      fit: "WFH flex pocket inside 9-5 when meetings allow.",
      label: "Gym window",
    };
  }
  return {
    time: "60-90 min flexible",
    fit: "Late morning or afternoon, with recovery built in.",
    label: "Gym + recovery",
  };
}

export function buildTodayPlan(
  metrics: GrowthMetrics,
  recommendation: RecommendationLike,
  profile: ProfileLike,
  options: BuildTodayPlanOptions = {},
) {
  const now = DateTime.local();
  const shape = dayShapeFor(now.weekday);
  const isWeekend = shape === "weekend";
  const isOffice = shape === "office";
  const gymFit = gymFitFor(shape);
  const gymRoutine = gymRoutineFrom(profile, options.memorySnippets);
  const cashTight =
    metrics.financialSignals.safeSpendToday < 20 || metrics.financialSignals.cashAvailable < 1000;
  // recommendation is reserved for the separate highest-leverage-move card, not a daily block.
  void recommendation;
  const recoveryLabel = isWeekend
    ? "Optional social / recovery"
    : isOffice
      ? "Optional evening reset"
      : "Optional recovery window";
  const joyTime = isWeekend ? "2-4 hr cap" : isOffice ? "20-40 min optional" : "30-60 min optional";
  const joyMinutes = isWeekend ? 150 : isOffice ? 30 : 45;
  const recoveryFit = isWeekend
    ? "Use only after one real anchor lands."
    : isOffice
      ? "After the workday/Lyft; skip if the evening is tight."
      : "Around the job day, not during protected training.";
  const recoveryWhy = isWeekend
    ? "Live DMV ideas are fine when the week earned it; keep it intentional."
    : isOffice
      ? "This is not fake daily fun. It is a capped reset only if cash and the workday are handled."
      : "This is not fake daily fun. It is a capped reset only if cash and training are handled.";
  const lyftLabel = cashTight
    ? `Lyft fee-floor block (${LYFT_WEEKLY_PROGRAM_FEE_LABEL})`
    : isWeekend
      ? "Morning Lyft"
      : isOffice
        ? "Morning Lyft (~2 hr) + optional evening"
        : "Morning Lyft before 9-5";
  const lyftTime = cashTight
    ? isOffice
      ? "60-90 min evening"
      : "2-3 hr"
    : isWeekend
      ? "AM before the day starts"
      : isOffice
        ? "~2 hr morning; 60-90 min evening optional"
        : "60-90 min before work";
  const lyftWhy = cashTight
    ? `Cover the ${LYFT_WEEKLY_PROGRAM_FEE_LABEL} weekly fee first; only surplus is profit to send toward Capital One goals.`
    : isWeekend
      ? `Every day starts with morning Lyft when possible; count profit only after the ${LYFT_WEEKLY_PROGRAM_FEE_LABEL} fee.`
      : isOffice
        ? `Office rhythm often includes early morning Lyft before commute; count profit only after the ${LYFT_WEEKLY_PROGRAM_FEE_LABEL} fee.`
        : `Thu-Fri WFH rhythm: Lyft before the locked 9-5 block; count profit only after the ${LYFT_WEEKLY_PROGRAM_FEE_LABEL} fee.`;
  const summary =
    shape === "weekend"
      ? `Weekend: morning Lyft AM like every day, then gym/recovery, social, and events.`
      : shape === "office"
        ? "Office day: morning Lyft baseline, then 9-5 work locked. No gym Mon-Wed. Add promotion only when you mean to protect it."
        : `WFH day: morning Lyft before 9-5, gym in a midday flex pocket. Promotion stays optional — not a default daily block.`;

  // Promotion/leverage is NOT an everyday rail. The separate "Highest-leverage move"
  // card covers that when it matters; do not auto-spotlight career work on every plan.
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
        fit: isWeekend
          ? "AM before gym, social, or events."
          : isOffice
            ? "Before commute; evening only if fee math still needs it."
            : "Before 9-5 on Thu-Fri WFH days.",
        why: lyftWhy,
        domain: "financial",
        category: "lyft",
        leverage: "immediate_income" as const,
        minutes: cashTight ? (isOffice ? 75 : 150) : isOffice ? 120 : 75,
        impact: cashTight ? 7 : 4,
        tone: "slate" as const,
        role: "cash" as const,
        priority: cashTight || isOffice || shape === "wfh" || isWeekend ? "locked" as const : "optional" as const,
        evidence: isWeekend
          ? "Morning Lyft AM every day including weekends."
          : isOffice
            ? "Mon-Wed office rhythm includes early Lyft before commute."
            : shape === "wfh"
              ? "Thu-Fri WFH rhythm: Lyft before 9-5 work."
              : null,
      },
      ...(isOffice ? [] : [{
        key: "gym" as const,
        label: gymRoutine ? "Training from routine" : gymFit.label,
        time: gymFit.time,
        fit: gymFit.fit,
        why: gymRoutine
          ? `${gymRoutine}${weightTarget(profile)}`
          : `Detailed gym split is not saved yet. Add your real days/times once, then this block will stop being generic.${weightTarget(profile)}`,
        domain: "fitness",
        category: "gym",
        leverage: "long_term_leverage" as const,
        minutes: 60,
        impact: 8,
        tone: "teal" as const,
        role: "training" as const,
        priority: "protect" as const,
        evidence: gymRoutine ? "Pulled from profile or stored gym memory." : "Needs your actual gym split saved.",
      }]),
      {
        key: "joy" as const,
        label: recoveryLabel,
        time: joyTime,
        fit: recoveryFit,
        why: recoveryWhy,
        domain: "personal",
        category: "joy",
        leverage: "long_term_leverage" as const,
        minutes: joyMinutes,
        impact: 5,
        tone: "amber" as const,
        role: "recovery" as const,
        priority: "optional" as const,
        evidence: "Live ideas still come from weather and day shape.",
      },
    ],
  };
}
