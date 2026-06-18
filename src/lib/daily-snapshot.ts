import { DateTime } from "luxon";
import { generateDailyInsight } from "./ai-coach";
import { applyCalculatedSafeSpend, calculateDailyBriefMetrics } from "./daily-brief";
import { filterTransactionsByFocus, getFocusAccounts } from "./account-focus";
import { getCostControlConfig } from "./env";
import { prisma } from "./prisma";

export type BriefRefreshResult = {
  status: "created" | "updated" | "fresh" | "no_transactions";
  refreshHours: number;
  lastUpdatedAt: string | null;
  nextRefreshAt: string | null;
};

function nextRefreshAt(updatedAt: Date, refreshHours: number) {
  return new Date(updatedAt.getTime() + refreshHours * 60 * 60 * 1000);
}

type EnsureFreshOptions = {
  force?: boolean;
};

export async function getBriefRefreshStatus(userId: string): Promise<BriefRefreshResult> {
  const { aiBriefRefreshHours } = getCostControlConfig();
  const today = DateTime.local().toISODate();

  if (!today) {
    throw new Error("Failed to resolve today's date.");
  }

  const [existingSnapshot, transactionCount] = await Promise.all([
    prisma.dailyFinancialSnapshot.findUnique({
      where: {
        userId_date: {
          userId,
          date: today,
        },
      },
    }),
    prisma.transaction.count({
      where: { userId },
    }),
  ]);

  if (transactionCount === 0) {
    return {
      status: "no_transactions",
      refreshHours: aiBriefRefreshHours,
      lastUpdatedAt: existingSnapshot?.updatedAt.toISOString() ?? null,
      nextRefreshAt: existingSnapshot
        ? nextRefreshAt(existingSnapshot.updatedAt, aiBriefRefreshHours).toISOString()
        : null,
    };
  }

  if (existingSnapshot) {
    const nextAt = nextRefreshAt(existingSnapshot.updatedAt, aiBriefRefreshHours);
    if (nextAt.getTime() > Date.now()) {
      return {
        status: "fresh",
        refreshHours: aiBriefRefreshHours,
        lastUpdatedAt: existingSnapshot.updatedAt.toISOString(),
        nextRefreshAt: nextAt.toISOString(),
      };
    }

    return {
      status: "updated",
      refreshHours: aiBriefRefreshHours,
      lastUpdatedAt: existingSnapshot.updatedAt.toISOString(),
      nextRefreshAt: nextAt.toISOString(),
    };
  }

  return {
    status: "created",
    refreshHours: aiBriefRefreshHours,
    lastUpdatedAt: null,
    nextRefreshAt: null,
  };
}

export async function ensureFreshDailySnapshot(
  userId: string,
  options?: EnsureFreshOptions,
): Promise<BriefRefreshResult> {
  const { aiBriefRefreshHours } = getCostControlConfig();
  const today = DateTime.local().toISODate();

  if (!today) {
    throw new Error("Failed to resolve today's date.");
  }

  const [existingSnapshot, transactionCount] = await Promise.all([
    prisma.dailyFinancialSnapshot.findUnique({
      where: {
        userId_date: {
          userId,
          date: today,
        },
      },
    }),
    prisma.transaction.count({
      where: { userId },
    }),
  ]);

  if (transactionCount === 0) {
    return {
      status: "no_transactions",
      refreshHours: aiBriefRefreshHours,
      lastUpdatedAt: existingSnapshot?.updatedAt.toISOString() ?? null,
      nextRefreshAt: existingSnapshot
        ? nextRefreshAt(existingSnapshot.updatedAt, aiBriefRefreshHours).toISOString()
        : null,
    };
  }

  if (existingSnapshot && !options?.force) {
    const nextAt = nextRefreshAt(existingSnapshot.updatedAt, aiBriefRefreshHours);
    if (nextAt.getTime() > Date.now()) {
      return {
        status: "fresh",
        refreshHours: aiBriefRefreshHours,
        lastUpdatedAt: existingSnapshot.updatedAt.toISOString(),
        nextRefreshAt: nextAt.toISOString(),
      };
    }
  }

  const insight = await generateDailyInsight(userId);
  const [transactions, accounts] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId },
      orderBy: { date: "desc" },
    }),
    prisma.financialAccount.findMany({
      where: { userId },
    }),
  ]);
  const focusAccounts = getFocusAccounts(accounts);
  const focusTransactions = filterTransactionsByFocus(transactions, accounts);
  const metrics = calculateDailyBriefMetrics({
    date: today,
    transactions: focusTransactions,
    accounts: focusAccounts,
  });
  const insightWithSafeSpend = applyCalculatedSafeSpend(insight, metrics);

  const snapshotData = {
    totalSpent: metrics.totalSpent,
    totalIncome: metrics.totalIncome,
    foodSpend: metrics.foodSpend,
    transportationSpend: metrics.transportationSpend,
    billsSpend: metrics.billsSpend,
    discretionarySpend: metrics.discretionarySpend,
    recurringSpend: metrics.recurringSpend,
    accountBalanceTotal: metrics.accountBalanceTotal,
    dailyScore: insightWithSafeSpend.financialHealthScore ?? 0,
    summary: JSON.stringify(insightWithSafeSpend),
  };

  const snapshot = existingSnapshot
    ? await prisma.dailyFinancialSnapshot.update({
        where: { id: existingSnapshot.id },
        data: snapshotData,
      })
    : await prisma.dailyFinancialSnapshot.create({
        data: {
          userId,
          date: today,
          ...snapshotData,
        },
      });

  return {
    status: existingSnapshot ? "updated" : "created",
    refreshHours: aiBriefRefreshHours,
    lastUpdatedAt: snapshot.updatedAt.toISOString(),
    nextRefreshAt: nextRefreshAt(snapshot.updatedAt, aiBriefRefreshHours).toISOString(),
  };
}
