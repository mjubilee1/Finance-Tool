/**
 * Mastery-scale growth scoring.
 *
 * 100 is not "had a good two weeks." It is deep compounding maturity —
 * roughly 10,000 quality-weighted hours in a skill domain (Gladwell-style
 * order of magnitude), or years of maintained relationship equity.
 *
 * Recent activity adds momentum; it cannot alone push a domain to peak.
 * Relationships take years to build and decay quickly when neglected.
 */

import { DateTime } from "luxon";

export const GROWTH_SCORE_DOMAINS = [
  "career",
  "startup",
  "financial",
  "social",
  "fitness",
  "personal",
] as const;

export type GrowthDomain = (typeof GROWTH_SCORE_DOMAINS)[number];

export type DomainScores = Record<GrowthDomain, number>;

/** Quality-weighted hours that map to score 100 via sqrt mastery curve. */
export const MASTERY_HOURS = 10_000;

/** Soft ceiling for "strong early compounding" before multi-year depth exists. */
export const EARLY_DOMAIN_SOFT_CAP = 42;

/** Below this, a domain is treated as a bottleneck on the mastery scale. */
export const WEAK_DOMAIN_THRESHOLD = 22;

/** Baseline "improving" floor when there is no prior snapshot. */
export const IMPROVING_BASELINE = 18;

export type ScorableActivity = {
  domain: string;
  category: string;
  date: string;
  status?: string | null;
  minutesSpent?: number | null;
  impactScore?: number | null;
  leverage?: string | null;
};

export type ScorableContact = {
  id: string;
  name: string;
  relationshipType?: string | null;
  trustLevel?: number | null;
  collaborationPotential?: number | null;
  lastContactDate?: string | null;
  mutualValue?: string | null;
  notes?: string | null;
  status?: string | null;
  createdAt: Date | string;
  hasNotes?: boolean;
};

export type FinancialScoreInput = {
  cashAvailable: number;
  creditDebt: number;
  recentDailySpendAverage: number;
  /** 0–100 average progress on active money goals (optional). */
  goalProgressPct?: number;
};

const DEFAULT_MINUTES_BY_CATEGORY: Record<string, number> = {
  gym: 60,
  workout: 60,
  networking: 45,
  coffee: 45,
  work: 60,
  deep_work: 90,
  learning: 45,
  reading: 40,
  lyft: 120,
  shipping: 90,
  build: 90,
  community: 75,
  calendar: 45,
  user_plan: 60,
  dating: 90,
  mentorship: 60,
};

function clamp(score: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(score * 10) / 10));
}

export function masteryScoreFromHours(qualityHours: number, masteryHours = MASTERY_HOURS) {
  if (qualityHours <= 0) return 0;
  return clamp(100 * Math.sqrt(qualityHours / masteryHours));
}

/** Asymptotic recent-momentum score: strong weeks help, they don't crown you. */
export function momentumScoreFromHours(recentQualityHours: number, halfLifeHours = 18) {
  if (recentQualityHours <= 0) return 0;
  return clamp(100 * (1 - Math.exp(-recentQualityHours / halfLifeHours)));
}

export function defaultMinutesForCategory(category: string) {
  const key = category.trim().toLowerCase();
  return DEFAULT_MINUTES_BY_CATEGORY[key] ?? 40;
}

/**
 * Count completed investment only:
 * - skipped never counts
 * - planner checklist items count only when marked done
 * - calendar/manual logs count (status often still "planned" by schema default)
 */
export function isCompletedGrowthActivity(activity: ScorableActivity) {
  const status = (activity.status ?? "planned").toLowerCase();
  if (status === "skipped" || status === "hidden") return false;
  if (activity.category === "user_plan") return status === "done";
  return true;
}

export function qualityWeightedHours(activity: ScorableActivity) {
  if (!isCompletedGrowthActivity(activity)) return 0;
  const minutes =
    activity.minutesSpent != null && activity.minutesSpent > 0
      ? Math.min(480, activity.minutesSpent)
      : defaultMinutesForCategory(activity.category);
  const impact = Math.max(1, Math.min(10, activity.impactScore ?? 5));
  // impact 5 = 1.0x deliberate practice; 10 = 2.0x; 1 = 0.2x
  const quality = impact / 5;
  // Grinding immediate cash barely builds long-horizon mastery in most domains
  const leverage =
    activity.leverage === "immediate_income"
      ? activity.domain === "financial"
        ? 0.55
        : 0.22
      : 1;
  return (minutes / 60) * quality * leverage;
}

export function sumQualityHours(
  activities: ScorableActivity[],
  domain: GrowthDomain,
  asOfDate?: string,
  sinceDate?: string,
) {
  return activities.reduce((sum, activity) => {
    if (activity.domain !== domain) return sum;
    if (asOfDate && activity.date > asOfDate) return sum;
    if (sinceDate && activity.date < sinceDate) return sum;
    return sum + qualityWeightedHours(activity);
  }, 0);
}

/**
 * Domain score from logged time + impact.
 * ~70% lifetime mastery depth, ~30% recent momentum, soft-capped until depth exists.
 */
export function scoreDomainFromActivities(
  domain: GrowthDomain,
  activities: ScorableActivity[],
  asOfDate: string,
) {
  const asOf = DateTime.fromISO(asOfDate);
  const recentSince = asOf.minus({ days: 28 }).toISODate()!;
  const lifetimeHours = sumQualityHours(activities, domain, asOfDate);
  const recentHours = sumQualityHours(activities, domain, asOfDate, recentSince);

  const depth = masteryScoreFromHours(lifetimeHours);
  const momentum = momentumScoreFromHours(recentHours);
  let score = depth * 0.72 + momentum * 0.28;

  // Without multi-year logged depth, refuse false peaks.
  // Soft cap lifts gradually as lifetime hours approach ~1,200 (~score 35 depth).
  if (lifetimeHours < 1200) {
    const lift = lifetimeHours / 1200;
    const softCap = EARLY_DOMAIN_SOFT_CAP + (58 - EARLY_DOMAIN_SOFT_CAP) * lift;
    score = Math.min(score, softCap);
  }

  // Fresh start with zero logs: honest low floor, not a fake "average" 35.
  if (lifetimeHours <= 0) return 8;

  return clamp(score);
}

function daysBetween(from: string | null | undefined, to: string | null | undefined) {
  if (!from || !to) return null;
  const a = DateTime.fromISO(from);
  const b = DateTime.fromISO(to);
  if (!a.isValid || !b.isValid) return null;
  return Math.floor(b.diff(a, "days").days);
}

function contactCreatedIso(createdAt: Date | string) {
  if (createdAt instanceof Date) return DateTime.fromJSDate(createdAt).toISODate();
  const dt = DateTime.fromISO(String(createdAt));
  if (dt.isValid) return dt.toISODate();
  const parsed = DateTime.fromJSDate(new Date(createdAt));
  return parsed.isValid ? parsed.toISODate() : null;
}

function isLeverageRelationship(type: string) {
  return ["peer", "social", "dating", "mentor", "founder", "investor", "colleague"].includes(
    type,
  );
}

function isFamilyOrUnlabeled(type: string) {
  return ["family", "personal", "unlabeled", ""].includes(type);
}

/**
 * Relationship equity unit: maintained "relationship-years".
 * Years to build (sqrt age × trust × collab × notes), seconds to break (neglect decay).
 */
export function contactRelationshipYears(contact: ScorableContact, asOfDate: string) {
  const type = (contact.relationshipType ?? "").toLowerCase();
  const hasNotes = Boolean(
    contact.hasNotes || contact.notes?.trim() || contact.mutualValue?.trim(),
  );
  const created = contactCreatedIso(contact.createdAt);
  const ageDays = daysBetween(created, asOfDate) ?? 0;
  const ageYears = Math.max(ageDays, 0) / 365;

  // Phone-book imports with no notes are not compounding network yet
  if (isFamilyOrUnlabeled(type) && !hasNotes) return 0;
  if (!isLeverageRelationship(type) && !hasNotes && !isFamilyOrUnlabeled(type)) {
    // Unknown types still count lightly if notes exist
    if (!hasNotes) return 0;
  }

  const trust = Math.max(1, Math.min(5, contact.trustLevel ?? 3)) / 5;
  const collab = Math.max(1, Math.min(5, contact.collaborationPotential ?? 3)) / 5;
  const notesMultiplier = hasNotes ? 1.35 : 0.55;
  const typeWeight = isLeverageRelationship(type) ? 1 : isFamilyOrUnlabeled(type) ? 0.45 : 0.7;

  // sqrt(age): first year matters a lot; decade-long bonds are rare and valuable
  let equity = Math.sqrt(Math.max(ageYears, 1 / 365)) * trust * collab * notesMultiplier * typeWeight;

  const daysSince = daysBetween(contact.lastContactDate, asOfDate);
  const status = (contact.status ?? "active").toLowerCase();

  // Takes years to build — neglect collapses equity fast
  if (status === "dormant") {
    equity *= 0.05;
  } else if (status === "fading") {
    equity *= 0.22;
  } else if (daysSince === null) {
    // Never logged a touch — tiny residual if notes exist, else nothing
    equity *= hasNotes ? 0.15 : 0;
  } else if (daysSince > 120) {
    equity *= 0.08;
  } else if (daysSince > 60) {
    equity *= 0.25;
  } else if (daysSince > 30) {
    equity *= 0.55;
  } else if (daysSince > 14) {
    equity *= 0.85;
  }

  return equity;
}

/**
 * Social mastery: ~40 maintained relationship-years ≈ 100.
 * Recent networking adds momentum only; neglect on key contacts hurts hard.
 */
export function scoreSocialDomain(
  contacts: ScorableContact[],
  activities: ScorableActivity[],
  asOfDate: string,
) {
  const relationshipYears = contacts.reduce(
    (sum, contact) => sum + contactRelationshipYears(contact, asOfDate),
    0,
  );
  // 40 quality relationship-years ≈ full social mastery (a life's network, kept warm)
  const depth = masteryScoreFromHours(relationshipYears, 40);
  const recentSocialHours = sumQualityHours(
    activities,
    "social",
    asOfDate,
    DateTime.fromISO(asOfDate).minus({ days: 28 }).toISODate()!,
  );
  const momentum = momentumScoreFromHours(recentSocialHours, 10);

  let score = depth * 0.78 + momentum * 0.22;

  const neglectedLeverage = contacts.filter((c) => {
    const type = (c.relationshipType ?? "").toLowerCase();
    if (!isLeverageRelationship(type)) return false;
    const days = daysBetween(c.lastContactDate, asOfDate);
    const status = (c.status ?? "").toLowerCase();
    return status === "fading" || status === "dormant" || (days !== null && days >= 21);
  }).length;
  score -= Math.min(18, neglectedLeverage * 3.5);

  if (relationshipYears <= 0 && recentSocialHours <= 0) return 8;
  if (relationshipYears < 8) {
    const lift = relationshipYears / 8;
    score = Math.min(score, 28 + 20 * lift);
  }

  return clamp(score);
}

/**
 * Financial score on the same honest scale — cash/debt/spend matter,
 * but peak still means years of hardened floor + low leakage, not one good week.
 */
export function scoreFinancialDomain(input: FinancialScoreInput) {
  let score = 16;

  if (input.cashAvailable >= 8000) score += 14;
  else if (input.cashAvailable >= 4000) score += 10;
  else if (input.cashAvailable >= 2000) score += 6;
  else if (input.cashAvailable >= 1000) score += 2;
  else if (input.cashAvailable < 400) score -= 10;
  else score -= 4;

  if (input.creditDebt >= 15000) score -= 18;
  else if (input.creditDebt >= 8000) score -= 14;
  else if (input.creditDebt >= 4000) score -= 9;
  else if (input.creditDebt >= 1500) score -= 4;
  else if (input.creditDebt < 500) score += 6;

  if (input.recentDailySpendAverage > 120) score -= 16;
  else if (input.recentDailySpendAverage > 80) score -= 11;
  else if (input.recentDailySpendAverage > 55) score -= 5;
  else if (input.recentDailySpendAverage <= 40) score += 10;
  else if (input.recentDailySpendAverage <= 50) score += 5;

  if (input.goalProgressPct != null) {
    if (input.goalProgressPct >= 70) score += 6;
    else if (input.goalProgressPct >= 40) score += 3;
    else if (input.goalProgressPct < 15) score -= 2;
  }

  // Soft realism: exceptional money systems take years; refuse 90+ from snapshot math alone
  return clamp(Math.min(score, 62));
}

export function combineCompoundingScore(domains: DomainScores) {
  return clamp(
    domains.career * 0.15 +
      domains.startup * 0.18 +
      domains.financial * 0.22 +
      domains.social * 0.18 +
      domains.fitness * 0.12 +
      domains.personal * 0.15,
  );
}

export function computeDomainScores(input: {
  activities: ScorableActivity[];
  contacts: ScorableContact[];
  asOfDate: string;
  financial: FinancialScoreInput;
}): DomainScores {
  const { activities, contacts, asOfDate, financial } = input;
  return {
    career: scoreDomainFromActivities("career", activities, asOfDate),
    startup: scoreDomainFromActivities("startup", activities, asOfDate),
    financial: scoreFinancialDomain(financial),
    social: scoreSocialDomain(contacts, activities, asOfDate),
    fitness: scoreDomainFromActivities("fitness", activities, asOfDate),
    personal: scoreDomainFromActivities("personal", activities, asOfDate),
  };
}

export function domainHoursSummary(
  activities: ScorableActivity[],
  asOfDate: string,
): Record<GrowthDomain, { lifetimeHours: number; recentHours: number; masteryPct: number }> {
  const recentSince = DateTime.fromISO(asOfDate).minus({ days: 28 }).toISODate()!;
  const domains: GrowthDomain[] = [
    "career",
    "startup",
    "financial",
    "social",
    "fitness",
    "personal",
  ];
  const out = {} as Record<
    GrowthDomain,
    { lifetimeHours: number; recentHours: number; masteryPct: number }
  >;
  for (const domain of domains) {
    const lifetimeHours = sumQualityHours(activities, domain, asOfDate);
    const recentHours = sumQualityHours(activities, domain, asOfDate, recentSince);
    out[domain] = {
      lifetimeHours: Math.round(lifetimeHours * 10) / 10,
      recentHours: Math.round(recentHours * 10) / 10,
      masteryPct: masteryScoreFromHours(lifetimeHours),
    };
  }
  return out;
}
