import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { DateTime } from "luxon";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { filterTransactionsByFocus } from "@/lib/account-focus";
import { detectSpendingAlerts, estimateMonthlyLeak } from "@/lib/spending-alerts";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sixtyDaysAgo = DateTime.local().minus({ days: 60 }).toISODate();
    const [transactions, accounts] = await Promise.all([
      prisma.transaction.findMany({
        where: {
          userId: session.user.id,
          date: { gte: sixtyDaysAgo ?? undefined },
          amount: { gt: 0 },
        },
        orderBy: { date: "desc" },
      }),
      prisma.financialAccount.findMany({
        where: { userId: session.user.id },
      }),
    ]);

    const focusTransactions = filterTransactionsByFocus(transactions, accounts);
    const alerts = detectSpendingAlerts(focusTransactions, { limit: 8 });

    return NextResponse.json({
      alerts,
      estimatedMonthlyLeak: estimateMonthlyLeak(alerts),
      totalReviewed: focusTransactions.length,
    });
  } catch (error) {
    console.error("Failed to fetch spending alerts:", error);
    return NextResponse.json({ error: "Failed to fetch spending alerts." }, { status: 500 });
  }
}
