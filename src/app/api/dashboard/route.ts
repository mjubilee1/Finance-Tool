import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPlaidConfig } from "@/lib/env";
import { getDailyPlaidEndpointCalls } from "@/lib/plaid-tracker";
import { getBriefRefreshStatus } from "@/lib/daily-snapshot";
import { calculateDailyBriefMetrics } from "@/lib/daily-brief";
import {
  buildDailySpendSeries,
  buildMonthlyCashFlowSeries,
  calculateTodayCashFlow,
  calculateWeeklyCashFlow,
  calculateNetDailyAverage,
} from "@/lib/cash-flow";
import {
  filterTransactionsByFocus,
  filterTransactionsForDailySpend,
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
    const thirtyDaysAgo = DateTime.local().minus({ days: 29 }).toISODate();
    const sixMonthsAgo = DateTime.local().minus({ months: 6 }).startOf("month").toISODate();
    const { dailyBalanceCallLimit } = getPlaidConfig();

    const [
      briefRefresh,
      transactions,
      recentTransactions,
      chartTransactions,
      monthlyTransactions,
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
        where: {
          userId,
          OR: [
            { date: { gte: twoWeeksAgo ?? undefined } },
            { authorizedDate: { gte: twoWeeksAgo ?? undefined } },
          ],
        },
        orderBy: { date: "desc" },
      }),
      prisma.transaction.findMany({
        where: {
          userId,
          OR: [
            { date: { gte: thirtyDaysAgo ?? undefined } },
            { authorizedDate: { gte: thirtyDaysAgo ?? undefined } },
          ],
        },
        orderBy: { date: "desc" },
      }),
      prisma.transaction.findMany({
        where: {
          userId,
          OR: [
            { date: { gte: sixMonthsAgo ?? undefined } },
            { authorizedDate: { gte: sixMonthsAgo ?? undefined } },
          ],
        },
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
    const focusMonthlyTransactions = filterTransactionsByFocus(monthlyTransactions, accounts);
    const spendingTransactions = filterTransactionsForDailySpend(recentTransactions, accounts);
    const chartSpendTransactions = filterTransactionsForDailySpend(chartTransactions, accounts);

    const todayKey = DateTime.local().toISODate() ?? "";
    const briefMetrics = calculateDailyBriefMetrics({
      date: todayKey,
      transactions: spendingTransactions,
      accounts: focusAccounts,
    });

    const todayCashFlow = calculateTodayCashFlow({
      totalSpent: briefMetrics.totalSpent,
      totalIncome: briefMetrics.totalIncome,
      safeSpendToday: briefMetrics.safeSpendToday,
      dailyAllowance: briefMetrics.dailyAllowance,
      discretionarySpentToday: briefMetrics.discretionarySpentToday,
    });

    const weeklyCashFlow = calculateWeeklyCashFlow({
      transactions: focusTransactions,
      dailyAllowance: todayCashFlow.dailyAllowance,
      referenceDate: todayKey,
    });

    const dailySpendSeries = buildDailySpendSeries(chartSpendTransactions, 30, todayKey);
    const monthlyCashFlowSeries = buildMonthlyCashFlowSeries(focusMonthlyTransactions, 6, todayKey);

    return NextResponse.json({
      transactions:
        focusTransactionsAll.length > 0 || !accounts.some((a) => a.isPrimary)
          ? focusTransactionsAll
          : transactions,
      snapshots: snapshots.reverse(),
      dailySpendSeries,
      monthlyCashFlowSeries,
      aiInsight,
      accounts,
      goals,
      briefRefresh,
      cashFlow: {
        today: todayCashFlow,
        weekly: weeklyCashFlow,
        netDailyAverage: calculateNetDailyAverage(focusTransactions),
        safeDailySpend: todayCashFlow.dailyAllowance,
        safeSpendTodayReason: briefMetrics.safeSpendTodayReason,
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
