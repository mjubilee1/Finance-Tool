import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_EXPECTED_MONTHLY_RENT,
  buildMonthlyFinancialTrends,
  buildTrajectoryAnswers,
  buildTrendsInsights,
  findLargeExpensesThisMonth,
} from "@/lib/financial-trends";
import { userNow, userToday } from "@/lib/user-timezone";

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const monthsParam = Number(searchParams.get("months") ?? "12");
    const months = Number.isFinite(monthsParam)
      ? Math.min(24, Math.max(6, Math.round(monthsParam)))
      : 12;

    const lookbackStart = userNow()
      .startOf("month")
      .minus({ months: months + 1 })
      .toISODate();

    const [accounts, transactions, events, settings, snapshots] = await Promise.all([
      prisma.financialAccount.findMany({ where: { userId } }),
      prisma.transaction.findMany({
        where: {
          userId,
          OR: [
            { date: { gte: lookbackStart ?? undefined } },
            { authorizedDate: { gte: lookbackStart ?? undefined } },
          ],
        },
        orderBy: { date: "asc" },
      }),
      prisma.financialEvent.findMany({
        where: { userId },
        orderBy: { date: "asc" },
      }),
      prisma.financialTrendsSettings.findUnique({ where: { userId } }),
      prisma.dailyFinancialSnapshot.findMany({
        where: {
          userId,
          date: { gte: lookbackStart ?? undefined },
        },
        orderBy: { date: "asc" },
        select: { date: true, accountBalanceTotal: true },
      }),
    ]);

    const expectedMonthlyRent = settings?.expectedMonthlyRent ?? DEFAULT_EXPECTED_MONTHLY_RENT;
    const todayKey = userToday();

    // Prefer last snapshot in each month as a net-worth calibration point when present.
    const snapshotNetWorthByMonth = new Map<string, number>();
    for (const snapshot of snapshots) {
      const monthKey = snapshot.date.slice(0, 7);
      snapshotNetWorthByMonth.set(monthKey, snapshot.accountBalanceTotal);
    }

    const series = buildMonthlyFinancialTrends({
      accounts,
      transactions,
      expectedMonthlyRent,
      months,
      referenceDate: todayKey,
      snapshotNetWorthByMonth,
    });

    const largeExpenses = findLargeExpensesThisMonth(transactions, todayKey);
    const insights = buildTrendsInsights({ points: series, largeExpenses });
    const answers = buildTrajectoryAnswers(series);

    const latest = series[series.length - 1] ?? null;
    const monthAgo = series.length >= 2 ? series[series.length - 2] : null;
    const quarterAgo = series.length >= 4 ? series[series.length - 4] : null;
    const yearAgo = series.length >= 12 ? series[0] : series.length > 1 ? series[0] : null;

    return NextResponse.json({
      months,
      expectedMonthlyRent,
      series,
      events,
      insights,
      answers,
      largeExpenses,
      headline: latest
        ? {
            netWorth: latest.netWorth,
            cash: latest.cash,
            debt: latest.debt,
            assets: latest.assets,
            vsLastMonth: monthAgo
              ? {
                  netWorth: round(latest.netWorth - monthAgo.netWorth),
                  cash: round(latest.cash - monthAgo.cash),
                  debt: round(latest.debt - monthAgo.debt),
                }
              : null,
            vsLastQuarter: quarterAgo
              ? {
                  netWorth: round(latest.netWorth - quarterAgo.netWorth),
                  cash: round(latest.cash - quarterAgo.cash),
                  debt: round(latest.debt - quarterAgo.debt),
                }
              : null,
            vsLastYear: yearAgo
              ? {
                  netWorth: round(latest.netWorth - yearAgo.netWorth),
                  cash: round(latest.cash - yearAgo.cash),
                  debt: round(latest.debt - yearAgo.debt),
                }
              : null,
          }
        : null,
      note:
        "Balances are reconstructed month-by-month from today's account balances and transaction history — investor trajectory, not a daily bank refresh.",
    });
  } catch (error) {
    console.error("Failed to load financial trends:", error);
    return NextResponse.json({ error: "Failed to load financial trends." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as { expectedMonthlyRent?: number };
    const expectedMonthlyRent = Number(body.expectedMonthlyRent);
    if (!Number.isFinite(expectedMonthlyRent) || expectedMonthlyRent < 0) {
      return NextResponse.json({ error: "expectedMonthlyRent must be a non-negative number." }, { status: 400 });
    }

    const settings = await prisma.financialTrendsSettings.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        expectedMonthlyRent,
      },
      update: { expectedMonthlyRent },
    });

    return NextResponse.json({ expectedMonthlyRent: settings.expectedMonthlyRent });
  } catch (error) {
    console.error("Failed to update financial trends settings:", error);
    return NextResponse.json({ error: "Failed to update settings." }, { status: 500 });
  }
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
