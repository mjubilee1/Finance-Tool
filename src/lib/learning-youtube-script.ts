import {
  categoryLabel,
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
    vibe: "startup building, product sense, YC-style operator lessons",
    examples: "shipping MVPs, distribution, founder product decisions",
    avoid: "generic hustle porn, get-rich-quick, or career-ladder corporate promo advice",
  },
  ai: {
    vibe: "practical AI agents, models, and builder workflows",
    examples: "LLM tools, agent demos under 20 mins, applied AI for builders",
    avoid: "sci-fi speculation, hype thumbnails, or pure academic lectures",
  },
  sales_marketing: {
    vibe: "founder sales, distribution, and sharp marketing leverage",
    examples: "outbound, positioning, storytelling that sells, growth loops",
    avoid: "MLM energy, empty motivation, or brand fluff with no tactics",
  },
  finance_investing: {
    vibe: "personal finance systems, debt velocity, and investing literacy",
    examples: "cash buffer, high-APR payoff, credit, long-term capital allocation",
    avoid: "day-trading hype, crypto pumps, or fear-based money content",
  },
  leadership: {
    vibe: "operator leadership, decision-making, and high-agency habits",
    examples: "hard conversations, focus, compounding discipline, founder mindset",
    avoid: "corporate HR soft-skills fluff or empty motivational speeches",
  },
  real_estate: {
    vibe: "practical real estate and housing path for a DMV builder",
    examples: "mortgage literacy, rental math, first property readiness",
    avoid: "guru seminar funnels, wholesale spam, or get-rich-with-no-money schemes",
  },
  emerging_tech: {
    vibe: "fast emerging tech briefings a builder can actually use",
    examples: "new tools, infra shifts, short Fireship-style explainers",
    avoid: "gadget unboxings, clickbait 'Top 10' lists, or unrelated gaming",
  },
  founder_stories: {
    vibe: "real founder stories and company-building lessons",
    examples: "startup origin stories, hard lessons, acquisition / scale narratives",
    avoid: "celebrity gossip, fake overnight-success myths, or pure entertainment",
  },
};

function rankedLearningCategories(percentages: CategoryPercentages): LearningCategoryId[] {
  return Object.entries(percentages)
    .filter((entry): entry is [LearningCategoryId, number] => isLearningCategoryId(entry[0]))
    .map(([id, percent]) => ({ id, percent: Math.max(0, percent) }))
    .filter((row) => row.percent > 0)
    .sort((a, b) => b.percent - a.percent || a.id.localeCompare(b.id))
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
    `Goal: absorb one concrete lesson you can use this week on the startup/build path — not random scrolling.${pickHint}`,
  ]
    .filter(Boolean)
    .join(" ");

  const customFeedPrompt = [
    `Build me a focused learning feed for a software developer + aspiring founder in the DMV.`,
    `Primary vibe today: ${cue.vibe}.`,
    `I want videos about ${cue.examples}.`,
    supportCategories.length > 0
      ? `Secondary spice only: ${supportCue}.`
      : null,
    `Keep most videos under ${Math.min(45, Math.max(12, Math.round(dailyMinutes / 2)))} minutes when possible so they fit ${driveWindow}.`,
    `Prefer actionable builder/operator content. Skip ${cue.avoid}.`,
    `No music mixes, sports highlights, political ragebait, or random entertainment.`,
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
