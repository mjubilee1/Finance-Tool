import { getAppUser } from "@/lib/app-user";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { filterTransactionsByFocus } from "@/lib/account-focus";
import { getDismissedMerchantKeys } from "@/lib/charge-review";
import { detectSpendingAlerts, estimateMonthlyLeak } from "@/lib/spending-alerts";
import { userNow } from "@/lib/user-timezone";

export async function GET() {
  try {
    const user = await getAppUser();
    if (!user) {
      return NextResponse.json({ error: "App user is not configured." }, { status: 503 });
    }

    const sixtyDaysAgo = userNow().minus({ days: 60 }).toISODate();
    const [transactions, accounts, reviewMemories] = await Promise.all([
      prisma.transaction.findMany({
        where: {
          userId: user.id,
          date: { gte: sixtyDaysAgo ?? undefined },
          amount: { gt: 0 },
        },
        orderBy: { date: "desc" },
      }),
      prisma.financialAccount.findMany({
        where: { userId: user.id },
      }),
      prisma.financialMemory.findMany({
        where: { userId: user.id },
        select: { title: true, type: true },
      }),
    ]);

    const dismissedMerchantKeys = getDismissedMerchantKeys(reviewMemories);
    const focusTransactions = filterTransactionsByFocus(transactions, accounts);
    const alerts = detectSpendingAlerts(focusTransactions, {
      limit: 8,
      dismissedMerchantKeys,
    });

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
