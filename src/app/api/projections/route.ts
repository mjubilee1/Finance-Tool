import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DateTime } from "luxon";
import { calculateDailyBriefMetrics } from "@/lib/daily-brief";
import { filterTransactionsByFocus, getFocusAccounts, hasPrimarySelection } from "@/lib/account-focus";

type CfoSummary = {
  cfoBrief?: {
    safeSpendToday?: number;
    safeSpendTodayReason?: string;
  };
};

function getMillis(date: DateTime<true> | DateTime<false>) {
  return date.toMillis();
}

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const excludeDebt = searchParams.get("excludeDebt") === "true";

    // Fetch accounts to filter out debt if requested
    const accounts = await prisma.financialAccount.findMany({
      where: { userId },
    });

    const focusAccounts = getFocusAccounts(accounts);
    const accountsForScope = hasPrimarySelection(accounts) ? focusAccounts : accounts;

    const balanceAccountIdsToInclude = accountsForScope
      .filter((acc) => {
        if (excludeDebt) {
          return acc.type !== "credit" && acc.type !== "loan";
        }
        return true;
      })
      .map((acc) => acc.plaidAccountId);

    const cashflowAccountIdsToInclude = accountsForScope
      .filter((acc) => acc.type !== "credit" && acc.type !== "loan")
      .map((acc) => acc.plaidAccountId);

    // Fetch transactions for non-debt accounts only. Loan/mortgage activity can
    // appear as negative amounts in Plaid, but it is debt movement, not income.
    // We want up to 2 years of history
    const twoYearsAgo = DateTime.now().minus({ years: 2 }).toISODate();

    const [transactions, allTransactions, latestSnapshot] = await Promise.all([
      prisma.transaction.findMany({
        where: {
          userId,
          accountId: { in: cashflowAccountIdsToInclude },
          date: { gte: twoYearsAgo || undefined },
        },
        orderBy: { date: "asc" },
      }),
      prisma.transaction.findMany({
        where: { userId },
        orderBy: { date: "desc" },
      }),
      prisma.dailyFinancialSnapshot.findFirst({
        where: { userId },
        orderBy: { date: "desc" },
      }),
    ]);

    // Calculate metrics
    let totalSpend = 0;
    let totalIncome = 0;
    let earliestMs = getMillis(DateTime.now());
    let latestMs = getMillis(DateTime.now().minus({ years: 10 }));

    transactions.forEach((t) => {
      // Ignore transfers for spend/income calculation to avoid double counting
      // Plaid often categorizes transfers as "Transfer"
      if (t.categoryPrimary?.toLowerCase().includes("transfer")) return;

      const transactionMs = getMillis(DateTime.fromISO(t.date));
      earliestMs = Math.min(earliestMs, transactionMs);
      latestMs = Math.max(latestMs, transactionMs);

      if (t.amount > 0) {
        totalSpend += t.amount;
      } else if (t.amount < 0) {
        totalIncome += Math.abs(t.amount);
      }
    });

    const daysDiff = (latestMs - earliestMs) / (24 * 60 * 60 * 1000);
    const effectiveDays = Math.max(1, daysDiff); // Avoid division by zero

    const dailyAverageSpend = totalSpend / effectiveDays;
    const dailyAverageIncome = totalIncome / effectiveDays;
    const netDailyAverage = dailyAverageIncome - dailyAverageSpend;

    // Cash you can actually use (available), not ledger "current" which can include holds.
    const currentTotalBalance = accounts
      .filter((acc) => balanceAccountIdsToInclude.includes(acc.plaidAccountId))
      .reduce((sum, acc) => {
        if (acc.type === "credit" || acc.type === "loan") {
          return sum - Math.abs(acc.currentBalance || 0);
        }
        const spendable = acc.availableBalance ?? acc.currentBalance ?? 0;
        return sum + spendable;
      }, 0);

    const cashBreakdown = accounts
      .filter(
        (acc) =>
          balanceAccountIdsToInclude.includes(acc.plaidAccountId) &&
          acc.type === "depository",
      )
      .map((acc) => ({
        name: acc.name,
        available: acc.availableBalance ?? acc.currentBalance ?? 0,
        current: acc.currentBalance ?? 0,
      }));

    let latestInsight: CfoSummary | null = null;
    try {
      latestInsight = latestSnapshot?.summary
        ? JSON.parse(latestSnapshot.summary) as CfoSummary
        : null;
    } catch {
      latestInsight = null;
    }

    const todayKey = DateTime.local().toISODate() ?? DateTime.now().toISODate() ?? "";
    const dailyBriefMetrics = calculateDailyBriefMetrics({
      date: todayKey,
      transactions: filterTransactionsByFocus(allTransactions, accounts),
      accounts: focusAccounts,
    });
    const safeDailySpend =
      typeof latestInsight?.cfoBrief?.safeSpendToday === "number" && Number.isFinite(latestInsight.cfoBrief.safeSpendToday)
        ? Math.min(
            dailyBriefMetrics.dailyAllowance,
            Math.max(0, latestInsight.cfoBrief.safeSpendToday + dailyBriefMetrics.discretionarySpentToday),
          )
        : dailyBriefMetrics.dailyAllowance;
    const safeSpendReason = latestInsight?.cfoBrief?.safeSpendTodayReason ?? dailyBriefMetrics.safeSpendTodayReason;
    const safeSpendNetDailyAverage = dailyAverageIncome - safeDailySpend;

    // Generate 6-month projection data
    const projectionData = [];
    const projectedBalance = currentTotalBalance;
    
    // Start from today
    const today = DateTime.now();
    for (let i = 0; i <= 180; i += 15) { // Every 15 days for a smoother chart
      const projDate = today.plus({ days: i });
      projectionData.push({
        date: projDate.toISODate(),
        projectedBalance: projectedBalance + (netDailyAverage * i),
        safeSpendProjectedBalance: projectedBalance + (safeSpendNetDailyAverage * i),
      });
    }

    const projectSafeSpendBalance = (days: number) => projectedBalance + (safeSpendNetDailyAverage * days);

    return NextResponse.json({
      metrics: {
        totalSpend,
        totalIncome,
        dailyAverageSpend,
        dailyAverageIncome,
        netDailyAverage,
        daysAnalyzed: effectiveDays,
        currentTotalBalance,
        cashBreakdown,
      },
      safeSpendScenario: {
        safeDailySpend,
        safeSpendReason,
        dailyIncomeAssumption: dailyAverageIncome,
        plannedNetDailyAverage: safeSpendNetDailyAverage,
        monthlySpendAtSafeRate: safeDailySpend * 30,
        sixMonthSpendAtSafeRate: safeDailySpend * 180,
        balanceIn30Days: projectSafeSpendBalance(30),
        balanceIn90Days: projectSafeSpendBalance(90),
        balanceIn180Days: projectSafeSpendBalance(180),
        tenDollarsPerDayMonthlyImpact: 10 * 30,
        tenDollarsPerDaySixMonthImpact: 10 * 180,
        raiseFactors: [
          "More confirmed income hits checking, especially paycheck, tenant rent, Lyft profit, or refunds.",
          "Upcoming bills and card minimums are covered with cash left above the buffer.",
          "Food, convenience, travel, and house-repair spending stays below the current daily cap.",
        ],
        hurtFactors: [
          "Mortgage, utilities, taxes, insurance, or card minimums come due before new income clears.",
          "Tenant rent is late or expected income does not post.",
          "Large discretionary, travel, house-repair, interest, or credit-card spending hits.",
        ],
      },
      projectionData,
    });
  } catch (error) {
    console.error("Failed to fetch projections:", error);
    return NextResponse.json(
      { error: "Failed to fetch projections." },
      { status: 500 },
    );
  }
}
