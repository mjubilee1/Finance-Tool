import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DateTime } from "luxon";

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

    const accountIdsToInclude = accounts
      .filter((acc) => {
        if (excludeDebt) {
          // Plaid account types: depository, credit, loan, investment, other
          return acc.type !== "credit" && acc.type !== "loan";
        }
        return true;
      })
      .map((acc) => acc.plaidAccountId);

    // Fetch transactions for the included accounts
    // We want up to 2 years of history
    const twoYearsAgo = DateTime.now().minus({ years: 2 }).toISODate();

    const transactions = await prisma.transaction.findMany({
      where: {
        userId,
        accountId: { in: accountIdsToInclude },
        date: { gte: twoYearsAgo || undefined },
      },
      orderBy: { date: "asc" },
    });

    // Calculate metrics
    let totalSpend = 0;
    let totalIncome = 0;
    let earliestDate = DateTime.now() as any;
    let latestDate = DateTime.now().minus({ years: 10 }) as any;

    transactions.forEach((t) => {
      // Ignore transfers for spend/income calculation to avoid double counting
      // Plaid often categorizes transfers as "Transfer"
      if (t.categoryPrimary?.toLowerCase().includes("transfer")) return;

      const tDate = DateTime.fromISO(t.date);
      if (tDate < earliestDate) earliestDate = tDate;
      if (tDate > latestDate) latestDate = tDate;

      if (t.amount > 0) {
        totalSpend += t.amount;
      } else if (t.amount < 0) {
        totalIncome += Math.abs(t.amount);
      }
    });

    const daysDiff = latestDate.diff(earliestDate, "days").days;
    const effectiveDays = Math.max(1, daysDiff); // Avoid division by zero

    const dailyAverageSpend = totalSpend / effectiveDays;
    const dailyAverageIncome = totalIncome / effectiveDays;
    const netDailyAverage = dailyAverageIncome - dailyAverageSpend;

    // Current total balance of included accounts
    const currentTotalBalance = accounts
      .filter((acc) => accountIdsToInclude.includes(acc.plaidAccountId))
      .reduce((sum, acc) => {
        // For depository accounts, currentBalance is positive.
        // For credit accounts, currentBalance is what you owe (so it's a liability).
        // If we include debt, we should probably subtract it from net worth.
        if (acc.type === "credit" || acc.type === "loan") {
          return sum - (acc.currentBalance || 0);
        }
        return sum + (acc.currentBalance || 0);
      }, 0);

    // Generate 6-month projection data
    const projectionData = [];
    let projectedBalance = currentTotalBalance;
    
    // Start from today
    const today = DateTime.now();
    for (let i = 0; i <= 180; i += 15) { // Every 15 days for a smoother chart
      const projDate = today.plus({ days: i });
      projectionData.push({
        date: projDate.toISODate(),
        projectedBalance: projectedBalance + (netDailyAverage * i),
      });
    }

    return NextResponse.json({
      metrics: {
        totalSpend,
        totalIncome,
        dailyAverageSpend,
        dailyAverageIncome,
        netDailyAverage,
        daysAnalyzed: effectiveDays,
        currentTotalBalance,
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
