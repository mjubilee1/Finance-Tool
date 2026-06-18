import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPlaidConfig } from "@/lib/env";
import { getDailyPlaidEndpointCalls } from "@/lib/plaid-tracker";
import { getBriefRefreshStatus } from "@/lib/daily-snapshot";
import { calculateDailyBriefMetrics } from "@/lib/daily-brief";
import { calculateTodayCashFlow, calculateWeeklyCashFlow, calculateNetDailyAverage } from "@/lib/cash-flow";
import {
  filterTransactionsByFocus,
  getFocusAccounts,
  sumDepositoryCash,
} from "@/lib/account-focus";
import { DateTime } from "luxon";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const twoWeeksAgo = DateTime.local().minus({ days: 14 }).toISODate();
    const { dailyBalanceCallLimit } = getPlaidConfig();

    const [
      briefRefresh,
      transactions,
      recentTransactions,
      snapshots,
      rawAccounts,
      plaidItems,
      goals,
      balanceRefreshesToday,
    ] = await Promise.all([
      getBriefRefreshStatus(userId),
      prisma.transaction.findMany({
        where: { userId },
        orderBy: { date: "desc" },
        take: 50,
      }),
      prisma.transaction.findMany({
        where: { userId, date: { gte: twoWeeksAgo ?? undefined } },
        orderBy: { date: "desc" },
      }),
      prisma.dailyFinancialSnapshot.findMany({
        where: { userId },
        orderBy: { date: "desc" },
        take: 30,
      }),
      prisma.financialAccount.findMany({ where: { userId } }),
      prisma.plaidItem.findMany({ where: { userId } }),
      prisma.financialGoal.findMany({
        where: { userId, status: "active" },
        orderBy: { createdAt: "asc" },
      }),
      getDailyPlaidEndpointCalls("accountsBalanceGet", userId),
    ]);

    const latestSnapshot = snapshots[0];
    let aiInsight = null;
    try {
      if (latestSnapshot?.summary) {
        aiInsight = JSON.parse(latestSnapshot.summary);
      }
    } catch (e) {
      console.error("Failed to parse AI insight:", e);
    }

    const institutionByItemId = new Map(
      plaidItems.map((item) => [item.plaidItemId, item.institutionName]),
    );
    const accounts = rawAccounts.map((account) => ({
      ...account,
      institutionName: institutionByItemId.get(account.plaidItemId) ?? null,
    }));

    const focusAccounts = getFocusAccounts(accounts);
    const focusTransactions = filterTransactionsByFocus(recentTransactions, accounts);
    const focusTransactionsAll = filterTransactionsByFocus(transactions, accounts);

    const todayKey = DateTime.local().toISODate() ?? "";
    const briefMetrics = calculateDailyBriefMetrics({
      date: todayKey,
      transactions: focusTransactions,
      accounts: focusAccounts,
    });

    let safeSpendForWeek = briefMetrics.safeSpendToday;
    const aiSafeSpend = aiInsight?.cfoBrief?.safeSpendToday;
    if (typeof aiSafeSpend === "number" && Number.isFinite(aiSafeSpend)) {
      safeSpendForWeek = Math.max(0, aiSafeSpend);
    }

    const todayCashFlow = calculateTodayCashFlow({
      totalSpent: briefMetrics.totalSpent,
      totalIncome: briefMetrics.totalIncome,
      safeSpendToday: safeSpendForWeek,
    });

    const weeklyCashFlow = calculateWeeklyCashFlow({
      transactions: focusTransactions,
      dailyAllowance: todayCashFlow.dailyAllowance,
      referenceDate: todayKey,
    });

    return NextResponse.json({
      transactions:
        focusTransactionsAll.length > 0 || !accounts.some((a) => a.isPrimary)
          ? focusTransactionsAll
          : transactions,
      snapshots: snapshots.reverse(),
      aiInsight,
      accounts,
      goals,
      briefRefresh,
      cashFlow: {
        today: todayCashFlow,
        weekly: weeklyCashFlow,
        netDailyAverage: calculateNetDailyAverage(focusTransactions),
        safeDailySpend: safeSpendForWeek,
        primaryCash: sumDepositoryCash(accounts),
        usingPrimaryAccounts: accounts.some((account) => account.isPrimary),
      },
      plaidUsage: {
        balanceRefreshesToday,
        dailyBalanceCallLimit,
      },
    });
  } catch (error) {
    console.error("Failed to fetch dashboard data:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard data." },
      { status: 500 },
    );
  }
}
