import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateCarProfile } from "@/lib/car-profile";
import {
  buildCapitalOneProjection,
  isCapitalOneInstitution,
} from "@/lib/capital-one-projection";
import { DateTime } from "luxon";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const [items, accounts, carProfile] = await Promise.all([
      prisma.plaidItem.findMany({ where: { userId } }),
      prisma.financialAccount.findMany({ where: { userId } }),
      getOrCreateCarProfile(userId),
    ]);

    const capitalOneItemIds = new Set(
      items
        .filter((item) => isCapitalOneInstitution(item.institutionName))
        .map((item) => item.plaidItemId),
    );

    const capitalOneAccounts = accounts.filter((account) =>
      capitalOneItemIds.has(account.plaidItemId),
    );

    if (capitalOneAccounts.length === 0) {
      return NextResponse.json({
        error: "No Capital One accounts linked yet.",
        linked: false,
      });
    }

    const accountIds = capitalOneAccounts.map((account) => account.plaidAccountId);
    const lookback = DateTime.now().minus({ years: 1 }).toISODate() ?? undefined;

    const transactions = await prisma.transaction.findMany({
      where: {
        userId,
        accountId: { in: accountIds },
        date: lookback ? { gte: lookback } : undefined,
      },
      orderBy: { date: "asc" },
      select: {
        accountId: true,
        date: true,
        amount: true,
        name: true,
        merchantName: true,
        categoryPrimary: true,
      },
    });

    const projection = buildCapitalOneProjection({
      accounts: capitalOneAccounts,
      transactions,
      carProfile,
    });

    return NextResponse.json({ linked: true, ...projection });
  } catch (error) {
    console.error("Failed to build Capital One projection:", error);
    return NextResponse.json(
      { error: "Failed to load Capital One projection." },
      { status: 500 },
    );
  }
}
