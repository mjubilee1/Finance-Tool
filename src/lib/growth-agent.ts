import { DateTime } from "luxon";
import { openai } from "./openai";
import { prisma } from "./prisma";
import { getFocusAccounts, filterTransactionsForDailySpend } from "./account-focus";
import { calculateDailyBriefMetrics } from "./daily-brief";
import { calculateGoalFunding } from "./goal-funding";
import { storeFinancialMemories } from "./financial-memory";
import {
  contactHasNotes,
  formatContactNotesForAgent,
  migrateLegacyContactNotes,
} from "./growth-contact-notes";

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

Active-context rules:
- Do not invent projects the user is not working on. If core context says a product is inactive (e.g. real-estate agent SaaS), never recommend that work.
- Do not recommend listing vacant units that context says are already rented (e.g. basement already leased).
- Respect Weekly Schedule / Daily Rhythm: Mon–Wed office (~9–5) = desk/async actions only mid-day; Thu–Fri WFH = better for deep work/calls/in-person; Mon–Wed often already include ~5am + ~2hr morning Lyft before commute.
- Name when an action fits (desk lunch message, Thu deep block, evening/weekend Lyft or meet).
- Often weigh: drive Lyft today (cover weekly Hertz/Lyft fee → Capital One surplus) vs a higher-leverage block. Be explicit about fee floor vs profit and opportunity cost — e.g. "skip grinding 6 Lyft hours for ~$100 if a network/promotion block compounds more; cover the fee floor first, then protect leverage."
- Real estate here usually means property investing / house hacking readiness — not building agent software — unless context says otherwise.
- Default discretionary target ~$25 most days; celebrate streaks. Allow earned bar/dating/clothes spend after solid days — judge the WEEK for compounding vs waste, not one night in isolation.
- Dating/social contacts are valid relationship assets when notes/follow-ups exist; distinguish connection equity from pure nightlife spend.
- Family/personal contacts can exist unlabeled or as "family" without notes — do not nag for notes or treat them as compounding bottlenecks. Prioritize notes on mentors, founders, peers, investors, dating-with-intent.
- Mix money + life: career/promotion, fitness/body, startup leverage, relationships, and cash are one reinforcing system — not a finance-only coach.
- joyOptions are a preference menu only. Never prescribe a specific joy outing as today's required block just because it appears in the profile.
- When the user shares screenshots (gym schedule, calendar, plans), treat extracted facts as durable context for recommendations — prefer schedule-feasible moves.
- Home base is Oxon Hill / DMV. Suggest nearby leisure (National Harbor, local PG/DC) for breaks after logged effort; save longer trips for weekends or open days. Rest and local enjoyment are allowed when intentional.

Writing style for recommendations (critical — UI is small):
- action: one short imperative, max ~16 words (e.g. "Protect a 90-min career/build block instead of low-ROI Lyft")
- whyItMatters / longTermBenefit / opportunityCost: 1 sentence each, max ~28 words
- nextActions: 3–4 steps, each max ~14 words, concrete verbs only
- Do not pack scripts, templates, or long explanations into any field
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
      include: { noteEntries: { select: { id: true }, take: 1 } },
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
      const type = (c.relationshipType ?? "").toLowerCase();
      // Mass imports often have no lastContactDate — that is "not tracked yet", not "overdue".
      // Only nudge follow-ups for people you're actively compounding with.
      const leverageType = [
        "peer",
        "social",
        "dating",
        "mentor",
        "founder",
        "investor",
        "colleague",
      ].includes(type);
      const overdue = days !== null && days >= 21;
      const fadingStatus = c.status === "fading" || c.status === "dormant";
      const needsAttention = fadingStatus || (leverageType && overdue);
      return needsAttention
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

  const goalsBehind = (() => {
    const funding = calculateGoalFunding({
      checkingCash: brief.cashAvailable,
      goals,
    });
    const fundedById = new Map(funding.goals.map((g) => [g.id, g]));

    return goals
      .map((g) => {
        const funded = fundedById.get(g.id);
        const progressPct = funded?.progressPct ?? (g.targetAmount > 0
          ? clamp((g.currentAmount / g.targetAmount) * 100)
          : 0);
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
  })();

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
        Math.min(
          15,
          contacts.filter((c) => {
            const type = (c.relationshipType ?? "").toLowerCase();
            if (["family", "personal", "unlabeled", ""].includes(type)) {
              // Phone-book imports don't count as compounding network yet
              return contactHasNotes(c);
            }
            return c.status === "active";
          }).length * 3,
        ),
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
  if (contactsNeedingAttention.length >= 1) {
    bottlenecks.push(
      contactsNeedingAttention.length === 1
        ? `Relationship follow-up due: ${contactsNeedingAttention[0].name}`
        : `${contactsNeedingAttention.length} relationships need follow-up`,
    );
  } else if (contacts.length === 0) {
    bottlenecks.push("Network is empty — no relationship compounding yet");
  } else if (contacts.every((c) => !contactHasNotes(c))) {
    bottlenecks.push(
      `Network is thin: ${contacts.length} contact${contacts.length === 1 ? "" : "s"} with no notes or mutual-value context`,
    );
  } else if (activityCounts.social === 0) {
    bottlenecks.push("No networking activity logged in the last 14 days");
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
      action: "Ship one concrete software/career leverage block (feature, learning, or positioning)",
      whyItMatters:
        "Career/build momentum compounds only when you ship or learn on work you are actually doing — not abandoned ideas.",
      longTermBenefit:
        "Each real shipped increment improves skills and income upside beyond Lyft hours.",
      timeRequiredMinutes: 90,
      opportunityCost:
        "One Lyft evening may help cover the weekly Hertz fee; one shipped increment can pay for years.",
      relatedGoals: metrics.goalsBehind.map((g) => g.name).slice(0, 3),
      relatedPeople: [],
      nextActions: [
        "Pick one active project (not an abandoned idea)",
        "Timebox 90 minutes with no distractions",
        "Write one sentence of what you shipped or learned",
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
  const [memories, goals, contacts, recentActivities, snapshots, profile] = await Promise.all([
    prisma.financialMemory.findMany({
      where: { userId },
      orderBy: { importanceScore: "desc" },
      take: 12,
    }),
    prisma.financialGoal.findMany({ where: { userId, status: "active" } }),
    prisma.growthContact.findMany({
      where: { userId },
      take: 25,
      include: {
        noteEntries: {
          orderBy: { createdAt: "asc" },
          select: { id: true, body: true, images: true, createdAt: true },
        },
      },
    }),
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
    prisma.lifeLeverageProfile.findUnique({ where: { userId } }),
  ]);

  return {
    lifeLeverageProfile: profile,
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
      notes: formatContactNotesForAgent(c.noteEntries, c.notes),
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

Return JSON exactly (keep every string SHORT — scannable mobile UI):
{
  "action": "short imperative, max 16 words",
  "whyItMatters": "one sentence, max 28 words",
  "longTermBenefit": "one sentence, max 28 words",
  "timeRequiredMinutes": 60,
  "opportunityCost": "one short phrase or sentence",
  "relatedGoals": ["..."],
  "relatedPeople": ["..."],
  "nextActions": ["3-4 short steps, max 14 words each"],
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
    const description =
      typeof opp.description === "string" && opp.description.trim()
        ? opp.description.trim()
        : title;
    if (isStaleOpportunityCopy(`${title} ${description}`)) continue;
    const existing = await prisma.growthOpportunity.findFirst({
      where: { userId, title, status: "open" },
    });
    if (existing) continue;
    await prisma.growthOpportunity.create({
      data: {
        userId,
        title,
        description,
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

/** Block AI from re-opening known-outdated opportunity themes. */
function isStaleOpportunityCopy(text: string) {
  const lower = text.toLowerCase();
  const stalePatterns = [
    /list(ing)? (the )?basement/,
    /basement (unit|vacanc|tenant|rental)/,
    /fb marketplace.*basement|basement.*fb marketplace/,
    /re saas|real.?estate saas|real.?estate agent (app|saas|tool|crm)/,
    /warm intros?.{0,40}re saas|yc alum.{0,40}(re|real.?estate)/,
    /pg county agents?/,
    /discovery calls? with .{0,40}agents?/,
    /agents? with 20\+ transactions/,
    /outreach (list|to) .{0,30}(real.?estate )?agents?/,
  ];
  return stalePatterns.some((pattern) => pattern.test(lower));
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

  // Always surface network growth when the graph is thin — not only when someone is "stale".
  const contacts = await prisma.growthContact.findMany({
    where: { userId, status: "active" },
    orderBy: { updatedAt: "desc" },
    take: 20,
    include: { noteEntries: { select: { id: true }, take: 1 } },
  });
  const withoutNotes = contacts.filter((c) => {
    const type = (c.relationshipType ?? "").toLowerCase();
    // Family / personal aren't compounding targets — don't nag for notes.
    if (["family", "personal", "roommate", "tenant"].includes(type)) return false;
    return !contactHasNotes(c);
  });
  if (contacts.length === 0) {
    candidates.push({
      title: "Add 3 high-leverage people to your network map",
      description:
        "Growth compounds through relationships. Start with mentors, founders, and warm intros — not your whole phone book.",
      domain: "social",
      urgency: "high",
      relatedPeople: [],
    });
  } else if (withoutNotes.length > 0) {
    const focus = withoutNotes[0];
    candidates.push({
      title: `Capture notes on ${focus.name}`,
      description:
        "Name-only contacts don't compound. Add who they are, mutual value, and one next conversation so networking advice can get specific.",
      domain: "social",
      urgency: "medium",
      relatedPeople: [focus.name],
    });
  }
  if (contacts.length > 0 && metrics.activityCounts.social === 0) {
    candidates.push({
      title: "Log one networking move this week",
      description:
        "You have people on the map but no social activity logged. One message, intro ask, or coffee compounds more than another low-signal scroll.",
      domain: "social",
      urgency: "high",
      relatedPeople: contacts.slice(0, 2).map((c) => c.name),
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

  // Only nudge goals that are still underfunded after checking allocation.
  for (const goal of metrics.goalsBehind.slice(0, 2)) {
    if (goal.progressPct >= 80) continue;
    candidates.push({
      title: `Unstick goal: ${goal.name}`,
      description: `${goal.name} is behind (${Math.round(goal.progressPct)}% covered by checking/savings). Decide the next smallest high-leverage action.`,
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
      : metrics.contactsNeedingAttention.length === 0 && context.contacts.length > 0
        ? ["Kept at least one relationship warm"]
        : ["Financial tracking and awareness stayed active"],
    whatDidnt:
      metrics.bottlenecks.length > 0
        ? metrics.bottlenecks.slice(0, 3)
        : ["Not enough long-term leverage activity logged"],
    biggestReturn:
      metrics.leverageMix.longTermLeverage > 0
        ? "Time invested in long-term leverage activities"
        : context.contacts.length > 0
          ? "Starting a relationship map — now deepen it with notes and outreach"
          : "Maintaining financial visibility",
    timeWasted:
      metrics.financialSignals.recentDailySpendAverage > 60
        ? "Convenience spending and low-signal busywork"
        : "Unstructured time that could have been leverage blocks",
    stopDoing:
      metrics.financialSignals.recentDailySpendAverage > 60
        ? ["Default convenience-food runs", "Ignoring network follow-ups"]
        : ["Reactive days without a leverage priority"],
    doMore: [
      ...(context.contacts.some((c) => !c.notes)
        ? ["Add notes on your key contacts"]
        : metrics.activityCounts.social === 0 && context.contacts.length > 0
          ? ["Send one high-signal networking message"]
          : context.contacts.length === 0
            ? ["Add 3 leverage people to Relationships"]
            : []),
      ...(metrics.domains.social < 55
        ? ["One relationship follow-up this week"]
        : []),
      ...(metrics.financialSignals.recentDailySpendAverage > 60
        ? ["Cap discretionary spend for 7 days"]
        : ["Protect one shipping or learning block"]),
    ].slice(0, 3),
    relationshipsImproved:
      metrics.contactsNeedingAttention.length === 0 && context.contacts.length > 0
        ? ["Touchpoints look current — deepen with notes/mutual value"]
        : [],
    goalsBehind: metrics.goalsBehind.map((g) => g.name),
    biggestBottleneck:
      metrics.bottlenecks.find((b) => /network|relationship|social|contact/i.test(b)) ??
      metrics.bottlenecks[0] ??
      "Unclear bottleneck — log more domain activity",
    adjustments: [
      "Balance money moves with network compounding",
      "Start each day with one high-leverage action",
      "Review fading relationships weekly",
    ],
    compoundingScore: metrics.compoundingScore,
  };

  let reviewData = fallback;

  const notedContacts = context.contacts.filter(
    (c) => typeof c.notes === "string" && c.notes.trim().length > 0,
  ).length;
  const sparseWeek =
    context.recentActivities.length < 2 && notedContacts < 2 && context.goals.length === 0;

  // Sparse weeks: skip the slow model call — fallback already uses live metrics.
  if (!sparseWeek) {
    try {
      const completion = await openai.chat.completions.create(
        {
          model: "gpt-5",
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: GROWTH_AGENT_INSTRUCTIONS },
            {
              role: "user",
              content: `Produce a SHORT weekly growth retrospective a busy founder can scan in 20 seconds.

Rules:
- "tldr" = one sentence only (max 20 words)
- Cover BOTH money AND network/relationships when contacts exist — do not make this finance-only
- If contacts lack notes or no social activity was logged, include that in doMore / bottleneck
- Every array item = ONE short action or fact (max 12 words)
- Max 3 items per array
- No paragraphs. No semicolon-chains. No joining multiple ideas with "and then"

Return JSON:
{
  "tldr": "...",
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
        },
        { timeout: 20_000 },
      );

      const content = completion.choices[0]?.message?.content;
      if (content) {
        const parsed = JSON.parse(content) as Record<string, unknown>;
        const shortArr = (value: unknown, fb: string[]) => {
          const list = Array.isArray(value)
            ? value.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
            : fb;
          return list.slice(0, 3).map((item) =>
            item.length > 100 ? `${item.slice(0, 97).trim()}…` : item.trim(),
          );
        };
        const shortStr = (value: unknown, fb: string) => {
          const raw = typeof value === "string" && value.trim() ? value.trim() : fb;
          return raw.length > 160 ? `${raw.slice(0, 157).trim()}…` : raw;
        };

        const tldr =
          typeof parsed.tldr === "string" && parsed.tldr.trim() ? parsed.tldr.trim() : null;

        reviewData = {
          whatWorked: shortArr(parsed.whatWorked, fallback.whatWorked),
          whatDidnt: shortArr(parsed.whatDidnt, fallback.whatDidnt),
          biggestReturn: shortStr(parsed.biggestReturn, fallback.biggestReturn ?? ""),
          timeWasted: shortStr(parsed.timeWasted, fallback.timeWasted ?? ""),
          stopDoing: shortArr(parsed.stopDoing, fallback.stopDoing),
          doMore: shortArr(parsed.doMore, fallback.doMore),
          relationshipsImproved: shortArr(
            parsed.relationshipsImproved,
            fallback.relationshipsImproved,
          ),
          goalsBehind: shortArr(parsed.goalsBehind, fallback.goalsBehind),
          biggestBottleneck: tldr
            ? shortStr(tldr, fallback.biggestBottleneck ?? "")
            : shortStr(parsed.biggestBottleneck, fallback.biggestBottleneck ?? ""),
          adjustments: shortArr(parsed.adjustments, fallback.adjustments),
          compoundingScore:
            typeof parsed.compoundingScore === "number"
              ? parsed.compoundingScore
              : metrics.compoundingScore,
        };
      }
    } catch (error) {
      console.error("Weekly growth review AI failed; using fallback:", error);
    }
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
  await migrateLegacyContactNotes(userId);

  const today = metrics.date;
  const weekStart = weekStartIso();

  const [recommendation, weeklyReview, opportunities, activities, contacts, snapshots, profile] =
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
        take: 100,
        include: {
          noteEntries: {
            orderBy: { createdAt: "desc" },
            take: 50,
          },
        },
      }),
      prisma.growthSnapshot.findMany({
        where: { userId },
        orderBy: { date: "asc" },
        take: 30,
      }),
      prisma.lifeLeverageProfile.findUnique({ where: { userId } }),
    ]);

  return {
    metrics,
    lifeLeverageProfile: profile,
    recommendation,
    weeklyReview,
    opportunities,
    activities,
    contacts,
    snapshots,
  };
}
