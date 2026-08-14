import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateDailyBriefMetrics } from "@/lib/daily-brief";
import { filterTransactionsByFocus, getFocusAccounts, hasPrimarySelection } from "@/lib/account-focus";
import { buildCashFlowProjection } from "@/lib/projection-service";
import { userNow, userToday } from "@/lib/user-timezone";

type CfoSummary = {
  cfoBrief?: {
    safeSpendToday?: number;
    safeSpendTodayReason?: string;
  };
};

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
    const twoYearsAgo = userNow().minus({ years: 2 }).toISODate();

    const [transactions, allTransactions, recurringPatterns, latestSnapshot] = await Promise.all([
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
      prisma.recurringPattern.findMany({
        where: { userId },
        orderBy: { confidenceScore: "desc" },
      }),
      prisma.dailyFinancialSnapshot.findFirst({
        where: { userId },
        orderBy: { date: "desc" },
      }),
    ]);

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

    const todayKey = userToday();
    const projection = buildCashFlowProjection({
      transactions,
      recurringPatterns,
      currentBalance: currentTotalBalance,
      referenceDate: todayKey,
    });
    const settledCashFlow = transactions.filter(
      (transaction) =>
        !transaction.pending &&
        !transaction.categoryPrimary?.toLowerCase().includes("transfer"),
    );
    const totalSpend = settledCashFlow.reduce(
      (sum, transaction) => sum + (transaction.amount > 0 ? transaction.amount : 0),
      0,
    );
    const totalIncome = settledCashFlow.reduce(
      (sum, transaction) => sum + (transaction.amount < 0 ? Math.abs(transaction.amount) : 0),
      0,
    );

    let latestInsight: CfoSummary | null = null;
    try {
      latestInsight = latestSnapshot?.summary
        ? JSON.parse(latestSnapshot.summary) as CfoSummary
        : null;
    } catch {
      latestInsight = null;
    }

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
    const safeSpendNetDailyAverage = projection.averageDailyIncome - safeDailySpend;
    const projectSafeSpendBalance = (days: number) =>
      currentTotalBalance + safeSpendNetDailyAverage * days;

    return NextResponse.json({
      metrics: {
        totalSpend,
        totalIncome,
        dailyAverageSpend: projection.averageDailySpend,
        dailyAverageIncome: projection.averageDailyIncome,
        netDailyAverage: projection.netDailyAverage,
        daysAnalyzed: projection.daysAnalyzed,
        currentTotalBalance,
        cashBreakdown,
      },
      safeSpendScenario: {
        safeDailySpend,
        safeSpendReason,
        dailyIncomeAssumption: projection.averageDailyIncome,
        plannedNetDailyAverage: safeSpendNetDailyAverage,
        monthlySpendAtSafeRate: safeDailySpend * 30,
        sixMonthSpendAtSafeRate: safeDailySpend * 180,
        balanceIn30Days: projectSafeSpendBalance(30),
        balanceIn90Days: projectSafeSpendBalance(90),
        balanceIn180Days: projectSafeSpendBalance(180),
        tenDollarsPerDayMonthlyImpact: 10 * 30,
        tenDollarsPerDaySixMonthImpact: 10 * 180,
        raiseFactors: [
          "More confirmed income hits checking, especially paycheck, tenant rent, or refunds.",
          "Upcoming bills and card minimums are covered with cash left above the buffer.",
          "Food, convenience, travel, and house-repair spending stays below the current daily cap.",
        ],
        hurtFactors: [
          "Mortgage, utilities, taxes, insurance, or card minimums come due before new income clears.",
          "Tenant rent is late or expected income does not post.",
          "Large discretionary, travel, house-repair, interest, or credit-card spending hits.",
        ],
      },
      projectionModel: projection,
      projectionData: projection.points,
    });
  } catch (error) {
    console.error("Failed to fetch projections:", error);
    return NextResponse.json(
      { error: "Failed to fetch projections." },
      { status: 500 },
    );
  }
}
