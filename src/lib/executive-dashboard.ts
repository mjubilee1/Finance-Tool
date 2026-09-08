import { DateTime } from "luxon";
import { prisma } from "@/lib/prisma";
import { classifyInstitution, isCheckingLikeAccount } from "@/lib/institutions";
import { userNow, userToday } from "@/lib/user-timezone";

const TRAJECTORY_DOMAINS = [
  "career",
  "startup",
  "financial",
  "social",
  "fitness",
  "personal",
] as const;

function balance(account: {
  availableBalance: number | null;
  currentBalance: number | null;
}) {
  return account.availableBalance ?? account.currentBalance ?? 0;
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function daysSince(date: string | null) {
  if (!date) return null;
  const parsed = DateTime.fromISO(date);
  if (!parsed.isValid) return null;
  return Math.floor(userNow().startOf("day").diff(parsed.startOf("day"), "days").days);
}

export async function getExecutiveDashboard(userId: string) {
  const today = userToday();
  const ninetyDaysAgo = userNow().minus({ days: 90 }).toISODate()!;
  const thirtyDaysAgo = userNow().minus({ days: 30 }).toISODate()!;

  const [
    accounts,
    plaidItems,
    systems,
    wins,
    snapshots,
    opportunities,
    recommendation,
    recentActivities,
    contacts,
  ] = await Promise.all([
    prisma.financialAccount.findMany({ where: { userId } }),
    prisma.plaidItem.findMany({
      where: { userId },
      select: { plaidItemId: true, institutionName: true },
    }),
    prisma.operatingSystem.findMany({
      where: { userId, isArchived: false },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      include: { history: { orderBy: { createdAt: "desc" }, take: 5 } },
    }),
    prisma.growthWin.findMany({
      where: { userId },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 12,
    }),
    prisma.growthSnapshot.findMany({
      where: { userId, date: { gte: ninetyDaysAgo } },
      orderBy: { date: "asc" },
    }),
    prisma.growthOpportunity.findMany({
      where: { userId, status: "open" },
      orderBy: [{ urgency: "desc" }, { updatedAt: "desc" }],
      take: 8,
    }),
    prisma.growthRecommendation.findFirst({
      where: { userId, status: "pending" },
      orderBy: { date: "desc" },
    }),
    prisma.growthActivity.findMany({
      where: {
        userId,
        date: { gte: thirtyDaysAgo },
        NOT: { status: { in: ["skipped", "hidden"] } },
      },
      orderBy: { date: "desc" },
      take: 100,
    }),
    prisma.growthContact.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        relationshipType: true,
        lastContactDate: true,
        status: true,
        suggestedNextAction: true,
      },
    }),
  ]);

  const institutionByItem = new Map(
    plaidItems.map((item) => [item.plaidItemId, item.institutionName]),
  );
  const checking = accounts.filter(isCheckingLikeAccount);
  const cashByInstitution = checking.reduce(
    (totals, account) => {
      const key = classifyInstitution(institutionByItem.get(account.plaidItemId));
      totals[key] += balance(account);
      return totals;
    },
    { chase: 0, capital_one: 0, other: 0 },
  );
  const totalCash = accounts
    .filter((account) => account.type === "depository")
    .reduce((sum, account) => sum + balance(account), 0);
  const creditDebt = accounts
    .filter((account) => account.type === "credit")
    .reduce((sum, account) => sum + Math.max(0, account.currentBalance ?? 0), 0);
  const investments = accounts
    .filter((account) => ["investment", "brokerage"].includes(account.type))
    .reduce((sum, account) => sum + (account.currentBalance ?? 0), 0);

  const latestSnapshot = snapshots.at(-1) ?? null;
  const baselineSnapshot = snapshots[0] ?? null;
  const trajectory = TRAJECTORY_DOMAINS.map((domain) => {
    const scoreKey = `${domain}Score` as const;
    const current = latestSnapshot?.[scoreKey] ?? null;
    const baseline = baselineSnapshot?.[scoreKey] ?? null;
    const delta = current != null && baseline != null ? round(current - baseline) : null;
    return { domain, current, delta };
  });

  const relationshipsNeedingAttention = contacts
    .map((contact) => ({
      ...contact,
      daysSinceContact: daysSince(contact.lastContactDate),
    }))
    .filter(
      (contact) =>
        contact.status === "fading" ||
        contact.status === "dormant" ||
        (contact.daysSinceContact != null && contact.daysSinceContact >= 30),
    )
    .sort((a, b) => (b.daysSinceContact ?? 999) - (a.daysSinceContact ?? 999))
    .slice(0, 5);

  const leverageActions = [
    ...(recommendation
      ? [
          {
            id: `recommendation:${recommendation.id}`,
            title: recommendation.action,
            why: recommendation.whyItMatters,
            domain: recommendation.domain,
            source: "recommendation" as const,
          },
        ]
      : []),
    ...systems
      .filter((system) => system.nextAction)
      .sort((a, b) => a.progress - b.progress)
      .map((system) => ({
        id: `system:${system.id}`,
        title: system.nextAction!,
        why: `Moves ${system.name} from ${system.status} toward ${system.targetState}.`,
        domain: system.domain,
        source: "system" as const,
      })),
    ...opportunities.map((opportunity) => ({
      id: `opportunity:${opportunity.id}`,
      title: opportunity.title,
      why: opportunity.description,
      domain: opportunity.domain,
      source: "opportunity" as const,
    })),
  ].slice(0, 3);

  const activitiesByDomain = recentActivities.reduce<Record<string, number>>(
    (counts, activity) => {
      counts[activity.domain] = (counts[activity.domain] ?? 0) + 1;
      return counts;
    },
    {},
  );

  return {
    generatedAt: new Date().toISOString(),
    position: {
      compoundingScore: latestSnapshot?.compoundingScore ?? null,
      compoundingDelta:
        latestSnapshot && baselineSnapshot
          ? round(latestSnapshot.compoundingScore - baselineSnapshot.compoundingScore)
          : null,
      systemsOperational: systems.filter((system) =>
        ["operational", "scaling"].includes(system.status),
      ).length,
      systemsTotal: systems.length,
      openOpportunities: opportunities.length,
      winsLast30Days: wins.filter((win) => win.date >= thirtyDaysAgo).length,
      activitiesByDomain,
    },
    financialHealth: {
      chaseReserve: round(cashByInstitution.chase),
      capitalOneReserve: round(cashByInstitution.capital_one),
      totalCash: round(totalCash),
      creditDebt: round(creditDebt),
      netWorthProxy: round(totalCash + investments - creditDebt),
    },
    trajectory,
    systems,
    leverageActions,
    pipeline: opportunities,
    relationshipsNeedingAttention,
    wins,
    today,
  };
}
