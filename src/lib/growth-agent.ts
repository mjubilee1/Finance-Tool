import { DateTime } from "luxon";
import { openai } from "./openai";
import { prisma } from "./prisma";
import { getFocusAccounts, filterTransactionsForDailySpend } from "./account-focus";
import { calculateDailyBriefMetrics } from "./daily-brief";
import { storeFinancialMemories } from "./financial-memory";

export const GROWTH_DOMAINS = [
  "career",
  "startup",
  "financial",
  "social",
  "fitness",
  "personal",
] as const;

export type GrowthDomain = (typeof GROWTH_DOMAINS)[number];

export type DomainScores = {
  career: number;
  startup: number;
  financial: number;
  social: number;
  fitness: number;
  personal: number;
};

export type GrowthMetrics = {
  date: string;
  compoundingScore: number;
  domains: DomainScores;
  bottlenecks: string[];
  improving: boolean;
  activityCounts: Record<GrowthDomain, number>;
  leverageMix: { immediateIncome: number; longTermLeverage: number };
  contactsNeedingAttention: Array<{ id: string; name: string; daysSinceContact: number | null; status: string }>;
  goalsBehind: Array<{ name: string; progressPct: number; targetDate: string | null }>;
  financialSignals: {
    cashAvailable: number;
    recentDailySpendAverage: number;
    safeSpendToday: number;
    netWorthProxy: number;
    creditDebt: number;
  };
};

export type GrowthRecommendationPayload = {
  action: string;
  whyItMatters: string;
  longTermBenefit: string;
  timeRequiredMinutes: number;
  opportunityCost: string;
  relatedGoals: string[];
  relatedPeople: string[];
  nextActions: string[];
  leverageType: "immediate_income" | "long_term_leverage";
  domain: GrowthDomain | null;
};

const GROWTH_AGENT_INSTRUCTIONS = `
You are the user's Growth Intelligence agent inside a Personal Life OS.
Your job is NOT to organize life. Your job is to answer:
"What is the highest-leverage thing I can do next to maximize long-term growth?"

Core philosophy: everything compounds — relationships, skills, reputation, income,
investments, businesses, health, knowledge, opportunities, and time.
Evaluate decisions by long-term impact, not only immediate reward.

Founder principles:
- Think in years, not days.
- Optimize for compounding.
- Build leverage and systems.
- Strengthen relationships over time.
- Review progress and adjust from evidence.
- Prefer creating assets over consuming.

Leverage categories:
- Immediate income: Lyft, overtime, contract work
- Long-term leverage: building software, startup work, networking, learning,
  relationship building, content, hiring, systems

Sometimes skipping a small amount of immediate income (e.g. one Lyft evening)
to meet a founder, ship a feature, or strengthen a relationship is the better move.
Explain opportunity cost explicitly.

Be direct, practical, and numbers-aware. No fluff. No generic motivation.
`;

function clamp(score: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(score * 10) / 10));
}

function weekStartIso(date = DateTime.local()) {
  return date.startOf("week").toISODate()!;
}

function daysBetween(from: string | null | undefined, to: string | null | undefined) {
  if (!from || !to) return null;
  const a = DateTime.fromISO(from);
  const b = DateTime.fromISO(to);
  if (!a.isValid || !b.isValid) return null;
  return Math.floor(b.diff(a, "days").days);
}

function emptyDomainCounts(): Record<GrowthDomain, number> {
  return {
    career: 0,
    startup: 0,
    financial: 0,
    social: 0,
    fitness: 0,
    personal: 0,
  };
}

function scoreFromActivities(
  domain: GrowthDomain,
  activities: Array<{ domain: string; impactScore: number; date: string }>,
  sinceDate: string,
) {
  const recent = activities.filter((a) => a.domain === domain && a.date >= sinceDate);
  if (recent.length === 0) return 35;
  const impact = recent.reduce((sum, a) => sum + a.impactScore, 0);
  const frequencyBonus = Math.min(25, recent.length * 6);
  return clamp(40 + impact * 3 + frequencyBonus);
}

export async function calculateGrowthMetrics(userId: string): Promise<GrowthMetrics> {
  const today = DateTime.local().toISODate()!;
  const fourteenDaysAgo = DateTime.local().minus({ days: 14 }).toISODate()!;
  const thirtyDaysAgo = DateTime.local().minus({ days: 30 }).toISODate()!;

  const [activities, contacts, goals, accounts, transactions, priorSnapshots] = await Promise.all([
    prisma.growthActivity.findMany({
      where: { userId, date: { gte: thirtyDaysAgo } },
      orderBy: { date: "desc" },
    }),
    prisma.growthContact.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.financialGoal.findMany({
      where: { userId, status: "active" },
    }),
    prisma.financialAccount.findMany({ where: { userId } }),
    prisma.transaction.findMany({
      where: { userId, date: { gte: thirtyDaysAgo } },
      orderBy: { date: "desc" },
    }),
    prisma.growthSnapshot.findMany({
      where: { userId },
      orderBy: { date: "desc" },
      take: 8,
    }),
  ]);

  const focusAccounts = getFocusAccounts(accounts);
  const spendingTransactions = filterTransactionsForDailySpend(transactions, accounts);
  const brief = calculateDailyBriefMetrics({
    date: today,
    transactions: spendingTransactions,
    accounts: focusAccounts,
  });

  const depository = accounts
    .filter((a) => a.type === "depository")
    .reduce((sum, a) => sum + (a.availableBalance ?? a.currentBalance ?? 0), 0);
  const creditDebt = accounts
    .filter((a) => a.type === "credit")
    .reduce((sum, a) => sum + Math.max(0, a.currentBalance ?? 0), 0);
  const investment = accounts
    .filter((a) => a.type === "investment" || a.type === "brokerage")
    .reduce((sum, a) => sum + (a.currentBalance ?? 0), 0);
  const netWorthProxy = depository + investment - creditDebt;

  const activityCounts = emptyDomainCounts();
  for (const activity of activities.filter((a) => a.date >= fourteenDaysAgo)) {
    if ((GROWTH_DOMAINS as readonly string[]).includes(activity.domain)) {
      activityCounts[activity.domain as GrowthDomain] += 1;
    }
  }

  const immediateIncome = activities.filter(
    (a) => a.date >= fourteenDaysAgo && a.leverage === "immediate_income",
  ).length;
  const longTermLeverage = activities.filter(
    (a) => a.date >= fourteenDaysAgo && a.leverage === "long_term_leverage",
  ).length;

  const contactsNeedingAttention = contacts
    .map((c) => {
      const days = daysBetween(c.lastContactDate, today);
      const fading =
        c.status === "fading" ||
        c.status === "dormant" ||
        days === null ||
        days >= 21;
      return fading
        ? {
            id: c.id,
            name: c.name,
            daysSinceContact: days,
            status: c.status,
          }
        : null;
    })
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .slice(0, 8);

  const goalsBehind = goals
    .map((g) => {
      const progressPct =
        g.targetAmount > 0 ? clamp((g.currentAmount / g.targetAmount) * 100) : 0;
      const daysLeft = daysBetween(today, g.targetDate);
      const behind =
        Boolean(g.targetDate) &&
        ((daysLeft !== null && daysLeft < 60 && progressPct < 50) ||
          (daysLeft !== null && daysLeft < 0 && progressPct < 100));
      return behind
        ? { name: g.name, progressPct, targetDate: g.targetDate }
        : null;
    })
    .filter((g): g is NonNullable<typeof g> => Boolean(g));

  const debtPressure = creditDebt > 5000 ? 15 : creditDebt > 2000 ? 8 : 0;
  const cashStrength = brief.cashAvailable > 3000 ? 20 : brief.cashAvailable > 1500 ? 10 : -10;
  const spendDiscipline =
    brief.recentDailySpendAverage > 70 ? -15 : brief.recentDailySpendAverage > 45 ? -5 : 10;

  const domains: DomainScores = {
    career: scoreFromActivities("career", activities, fourteenDaysAgo),
    startup: scoreFromActivities("startup", activities, fourteenDaysAgo),
    financial: clamp(55 + cashStrength - debtPressure + spendDiscipline),
    social: clamp(
      scoreFromActivities("social", activities, fourteenDaysAgo) -
        Math.min(20, contactsNeedingAttention.length * 4) +
        Math.min(15, contacts.filter((c) => c.status === "active").length * 2),
    ),
    fitness: scoreFromActivities("fitness", activities, fourteenDaysAgo),
    personal: scoreFromActivities("personal", activities, fourteenDaysAgo),
  };

  const compoundingScore = clamp(
    domains.career * 0.15 +
      domains.startup * 0.18 +
      domains.financial * 0.22 +
      domains.social * 0.18 +
      domains.fitness * 0.12 +
      domains.personal * 0.15,
  );

  const bottlenecks: string[] = [];
  const domainEntries = Object.entries(domains) as Array<[GrowthDomain, number]>;
  const weakest = [...domainEntries].sort((a, b) => a[1] - b[1]).slice(0, 2);
  for (const [domain, score] of weakest) {
    if (score < 55) {
      bottlenecks.push(`${domain} momentum is weak (score ${Math.round(score)})`);
    }
  }
  if (contactsNeedingAttention.length >= 3) {
    bottlenecks.push(`${contactsNeedingAttention.length} relationships need follow-up`);
  }
  if (goalsBehind.length > 0) {
    bottlenecks.push(`Goals behind schedule: ${goalsBehind.map((g) => g.name).join(", ")}`);
  }
  if (longTermLeverage === 0 && immediateIncome > 0) {
    bottlenecks.push("Time is skewed to immediate income over long-term leverage");
  }
  if (brief.recentDailySpendAverage > 60) {
    bottlenecks.push(
      `Daily spend ~$${Math.round(brief.recentDailySpendAverage)} is draining compounding capacity`,
    );
  }

  const previousScore = priorSnapshots.find((s) => s.date !== today)?.compoundingScore;
  const improving =
    previousScore === undefined ? compoundingScore >= 55 : compoundingScore >= previousScore - 1;

  return {
    date: today,
    compoundingScore,
    domains,
    bottlenecks,
    improving,
    activityCounts,
    leverageMix: { immediateIncome, longTermLeverage },
    contactsNeedingAttention,
    goalsBehind,
    financialSignals: {
      cashAvailable: brief.cashAvailable,
      recentDailySpendAverage: brief.recentDailySpendAverage,
      safeSpendToday: brief.safeSpendToday,
      netWorthProxy,
      creditDebt,
    },
  };
}

export async function persistGrowthSnapshot(userId: string, metrics: GrowthMetrics) {
  return prisma.growthSnapshot.upsert({
    where: { userId_date: { userId, date: metrics.date } },
    create: {
      userId,
      date: metrics.date,
      compoundingScore: metrics.compoundingScore,
      careerScore: metrics.domains.career,
      startupScore: metrics.domains.startup,
      financialScore: metrics.domains.financial,
      socialScore: metrics.domains.social,
      fitnessScore: metrics.domains.fitness,
      personalScore: metrics.domains.personal,
      bottlenecks: metrics.bottlenecks,
      improving: metrics.improving,
      metricsJson: JSON.stringify(metrics),
    },
    update: {
      compoundingScore: metrics.compoundingScore,
      careerScore: metrics.domains.career,
      startupScore: metrics.domains.startup,
      financialScore: metrics.domains.financial,
      socialScore: metrics.domains.social,
      fitnessScore: metrics.domains.fitness,
      personalScore: metrics.domains.personal,
      bottlenecks: metrics.bottlenecks,
      improving: metrics.improving,
      metricsJson: JSON.stringify(metrics),
    },
  });
}

function buildFallbackRecommendation(metrics: GrowthMetrics): GrowthRecommendationPayload {
  const topContact = metrics.contactsNeedingAttention[0];
  const bottleneck = metrics.bottlenecks[0];

  if (topContact) {
    return {
      action: `Reconnect with ${topContact.name}`,
      whyItMatters:
        "Relationship equity compounds only when maintained. A short, high-signal follow-up prevents this connection from going dormant.",
      longTermBenefit:
        "Strong relationships unlock introductions, opportunities, and future collaboration that money alone cannot buy.",
      timeRequiredMinutes: 20,
      opportunityCost:
        "Skipping one low-leverage scroll or Lyft hour preserves a multi-year relationship asset.",
      relatedGoals: metrics.goalsBehind.map((g) => g.name).slice(0, 3),
      relatedPeople: [topContact.name],
      nextActions: [
        `Send a concrete check-in to ${topContact.name}`,
        "Propose a short call or coffee this week",
        "Note one way you can create mutual value",
      ],
      leverageType: "long_term_leverage",
      domain: "social",
    };
  }

  if (metrics.domains.startup < 55) {
    return {
      action: "Ship one concrete startup progress block (feature, customer convo, or positioning)",
      whyItMatters:
        "Startup progress compounds only through shipped learning. Idle weeks reset momentum.",
      longTermBenefit:
        "Each shipped increment improves product-market learning and income upside beyond Lyft hours.",
      timeRequiredMinutes: 90,
      opportunityCost:
        "One Lyft evening may pay tonight; one shipped increment can pay for years.",
      relatedGoals: metrics.goalsBehind.map((g) => g.name).slice(0, 3),
      relatedPeople: [],
      nextActions: [
        "Pick the single highest-learning task",
        "Timebox 90 minutes with no distractions",
        "Write one sentence of what you learned afterward",
      ],
      leverageType: "long_term_leverage",
      domain: "startup",
    };
  }

  if (metrics.financialSignals.recentDailySpendAverage > 60) {
    return {
      action: "Run a cheap default day and redirect the saved cash to debt or reserves",
      whyItMatters: bottleneck ?? "Daily leakage is the silent tax on every compounding path.",
      longTermBenefit:
        "Lower daily burn hardens cash buffer, speeds debt payoff, and unlocks real-estate readiness sooner.",
      timeRequiredMinutes: 30,
      opportunityCost: "Convenience food today costs tomorrow's optionality.",
      relatedGoals: metrics.goalsBehind.map((g) => g.name).slice(0, 3),
      relatedPeople: [],
      nextActions: [
        "Cap food spend today",
        "Use grocery/protein defaults instead of convenience runs",
        "Move any surplus toward highest-APR debt or cash buffer",
      ],
      leverageType: "long_term_leverage",
      domain: "financial",
    };
  }

  return {
    action: "Protect a high-leverage block: learn, build, or strengthen one key relationship",
    whyItMatters:
      bottleneck ??
      "Compounding requires deliberate time in long-term leverage, not only day-to-day survival work.",
    longTermBenefit:
      "Consistent leverage blocks raise the compounding score across career, startup, and social domains.",
    timeRequiredMinutes: 60,
    opportunityCost: "Busywork and low-signal leisure crowd out the activities that compound.",
    relatedGoals: metrics.goalsBehind.map((g) => g.name).slice(0, 3),
    relatedPeople: [],
    nextActions: [
      "Block 60 uninterrupted minutes",
      "Choose one domain bottleneck to attack",
      "Log the activity afterward so the system can learn",
    ],
    leverageType: "long_term_leverage",
    domain: "personal",
  };
}

async function gatherGrowthContext(userId: string, metrics: GrowthMetrics) {
  const [memories, goals, contacts, recentActivities, snapshots] = await Promise.all([
    prisma.financialMemory.findMany({
      where: { userId },
      orderBy: { importanceScore: "desc" },
      take: 12,
    }),
    prisma.financialGoal.findMany({ where: { userId, status: "active" } }),
    prisma.growthContact.findMany({ where: { userId }, take: 25 }),
    prisma.growthActivity.findMany({
      where: { userId },
      orderBy: { date: "desc" },
      take: 30,
    }),
    prisma.growthSnapshot.findMany({
      where: { userId },
      orderBy: { date: "desc" },
      take: 14,
    }),
  ]);

  return {
    memories: memories.map((m) => ({ title: m.title, content: m.content, type: m.type })),
    goals: goals.map((g) => ({
      name: g.name,
      target: g.targetAmount,
      current: g.currentAmount,
      targetDate: g.targetDate,
      category: g.category,
    })),
    contacts: contacts.map((c) => ({
      name: c.name,
      type: c.relationshipType,
      trust: c.trustLevel,
      lastContact: c.lastContactDate,
      status: c.status,
      suggestedNext: c.suggestedNextAction,
      mutualValue: c.mutualValue,
    })),
    recentActivities: recentActivities.map((a) => ({
      date: a.date,
      domain: a.domain,
      title: a.title,
      leverage: a.leverage,
      impact: a.impactScore,
      minutes: a.minutesSpent,
    })),
    scoreHistory: snapshots.map((s) => ({
      date: s.date,
      score: s.compoundingScore,
      bottlenecks: s.bottlenecks,
    })),
    metrics,
  };
}

function parseRecommendation(raw: unknown, fallback: GrowthRecommendationPayload): GrowthRecommendationPayload {
  if (!raw || typeof raw !== "object") return fallback;
  const data = raw as Record<string, unknown>;
  const asStringArray = (value: unknown) =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

  const leverageType =
    data.leverageType === "immediate_income" || data.leverageType === "long_term_leverage"
      ? data.leverageType
      : fallback.leverageType;
  const domain =
    typeof data.domain === "string" && (GROWTH_DOMAINS as readonly string[]).includes(data.domain)
      ? (data.domain as GrowthDomain)
      : fallback.domain;

  return {
    action: typeof data.action === "string" && data.action.trim() ? data.action.trim() : fallback.action,
    whyItMatters:
      typeof data.whyItMatters === "string" && data.whyItMatters.trim()
        ? data.whyItMatters.trim()
        : fallback.whyItMatters,
    longTermBenefit:
      typeof data.longTermBenefit === "string" && data.longTermBenefit.trim()
        ? data.longTermBenefit.trim()
        : fallback.longTermBenefit,
    timeRequiredMinutes:
      typeof data.timeRequiredMinutes === "number" && data.timeRequiredMinutes > 0
        ? Math.round(data.timeRequiredMinutes)
        : fallback.timeRequiredMinutes,
    opportunityCost:
      typeof data.opportunityCost === "string" && data.opportunityCost.trim()
        ? data.opportunityCost.trim()
        : fallback.opportunityCost,
    relatedGoals: asStringArray(data.relatedGoals).slice(0, 5),
    relatedPeople: asStringArray(data.relatedPeople).slice(0, 5),
    nextActions: asStringArray(data.nextActions).slice(0, 5),
    leverageType,
    domain,
  };
}

export async function generateHighLeverageRecommendation(
  userId: string,
  options?: { force?: boolean },
) {
  const today = DateTime.local().toISODate()!;
  if (!options?.force) {
    const existing = await prisma.growthRecommendation.findUnique({
      where: { userId_date: { userId, date: today } },
    });
    if (existing) return existing;
  }

  const metrics = await calculateGrowthMetrics(userId);
  await persistGrowthSnapshot(userId, metrics);
  await syncOpportunities(userId, metrics);

  const fallback = buildFallbackRecommendation(metrics);
  let payload = fallback;

  try {
    const context = await gatherGrowthContext(userId, metrics);
    const completion = await openai.chat.completions.create({
      model: "gpt-5",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: GROWTH_AGENT_INSTRUCTIONS },
        {
          role: "user",
          content: `Given goals, finances, relationships, workload signals, health context, and available time, answer:
What is the highest-leverage thing I can do TODAY?

Return JSON exactly:
{
  "action": "...",
  "whyItMatters": "...",
  "longTermBenefit": "...",
  "timeRequiredMinutes": 60,
  "opportunityCost": "...",
  "relatedGoals": ["..."],
  "relatedPeople": ["..."],
  "nextActions": ["..."],
  "leverageType": "long_term_leverage",
  "domain": "startup",
  "opportunities": [{"title":"...","description":"...","domain":"social","urgency":"high","relatedPeople":["..."]}]
}

CONTEXT:
${JSON.stringify(context)}`,
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (content) {
      const parsed = JSON.parse(content) as Record<string, unknown>;
      payload = parseRecommendation(parsed, fallback);
      if (Array.isArray(parsed.opportunities)) {
        await upsertDetectedOpportunities(userId, parsed.opportunities);
      }
    }
  } catch (error) {
    console.error("Growth recommendation AI failed; using fallback:", error);
  }

  const recommendation = await prisma.growthRecommendation.upsert({
    where: { userId_date: { userId, date: today } },
    create: {
      userId,
      date: today,
      ...payload,
      domain: payload.domain ?? undefined,
    },
    update: {
      ...payload,
      domain: payload.domain ?? undefined,
      status: "pending",
    },
  });

  await storeFinancialMemories(
    userId,
    [
      {
        title: `Growth move ${today}`,
        content: `${payload.action}. Why: ${payload.whyItMatters}. Benefit: ${payload.longTermBenefit}`,
        importanceScore: 0.72,
      },
    ],
    { source: "growth-agent", type: "GROWTH_RECOMMENDATION", limit: 1, minImportance: 0.5 },
  );

  return recommendation;
}

async function upsertDetectedOpportunities(userId: string, raw: unknown[]) {
  for (const item of raw.slice(0, 5)) {
    if (!item || typeof item !== "object") continue;
    const opp = item as Record<string, unknown>;
    if (typeof opp.title !== "string" || !opp.title.trim()) continue;
    const title = opp.title.trim();
    const existing = await prisma.growthOpportunity.findFirst({
      where: { userId, title, status: "open" },
    });
    if (existing) continue;
    await prisma.growthOpportunity.create({
      data: {
        userId,
        title,
        description:
          typeof opp.description === "string" && opp.description.trim()
            ? opp.description.trim()
            : title,
        domain: typeof opp.domain === "string" ? opp.domain : null,
        urgency:
          opp.urgency === "high" || opp.urgency === "low" || opp.urgency === "medium"
            ? opp.urgency
            : "medium",
        relatedPeople: Array.isArray(opp.relatedPeople)
          ? opp.relatedPeople.filter((p): p is string => typeof p === "string").slice(0, 5)
          : [],
      },
    });
  }
}

export async function syncOpportunities(userId: string, metrics: GrowthMetrics) {
  const candidates: Array<{
    title: string;
    description: string;
    domain: string;
    urgency: "low" | "medium" | "high";
    relatedPeople: string[];
  }> = [];

  for (const contact of metrics.contactsNeedingAttention.slice(0, 3)) {
    candidates.push({
      title: `Reconnect with ${contact.name}`,
      description:
        contact.daysSinceContact === null
          ? `${contact.name} has no recent contact logged. A short follow-up protects relationship compounding.`
          : `${contact.name} hasn't been contacted in ${contact.daysSinceContact} days.`,
      domain: "social",
      urgency: (contact.daysSinceContact ?? 30) >= 30 ? "high" : "medium",
      relatedPeople: [contact.name],
    });
  }

  if (metrics.leverageMix.longTermLeverage === 0) {
    candidates.push({
      title: "Schedule a long-term leverage block this week",
      description:
        "Recent logged time leans toward immediate income. Protect one block for building, learning, or networking.",
      domain: "startup",
      urgency: "high",
      relatedPeople: [],
    });
  }

  for (const goal of metrics.goalsBehind.slice(0, 2)) {
    candidates.push({
      title: `Unstick goal: ${goal.name}`,
      description: `${goal.name} is behind (${Math.round(goal.progressPct)}% progress). Decide the next smallest high-leverage action.`,
      domain: "financial",
      urgency: "medium",
      relatedPeople: [],
    });
  }

  for (const candidate of candidates) {
    const existing = await prisma.growthOpportunity.findFirst({
      where: { userId, title: candidate.title, status: "open" },
    });
    if (existing) continue;
    await prisma.growthOpportunity.create({
      data: { userId, ...candidate },
    });
  }
}

export async function generateWeeklyGrowthReview(
  userId: string,
  options?: { force?: boolean },
) {
  const weekStart = weekStartIso();
  if (!options?.force) {
    const existing = await prisma.weeklyGrowthReview.findUnique({
      where: { userId_weekStart: { userId, weekStart } },
    });
    if (existing) return existing;
  }

  const metrics = await calculateGrowthMetrics(userId);
  await persistGrowthSnapshot(userId, metrics);
  const context = await gatherGrowthContext(userId, metrics);

  const fallback = {
    whatWorked: metrics.improving
      ? ["Compounding score is holding or improving"]
      : ["Financial tracking and awareness stayed active"],
    whatDidnt:
      metrics.bottlenecks.length > 0
        ? metrics.bottlenecks.slice(0, 3)
        : ["Not enough long-term leverage activity logged"],
    biggestReturn:
      metrics.leverageMix.longTermLeverage > 0
        ? "Time invested in long-term leverage activities"
        : "Maintaining financial visibility",
    timeWasted:
      metrics.financialSignals.recentDailySpendAverage > 60
        ? "Convenience spending and low-signal busywork"
        : "Unstructured time that could have been leverage blocks",
    stopDoing:
      metrics.financialSignals.recentDailySpendAverage > 60
        ? ["Default convenience-food runs"]
        : ["Reactive days without a leverage priority"],
    doMore:
      metrics.domains.social < 55
        ? ["Relationship follow-ups", "One shipping block for startup/career"]
        : ["Protect weekly leverage blocks", "Log growth activities"],
    relationshipsImproved: metrics.contactsNeedingAttention.length === 0
      ? ["Relationship follow-ups appear current"]
      : [],
    goalsBehind: metrics.goalsBehind.map((g) => g.name),
    biggestBottleneck: metrics.bottlenecks[0] ?? "Unclear bottleneck — log more domain activity",
    adjustments: [
      "Start each day with one high-leverage action",
      "Review fading relationships weekly",
      "Rebalance immediate income vs long-term leverage intentionally",
    ],
    compoundingScore: metrics.compoundingScore,
  };

  let reviewData = fallback;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: GROWTH_AGENT_INSTRUCTIONS },
        {
          role: "user",
          content: `Produce a weekly growth retrospective. Ask and answer:
What worked? What didn't? Biggest return? Where was time wasted?
What should I stop / do more? Which relationships improved?
Which goals are behind? Biggest bottleneck? Recommended adjustments.

Return JSON:
{
  "whatWorked": ["..."],
  "whatDidnt": ["..."],
  "biggestReturn": "...",
  "timeWasted": "...",
  "stopDoing": ["..."],
  "doMore": ["..."],
  "relationshipsImproved": ["..."],
  "goalsBehind": ["..."],
  "biggestBottleneck": "...",
  "adjustments": ["..."],
  "compoundingScore": 70
}

CONTEXT:
${JSON.stringify(context)}`,
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (content) {
      const parsed = JSON.parse(content) as Record<string, unknown>;
      const arr = (value: unknown, fb: string[]) =>
        Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : fb;
      const str = (value: unknown, fb: string) =>
        typeof value === "string" && value.trim() ? value.trim() : fb;

      reviewData = {
        whatWorked: arr(parsed.whatWorked, fallback.whatWorked),
        whatDidnt: arr(parsed.whatDidnt, fallback.whatDidnt),
        biggestReturn: str(parsed.biggestReturn, fallback.biggestReturn ?? ""),
        timeWasted: str(parsed.timeWasted, fallback.timeWasted ?? ""),
        stopDoing: arr(parsed.stopDoing, fallback.stopDoing),
        doMore: arr(parsed.doMore, fallback.doMore),
        relationshipsImproved: arr(parsed.relationshipsImproved, fallback.relationshipsImproved),
        goalsBehind: arr(parsed.goalsBehind, fallback.goalsBehind),
        biggestBottleneck: str(parsed.biggestBottleneck, fallback.biggestBottleneck ?? ""),
        adjustments: arr(parsed.adjustments, fallback.adjustments),
        compoundingScore:
          typeof parsed.compoundingScore === "number"
            ? parsed.compoundingScore
            : metrics.compoundingScore,
      };
    }
  } catch (error) {
    console.error("Weekly growth review AI failed; using fallback:", error);
  }

  return prisma.weeklyGrowthReview.upsert({
    where: { userId_weekStart: { userId, weekStart } },
    create: {
      userId,
      weekStart,
      ...reviewData,
    },
    update: reviewData,
  });
}

export async function getGrowthDashboard(userId: string) {
  const metrics = await calculateGrowthMetrics(userId);
  await persistGrowthSnapshot(userId, metrics);
  await syncOpportunities(userId, metrics);

  const today = metrics.date;
  const weekStart = weekStartIso();

  const [recommendation, weeklyReview, opportunities, activities, contacts, snapshots] =
    await Promise.all([
      prisma.growthRecommendation.findUnique({
        where: { userId_date: { userId, date: today } },
      }),
      prisma.weeklyGrowthReview.findUnique({
        where: { userId_weekStart: { userId, weekStart } },
      }),
      prisma.growthOpportunity.findMany({
        where: { userId, status: "open" },
        orderBy: [{ urgency: "desc" }, { detectedAt: "desc" }],
        take: 12,
      }),
      prisma.growthActivity.findMany({
        where: { userId },
        orderBy: { date: "desc" },
        take: 20,
      }),
      prisma.growthContact.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        take: 30,
      }),
      prisma.growthSnapshot.findMany({
        where: { userId },
        orderBy: { date: "asc" },
        take: 30,
      }),
    ]);

  return {
    metrics,
    recommendation,
    weeklyReview,
    opportunities,
    activities,
    contacts,
    snapshots,
  };
}
