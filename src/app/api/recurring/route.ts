import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { DateTime } from "luxon";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { filterTransactionsByFocus } from "@/lib/account-focus";
import { getDismissedMerchantKeys, normalizeMerchantKey } from "@/lib/charge-review";
import {
  detectRecurringPatterns,
  estimateMonthlyAmount,
  normalizeMerchantName,
} from "@/lib/recurring";

type CfoRecurringReview = {
  merchant: string;
  averageAmount: number;
  frequency: string;
  recommendation: string;
};

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const ninetyDaysAgo = DateTime.local().minus({ days: 90 }).toISODate();

    await detectRecurringPatterns(userId);

    const [patterns, transactions, accounts, reviewMemories, latestSnapshot] = await Promise.all([
      prisma.recurringPattern.findMany({
        where: { userId },
        orderBy: [{ direction: "asc" }, { averageAmount: "desc" }],
      }),
      prisma.transaction.findMany({
        where: {
          userId,
          date: { gte: ninetyDaysAgo ?? undefined },
        },
        orderBy: { date: "desc" },
      }),
      prisma.financialAccount.findMany({ where: { userId } }),
      prisma.financialMemory.findMany({
        where: { userId },
        select: { title: true, type: true, content: true },
      }),
      prisma.dailyFinancialSnapshot.findFirst({
        where: { userId },
        orderBy: { date: "desc" },
      }),
    ]);

    let cfoReviews: CfoRecurringReview[] = [];
    try {
      if (latestSnapshot?.summary) {
        const insight = JSON.parse(latestSnapshot.summary) as {
          recurringTransactionsToReview?: CfoRecurringReview[];
        };
        cfoReviews = insight.recurringTransactionsToReview ?? [];
      }
    } catch {
      cfoReviews = [];
    }

    const cfoReviewByMerchant = new Map(
      cfoReviews.map((review) => [normalizeMerchantKey(review.merchant), review]),
    );
    const dismissedMerchantKeys = getDismissedMerchantKeys(reviewMemories);
    const focusTransactions = filterTransactionsByFocus(transactions, accounts);
    const accountNameById = new Map(accounts.map((account) => [account.plaidAccountId, account.name]));

    const transactionsByMerchant = new Map<string, typeof focusTransactions>();
    for (const transaction of focusTransactions) {
      const key = normalizeMerchantName(transaction.merchantName || transaction.name);
      if (key.length < 3) continue;
      const existing = transactionsByMerchant.get(key) ?? [];
      existing.push(transaction);
      transactionsByMerchant.set(key, existing);
    }

    const items = patterns.map((pattern) => {
      const merchantLabel = pattern.merchantName || pattern.normalizedName;
      const merchantKey = normalizeMerchantKey(merchantLabel);
      const patternTransactions = (transactionsByMerchant.get(pattern.normalizedName) ?? [])
        .sort((a, b) => b.date.localeCompare(a.date));
      const reviewed = dismissedMerchantKeys.has(merchantKey) || dismissedMerchantKeys.has(pattern.normalizedName);
      const cfoReview = cfoReviewByMerchant.get(merchantKey);
      const monthlyImpact = estimateMonthlyAmount(pattern.averageAmount, pattern.frequency);
      const needsReview =
        !reviewed &&
        pattern.direction === "expense" &&
        (Boolean(cfoReview) || pattern.frequency === "unknown" || pattern.confidenceScore < 0.75);

      return {
        id: pattern.id,
        merchantName: merchantLabel,
        normalizedName: pattern.normalizedName,
        category: pattern.category,
        averageAmount: pattern.averageAmount,
        frequency: pattern.frequency,
        direction: pattern.direction as "income" | "expense",
        firstSeen: pattern.firstSeen,
        lastSeen: pattern.lastSeen,
        confidenceScore: pattern.confidenceScore,
        occurrenceCount: patternTransactions.length,
        monthlyImpact,
        reviewed,
        needsReview,
        cfoRecommendation: cfoReview?.recommendation ?? null,
        transactions: patternTransactions.map((transaction) => ({
          id: transaction.id,
          date: transaction.date,
          amount: transaction.amount,
          name: transaction.name,
          merchantName: transaction.merchantName,
          pending: transaction.pending,
          customCategory: transaction.customCategory,
          categoryPrimary: transaction.categoryPrimary,
          accountName: accountNameById.get(transaction.accountId) ?? "Account",
        })),
      };
    });

    const expenseItems = items.filter((item) => item.direction === "expense");
    const incomeItems = items.filter((item) => item.direction === "income");
    const reviewItems = items.filter((item) => item.needsReview);

    return NextResponse.json({
      patterns: items,
      summary: {
        totalPatterns: items.length,
        expenseCount: expenseItems.length,
        incomeCount: incomeItems.length,
        needsReviewCount: reviewItems.length,
        monthlyExpenseTotal: expenseItems.reduce((sum, item) => sum + item.monthlyImpact, 0),
        monthlyIncomeTotal: incomeItems.reduce((sum, item) => sum + item.monthlyImpact, 0),
      },
    });
  } catch (error) {
    console.error("Failed to fetch recurring patterns:", error);
    return NextResponse.json({ error: "Failed to fetch recurring patterns." }, { status: 500 });
  }
}
