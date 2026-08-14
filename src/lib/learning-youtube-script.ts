import {
  categoryLabel,
  founderPriorityIndex,
  isLearningCategoryId,
  type CategoryPercentages,
  type LearningCategoryId,
} from "@/lib/learning-plan";
import { dayShapeFor, type DayShape } from "@/lib/joy-ideas-shared";

export type DailyYoutubeScriptBundle = {
  dailyScript: string;
  customFeedPrompt: string;
  focusCategory: LearningCategoryId;
  supportCategories: LearningCategoryId[];
};

/** Category-specific cues for YouTube Premium custom-feed natural language. */
const CUSTOM_FEED_CUES: Record<
  LearningCategoryId,
  { vibe: string; examples: string; avoid: string }
> = {
  startup_product: {
    vibe: "founder product sense, shipping, and early-stage company building",
    examples:
      "MVP shipping, YC-style product decisions, founder operating cadence, distribution experiments",
    avoid: "generic hustle porn, get-rich-quick, or corporate ladder promo advice",
  },
  ai: {
    vibe: "forefront AI — frontier models, multi-agent systems, and large-scale model progress",
    examples:
      "GPT/Claude/Gemini-class models, multi-agent workflows, tool-using agents, evals, applied AI for founders",
    avoid: "sci-fi hype thumbnails, fearmongering AGI doom loops, or pure academic lectures with no builder takeaway",
  },
  sales_marketing: {
    vibe: "B2B / enterprise founder sales and go-to-market leverage",
    examples:
      "enterprise outbound, SaaS sales motions, ICP positioning, founder-led sales, pipeline systems",
    avoid: "MLM energy, consumer hustle gurus, or brand fluff with no B2B tactics",
  },
  finance_investing: {
    vibe: "founder-relevant capital allocation and personal financial floor",
    examples: "runway thinking, debt velocity, capital efficiency — light personal CFO literacy",
    avoid: "day-trading hype, crypto pumps, or fear-based money content",
  },
  leadership: {
    vibe: "founder leadership, high-agency decisions, and operator discipline",
    examples: "hard calls, focus systems, compounding habits, building with small teams",
    avoid: "corporate HR soft-skills fluff or empty motivational speeches",
  },
  real_estate: {
    vibe: "light real-estate awareness only (background wealth path)",
    examples: "occasional housing/market literacy — keep this a small side lane",
    avoid: "guru seminar funnels, wholesale spam, or real-estate-as-primary-career content",
  },
  emerging_tech: {
    vibe: "emergent tech on the frontier — AI infra, space, deep tech a founder should track",
    examples:
      "new model releases, AI infra shifts, multi-agent platforms, space/aerospace programs, deep-tech briefings",
    avoid: "gadget unboxings, clickbait Top-10 lists, gaming, or consumer gadget fluff",
  },
  founder_stories: {
    vibe: "real founder and company-building stories at the tech frontier",
    examples:
      "startup origin stories, hard lessons, scale / enterprise GTM narratives, builder interviews",
    avoid: "celebrity gossip, fake overnight-success myths, or pure entertainment",
  },
};

function rankedLearningCategories(percentages: CategoryPercentages): LearningCategoryId[] {
  return Object.entries(percentages)
    .filter((entry): entry is [LearningCategoryId, number] => isLearningCategoryId(entry[0]))
    .map(([id, percent]) => ({ id, percent: Math.max(0, percent) }))
    .filter((row) => row.percent > 0)
    .sort(
      (a, b) =>
        b.percent - a.percent ||
        founderPriorityIndex(a.id) - founderPriorityIndex(b.id) ||
        a.id.localeCompare(b.id)
    )
    .map((row) => row.id);
}

function weekdayFocusOffset(weekday: number): number {
  // Luxon 1=Mon … 7=Sun — rotate primary focus each day so the script switches up.
  return Math.max(0, weekday - 1);
}

function driveWindowFor(shape: DayShape): string {
  if (shape === "office") return "commute + short evening drive blocks";
  if (shape === "wfh") return "short midday flex or evening drive blocks";
  return "longer weekend drive / deep-listen blocks";
}

/**
 * Build today's learning intent + a paste-ready YouTube Premium custom-feed prompt.
 * Rotates primary focus across the user's topic mix by weekday (+ optional seed on refresh).
 */
export function buildDailyYoutubeScript(input: {
  percentages: CategoryPercentages;
  weeklyHours: number;
  weekday: number;
  dateLabel?: string;
  pickTitles?: string[];
  /** Extra rotation when user hits Refresh / switch-up. */
  rotationSeed?: number;
}): DailyYoutubeScriptBundle {
  const ranked = rankedLearningCategories(input.percentages);
  const focusPool =
    ranked.length > 0
      ? ranked
      : (["startup_product", "ai", "founder_stories"] as LearningCategoryId[]);
  const seed = Math.max(0, Math.floor(input.rotationSeed ?? 0));
  const focusCategory =
    focusPool[(weekdayFocusOffset(input.weekday) + seed) % focusPool.length];
  const supportCategories = focusPool.filter((id) => id !== focusCategory).slice(0, 2);
  const shape = dayShapeFor(input.weekday);
  const driveWindow = driveWindowFor(shape);
  const dailyMinutes = Math.max(20, Math.round((input.weeklyHours / 7) * 60));
  const focusLabel = categoryLabel(focusCategory);
  const supportLabels = supportCategories.map(categoryLabel);
  const cue = CUSTOM_FEED_CUES[focusCategory];
  const supportCue =
    supportCategories.length > 0
      ? supportCategories.map((id) => CUSTOM_FEED_CUES[id].vibe).join("; ")
      : "adjacent founder / AI builder context";

  const pickHint =
    input.pickTitles && input.pickTitles.length > 0
      ? ` In-app picks already lined up: ${input.pickTitles.slice(0, 3).join(" · ")}.`
      : "";

  const dailyScript = [
    `Today's drive-time script: lean into ${focusLabel}`,
    supportLabels.length > 0 ? `with light ${supportLabels.join(" + ")} on the side` : null,
    `(~${dailyMinutes} min across ${driveWindow}).`,
    `Goal: one concrete founder takeaway — frontier tech, multi-agent AI, or B2B GTM you can use this week.${pickHint}`,
  ]
    .filter(Boolean)
    .join(" ");

  const customFeedPrompt = [
    `Build me a focused founder learning feed for a software engineer + aspiring entrepreneur.`,
    `I want emergent technology and the tech frontier: multi-agent systems, forefront AI models, large-scale models, AI infra, space/aerospace programs, deep tech, and B2B / enterprise sales for founders.`,
    `Primary vibe today: ${cue.vibe}.`,
    `Lean into videos about ${cue.examples}.`,
    supportCategories.length > 0
      ? `Secondary spice only: ${supportCue}.`
      : null,
    `Keep most videos under ${Math.min(45, Math.max(12, Math.round(dailyMinutes / 2)))} minutes when possible so they fit ${driveWindow}.`,
    `Prefer actionable founder/operator content. Skip ${cue.avoid}.`,
    `Skip real-estate guru content, music mixes, sports, politics, and random entertainment.`,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    dailyScript,
    customFeedPrompt,
    focusCategory,
    supportCategories,
  };
}
