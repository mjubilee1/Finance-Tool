import { DateTime } from "luxon";
import { prisma } from "@/lib/prisma";
import {
  calculateGrowthMetrics,
  generateHighLeverageRecommendation,
  GROWTH_DOMAINS,
} from "@/lib/growth-agent";
import { storeFinancialMemories } from "@/lib/financial-memory";
import { dayShapeFor } from "@/lib/joy-ideas-shared";
import { buildTodayPlan, type TodayPlanBlockKey } from "@/lib/today-plan";

type CfoBriefHeadline = {
  status: string | null;
  safeSpendToday: number | null;
  spendingWarning: string | null;
  todaysMove: string | null;
  systemImpact: string | null;
};

export type TodayBriefContext = {
  date: string;
  timeGreeting: string;
  dayShape: string;
  dayLabel: string;
  dateLabel: string;
  plan: ReturnType<typeof buildTodayPlan>;
  recommendation: {
    id: string;
    action: string;
    whyItMatters: string;
    status: string;
    domain: string | null;
    timeRequiredMinutes: number;
  } | null;
  moneyHeadline: CfoBriefHeadline;
  todayActivities: Array<{
    title: string;
    domain: string;
    category: string;
    leverage: string;
    minutesSpent: number | null;
    notes: string | null;
  }>;
  userPlanBlocks: Array<{
    title: string;
    domain: string;
    minutesSpent: number | null;
    notes: string | null;
  }>;
  completedBlockKeys: TodayPlanBlockKey[];
  skippedBlockKeys: TodayPlanBlockKey[];
};

export type TodayUpdatesPayload = {
  skipPlanBlock?: TodayPlanBlockKey | null;
  skipReason?: string | null;
  markMoveStatus?: "skipped" | "done" | null;
  regenerateTodaysMove?: boolean;
  logActivity?: {
    title: string;
    domain: string;
    category: string;
    leverage?: string;
    minutesSpent?: number;
    notes?: string;
  } | null;
};

function timeGreeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function parseMoneyHeadline(summaryJson: string | null): CfoBriefHeadline {
  if (!summaryJson) {
    return {
      status: null,
      safeSpendToday: null,
      spendingWarning: null,
      todaysMove: null,
      systemImpact: null,
    };
  }

  try {
    const parsed = JSON.parse(summaryJson) as {
      cfoBrief?: Partial<CfoBriefHeadline>;
    };
    const brief = parsed.cfoBrief ?? {};
    return {
      status: typeof brief.status === "string" ? brief.status : null,
      safeSpendToday:
        typeof brief.safeSpendToday === "number" ? brief.safeSpendToday : null,
      spendingWarning:
        typeof brief.spendingWarning === "string" ? brief.spendingWarning : null,
      todaysMove: typeof brief.todaysMove === "string" ? brief.todaysMove : null,
      systemImpact:
        typeof brief.systemImpact === "string" ? brief.systemImpact : null,
    };
  } catch {
    return {
      status: null,
      safeSpendToday: null,
      spendingWarning: null,
      todaysMove: null,
      systemImpact: null,
    };
  }
}

function blockKeyFromActivity(
  activity: { domain: string; category: string; title: string; notes: string | null },
): TodayPlanBlockKey | null {
  const haystack = `${activity.title} ${activity.notes ?? ""} ${activity.category}`.toLowerCase();
  if (activity.category === "lyft" || haystack.includes("lyft")) return "lyft";
  if (activity.category === "gym" || haystack.includes("gym")) return "gym";
  if (activity.category === "joy" || haystack.includes("joy")) return "joy";
  if (
    ["build", "promotion", "networking"].includes(activity.category) ||
    ["career", "startup", "social"].includes(activity.domain)
  ) {
    return "leverage";
  }
  return null;
}

function isSkippedActivity(notes: string | null, title: string) {
  const text = `${notes ?? ""} ${title}`.toLowerCase();
  return /\b(skipped|didn't|did not|missed|forgot)\b/.test(text);
}

export async function buildTodayBriefContext(userId: string): Promise<TodayBriefContext> {
  const now = DateTime.local();
  const today = now.toISODate()!;
  const shape = dayShapeFor(now.weekday);

  const [metrics, recommendation, profile, snapshot, activities] = await Promise.all([
    calculateGrowthMetrics(userId),
    prisma.growthRecommendation.findUnique({
      where: { userId_date: { userId, date: today } },
    }),
    prisma.lifeLeverageProfile.findUnique({ where: { userId } }),
    prisma.dailyFinancialSnapshot.findUnique({
      where: { userId_date: { userId, date: today } },
    }),
    prisma.growthActivity.findMany({
      where: { userId, date: today },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const plan = buildTodayPlan(metrics, recommendation, profile);
  const todayActivities = activities.map((activity) => ({
    title: activity.title,
    domain: activity.domain,
    category: activity.category,
    leverage: activity.leverage,
    minutesSpent: activity.minutesSpent,
    notes: activity.notes,
  }));

  const completedBlockKeys = new Set<TodayPlanBlockKey>();
  const skippedBlockKeys = new Set<TodayPlanBlockKey>();

  for (const activity of activities) {
    const key = blockKeyFromActivity(activity);
    if (!key) continue;
    if (isSkippedActivity(activity.notes, activity.title)) {
      skippedBlockKeys.add(key);
    } else {
      completedBlockKeys.add(key);
    }
  }

  return {
    date: today,
    timeGreeting: timeGreeting(now.hour),
    dayShape: shape,
    dayLabel: plan.dayLabel,
    dateLabel: plan.dateLabel,
    plan,
    recommendation: recommendation
      ? {
          id: recommendation.id,
          action: recommendation.action,
          whyItMatters: recommendation.whyItMatters,
          status: recommendation.status,
          domain: recommendation.domain,
          timeRequiredMinutes: recommendation.timeRequiredMinutes,
        }
      : null,
    moneyHeadline: parseMoneyHeadline(snapshot?.summary ?? null),
    todayActivities,
    userPlanBlocks: activities
      .filter((activity) => activity.category === "user_plan")
      .map((activity) => ({
        title: activity.title,
        domain: activity.domain,
        minutesSpent: activity.minutesSpent,
        notes: activity.notes,
      })),
    completedBlockKeys: [...completedBlockKeys],
    skippedBlockKeys: [...skippedBlockKeys],
  };
}

function planBlockDefaults(key: TodayPlanBlockKey, plan: TodayBriefContext["plan"]) {
  return plan.blocks.find((block) => block.key === key) ?? null;
}

export async function applyTodayUpdates(
  userId: string,
  updates: TodayUpdatesPayload,
  todayBrief: TodayBriefContext,
) {
  const today = todayBrief.date;
  const applied: string[] = [];

  if (updates.logActivity?.title?.trim()) {
    const domain = updates.logActivity.domain;
    if ((GROWTH_DOMAINS as readonly string[]).includes(domain)) {
      await prisma.growthActivity.create({
        data: {
          userId,
          date: today,
          domain,
          category: updates.logActivity.category || "coach_update",
          title: updates.logActivity.title.trim().slice(0, 160),
          notes: updates.logActivity.notes?.trim() || "Logged from coach chat.",
          leverage:
            updates.logActivity.leverage === "immediate_income"
              ? "immediate_income"
              : "long_term_leverage",
          minutesSpent: updates.logActivity.minutesSpent ?? null,
          impactScore: 5,
        },
      });
      applied.push(`Logged: ${updates.logActivity.title.trim()}`);
    }
  }

  if (updates.skipPlanBlock) {
    const allowed: TodayPlanBlockKey[] = ["lyft", "gym", "leverage", "joy"];
    if (allowed.includes(updates.skipPlanBlock)) {
      const block = planBlockDefaults(updates.skipPlanBlock, todayBrief.plan);
      const reason = updates.skipReason?.trim() || "User reported skipping this planned block.";
      await prisma.growthActivity.create({
        data: {
          userId,
          date: today,
          domain: block?.domain ?? "personal",
          category: block?.category ?? updates.skipPlanBlock,
          title: `Skipped ${block?.label ?? updates.skipPlanBlock}`,
          notes: reason,
          leverage: block?.leverage ?? "long_term_leverage",
          minutesSpent: 0,
          impactScore: 3,
        },
      });
      applied.push(`Skipped: ${block?.label ?? updates.skipPlanBlock}`);
    }
  }

  if (updates.markMoveStatus && todayBrief.recommendation) {
    const existing = await prisma.growthRecommendation.findFirst({
      where: { id: todayBrief.recommendation.id, userId },
    });
    if (existing) {
      await prisma.growthRecommendation.update({
        where: { id: existing.id },
        data: { status: updates.markMoveStatus },
      });
      await storeFinancialMemories(
        userId,
        [
          {
            title:
              updates.markMoveStatus === "skipped"
                ? `Skipped move ${today}`
                : `Completed move ${today}`,
            content:
              updates.markMoveStatus === "skipped"
                ? `User skipped today's growth move: "${existing.action}". Propose a different leverage theme for the rest of today.`
                : `User completed today's growth move: "${existing.action}".`,
            importanceScore: updates.markMoveStatus === "skipped" ? 0.85 : 0.7,
          },
        ],
        {
          source: "coach-chat",
          type: updates.markMoveStatus === "skipped" ? "GROWTH_SKIP" : "GROWTH_DONE",
          limit: 1,
          minImportance: 0.5,
        },
      );
      applied.push(`Marked today's move as ${updates.markMoveStatus}`);
    }
  }

  let refreshedMove: Awaited<ReturnType<typeof generateHighLeverageRecommendation>> | null = null;
  if (updates.regenerateTodaysMove) {
    refreshedMove = await generateHighLeverageRecommendation(userId, { force: true });
    applied.push("Refreshed today's move");
  }

  return { applied, refreshedMove };
}

export function formatTodayBriefForSpeech(
  brief: TodayBriefContext,
  userName?: string | null,
) {
  const name = userName?.trim() || "Trell";
  const lines = [
    `${brief.timeGreeting}, ${name}. ${brief.dayLabel}, ${brief.dayShape} day.`,
    "",
    "Schedule",
    `• ${brief.plan.summary}`,
  ];

  for (const block of brief.plan.blocks) {
    const status = brief.skippedBlockKeys.includes(block.key)
      ? "skipped"
      : brief.completedBlockKeys.includes(block.key)
        ? "done"
        : "planned";
    lines.push(`• ${block.label} (${block.time}) — ${status}. ${block.why}`);
  }

  if (brief.userPlanBlocks.length > 0) {
    for (const block of brief.userPlanBlocks) {
      lines.push(`• Your block: ${block.title}`);
    }
  }

  lines.push("", "Money quick");
  if (brief.moneyHeadline.status) {
    lines.push(`• Status: ${brief.moneyHeadline.status}.`);
  }
  if (brief.moneyHeadline.safeSpendToday != null) {
    lines.push(`• About $${Math.round(brief.moneyHeadline.safeSpendToday)} room for food and fun today.`);
  }
  if (brief.moneyHeadline.spendingWarning) {
    lines.push(`• ${brief.moneyHeadline.spendingWarning}`);
  }

  lines.push("", "Today's move");
  if (brief.recommendation) {
    lines.push(`• ${brief.recommendation.action}`);
    if (brief.recommendation.status !== "pending") {
      lines.push(`• Move status: ${brief.recommendation.status}.`);
    }
  } else {
    lines.push("• Open Growth to generate today's highest-leverage action.");
  }

  return lines.join("\n");
}
