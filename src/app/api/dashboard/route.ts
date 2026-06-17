import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPlaidConfig } from "@/lib/env";
import { getDailyPlaidEndpointCalls } from "@/lib/plaid-tracker";
import { ensureFreshDailySnapshot, type BriefRefreshResult } from "@/lib/daily-snapshot";
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
    let briefRefresh: BriefRefreshResult | null = null;

    try {
      briefRefresh = await ensureFreshDailySnapshot(userId);
    } catch (error) {
      console.error("Failed to refresh CFO brief:", error);
    }

    const twoWeeksAgo = DateTime.local().minus({ days: 14 }).toISODate();

    const [transactions, recentTransactions] = await Promise.all([
      prisma.transaction.findMany({
        where: { userId },
        orderBy: { date: "desc" },
        take: 50,
      }),
      prisma.transaction.findMany({
        where: { userId, date: { gte: twoWeeksAgo ?? undefined } },
        orderBy: { date: "desc" },
      }),
    ]);

    // Fetch daily snapshots for charts
    const snapshots = await prisma.dailyFinancialSnapshot.findMany({
      where: { userId },
      orderBy: { date: "desc" },
      take: 30,
    });

    // We can extract the latest AI insight from the latest snapshot
    const latestSnapshot = snapshots[0];
    let aiInsight = null;
    try {
      if (latestSnapshot?.summary) {
        aiInsight = JSON.parse(latestSnapshot.summary);
      }
    } catch (e) {
      console.error("Failed to parse AI insight:", e);
    }

    // Accounts with institution names for grouping
    const [rawAccounts, plaidItems] = await Promise.all([
      prisma.financialAccount.findMany({ where: { userId } }),
      prisma.plaidItem.findMany({ where: { userId } }),
    ]);
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

    const goals = await prisma.financialGoal.findMany({
      where: { userId, status: "active" },
      orderBy: { createdAt: "asc" },
    });

    const { dailyBalanceCallLimit } = getPlaidConfig();
    const balanceRefreshesToday = await getDailyPlaidEndpointCalls("accountsBalanceGet", userId);

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
      transactions: focusTransactionsAll.length > 0 || !accounts.some((a) => a.isPrimary)
        ? focusTransactionsAll
        : transactions,
      snapshots: snapshots.reverse(), // chronologically for charts
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
