import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPlaidConfig } from "@/lib/env";
import { getDailyPlaidEndpointCalls } from "@/lib/plaid-tracker";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Fetch transactions
    const transactions = await prisma.transaction.findMany({
      where: { userId },
      orderBy: { date: "desc" },
      take: 50,
    });

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

    // Accounts
    const accounts = await prisma.financialAccount.findMany({
      where: { userId },
    });

    const goals = await prisma.financialGoal.findMany({
      where: { userId, status: "active" },
      orderBy: { createdAt: "asc" },
    });

    const { dailyBalanceCallLimit } = getPlaidConfig();
    const balanceRefreshesToday = await getDailyPlaidEndpointCalls("accountsBalanceGet", userId);

    return NextResponse.json({
      transactions,
      snapshots: snapshots.reverse(), // chronologically for charts
      aiInsight,
      accounts,
      goals,
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
