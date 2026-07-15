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
import { applyMentionsToActivityText } from "@/lib/growth-calendar-sync";
import {
  getPlannerDayLayout,
  loadGrowthActivitiesForDate,
  resolvePlannerOverride,
  serializeUserPlanBlock,
  systemPlanRef,
  type PlannerDayLayoutData,
} from "@/lib/planner";

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
    id: string;
    title: string;
    domain: string;
    minutesSpent: number | null;
    notes: string | null;
    status: "planned" | "done" | "skipped";
    sortOrder: number;
    timeLabel: string | null;
    date: string;
    ref: string;
  }>;
  completedBlockKeys: TodayPlanBlockKey[];
  skippedBlockKeys: TodayPlanBlockKey[];
  plannerLayout: PlannerDayLayoutData;
  planBlocks: Array<{
    key: TodayPlanBlockKey;
    label: string;
    time: string;
    fit: string;
    why: string;
    role: string;
    priority: string;
    evidence: string | null;
    status: "planned" | "done" | "skipped" | "hidden";
    ref: string;
    hidden: boolean;
  }>;
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
    date?: string;
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
  if (activity.category === "work" || /\b9-5\b|\b9–5\b|\bw2\b|\bjob day\b/.test(haystack)) {
    return "work";
  }
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

  const [metrics, recommendation, profile, snapshot, activities, gymMemories, plannerLayout] =
    await Promise.all([
      calculateGrowthMetrics(userId),
      prisma.growthRecommendation.findUnique({
        where: { userId_date: { userId, date: today } },
      }),
      prisma.lifeLeverageProfile.findUnique({ where: { userId } }),
      prisma.dailyFinancialSnapshot.findUnique({
        where: { userId_date: { userId, date: today } },
      }),
      loadGrowthActivitiesForDate(userId, today),
      prisma.financialMemory.findMany({
        where: {
          userId,
          OR: [
            { title: { contains: "gym", mode: "insensitive" } },
            { content: { contains: "gym", mode: "insensitive" } },
            { title: { contains: "workout", mode: "insensitive" } },
            { content: { contains: "workout", mode: "insensitive" } },
            { title: { contains: "fitness", mode: "insensitive" } },
            { content: { contains: "fitness", mode: "insensitive" } },
            { content: { contains: "training", mode: "insensitive" } },
          ],
        },
        orderBy: [{ importanceScore: "desc" }, { updatedAt: "desc" }],
        take: 4,
        select: { title: true, content: true },
      }),
      getPlannerDayLayout(userId, today),
    ]);

  const plan = buildTodayPlan(metrics, recommendation, profile, {
    memorySnippets: gymMemories.map((memory) => `${memory.title}: ${memory.content}`),
  });
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
    if (activity.category === "user_plan") continue;
    const key = blockKeyFromActivity(activity);
    if (!key) continue;
    if (activity.status === "skipped" || isSkippedActivity(activity.notes, activity.title)) {
      skippedBlockKeys.add(key);
    } else {
      // Logged activities count as done (legacy rows default to status "planned").
      completedBlockKeys.add(key);
    }
  }

  for (const [key, override] of Object.entries(plannerLayout.overrides)) {
    if (key !== "lyft" && key !== "work" && key !== "gym" && key !== "leverage" && key !== "joy") {
      continue;
    }
    const blockKey = key as TodayPlanBlockKey;
    if (override.status === "done") {
      completedBlockKeys.add(blockKey);
      skippedBlockKeys.delete(blockKey);
    } else if (override.status === "skipped") {
      skippedBlockKeys.add(blockKey);
      completedBlockKeys.delete(blockKey);
    } else if (override.status === "planned") {
      completedBlockKeys.delete(blockKey);
      skippedBlockKeys.delete(blockKey);
    }
  }

  // Also pick up week-template aliases (e.g. 2026-07-14-lyft) onto today keys.
  for (const key of ["lyft", "work", "gym", "leverage", "joy"] as const) {
    const override = resolvePlannerOverride(plannerLayout.overrides, today, key);
    if (!override?.status) continue;
    if (override.status === "done") {
      completedBlockKeys.add(key);
      skippedBlockKeys.delete(key);
    } else if (override.status === "skipped") {
      skippedBlockKeys.add(key);
      completedBlockKeys.delete(key);
    } else if (override.status === "planned") {
      completedBlockKeys.delete(key);
      skippedBlockKeys.delete(key);
    }
  }

  const planBlocks = plan.blocks
    .map((block) => {
      const override = resolvePlannerOverride(plannerLayout.overrides, today, block.key);
      const status =
        override?.status === "hidden"
          ? "hidden"
          : override?.status === "done" || completedBlockKeys.has(block.key)
            ? "done"
            : override?.status === "skipped" || skippedBlockKeys.has(block.key)
              ? "skipped"
              : "planned";
      return {
        key: block.key,
        label: override?.label?.trim() || block.label,
        time: override?.timeLabel?.trim() || block.time,
        fit: block.fit,
        why: override?.notes?.trim() || block.why,
        role: block.role,
        priority: block.priority,
        evidence: block.evidence,
        status: status as "planned" | "done" | "skipped" | "hidden",
        ref: systemPlanRef(block.key),
        hidden: status === "hidden",
      };
    })
    .filter((block) => !block.hidden);

  return {
    date: today,
    timeGreeting: timeGreeting(now.hour),
    dayShape: shape,
    dayLabel: plan.dayLabel,
    dateLabel: plan.dateLabel,
    plan: {
      ...plan,
      blocks: planBlocks.map((block) => {
        const original = plan.blocks.find((item) => item.key === block.key)!;
        return {
          ...original,
          label: block.label,
          time: block.time,
          why: block.why,
        };
      }),
    },
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
      .map((activity) => serializeUserPlanBlock(activity)),
    completedBlockKeys: [...completedBlockKeys],
    skippedBlockKeys: [...skippedBlockKeys],
    plannerLayout,
    planBlocks,
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
    const targetDate = updates.logActivity.date?.trim() || today;
    if ((GROWTH_DOMAINS as readonly string[]).includes(domain)) {
      await prisma.growthActivity.create({
        data: {
          userId,
          date: targetDate,
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
      await applyMentionsToActivityText(
        userId,
        `${updates.logActivity.title} ${updates.logActivity.notes ?? ""}`,
        targetDate,
        updates.logActivity.title.trim(),
      );
      applied.push(`Logged: ${updates.logActivity.title.trim()}${targetDate !== today ? ` on ${targetDate}` : ""}`);
    }
  }

  if (updates.skipPlanBlock) {
    const allowed: TodayPlanBlockKey[] = ["lyft", "work", "gym", "leverage", "joy"];
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
    if (status === "skipped") {
      lines.push(
        `• ${block.label} (${block.time}) — skipped.${block.why?.trim() ? ` Why: ${block.why.trim()}` : ""}`,
      );
    } else {
      lines.push(`• ${block.label} (${block.time}) — ${status}. ${block.why}`);
    }
  }

  if (brief.userPlanBlocks.length > 0) {
    for (const block of brief.userPlanBlocks) {
      const status = block.status === "done" ? "done" : block.status === "skipped" ? "skipped" : "planned";
      if (status === "skipped") {
        lines.push(
          `• Your block: ${block.title} — skipped.${block.notes?.trim() ? ` Why: ${block.notes.trim()}` : ""}`,
        );
      } else {
        lines.push(`• Your block: ${block.title} — ${status}`);
      }
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
    lines.push("• Ask Coach to generate today's highest-leverage action.");
  }

  return lines.join("\n");
}
