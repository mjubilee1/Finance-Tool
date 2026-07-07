import { prisma } from "./prisma";

export function normalizeMerchantName(name: string) {
  return name
    .toLowerCase()
    .replace(/[0-9]/g, "")
    .replace(/[^a-z\s]/g, "")
    .trim();
}

export function estimateMonthlyAmount(averageAmount: number, frequency: string) {
  const abs = Math.abs(averageAmount);
  switch (frequency) {
    case "weekly":
      return abs * 4.33;
    case "bi-weekly":
      return abs * 2.17;
    case "monthly":
      return abs;
    default:
      return abs;
  }
}

export async function detectRecurringPatterns(userId: string) {
  // Fetch user's transactions from the past 90 days to find patterns
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const transactions = await prisma.transaction.findMany({
    where: {
      userId,
      createdAt: { gte: ninetyDaysAgo },
    },
    orderBy: { date: "asc" },
  });

  // Group by normalized name
  const groups: Record<string, typeof transactions> = {};

  for (const t of transactions) {
    const name = normalizeMerchantName(t.merchantName || t.name);
    
    if (name.length < 3) continue;

    if (!groups[name]) groups[name] = [];
    groups[name].push(t);
  }

  const patterns = [];

  for (const [name, txs] of Object.entries(groups)) {
    if (txs.length >= 2) {
      // Possible recurring
      const amounts = txs.map(t => t.amount);
      const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
      
      // Calculate variance
      const variance = amounts.reduce((a, b) => a + Math.pow(b - avgAmount, 2), 0) / amounts.length;
      const stdDev = Math.sqrt(variance);

      // If amounts are relatively similar (stdDev < 15% of avg)
      if (stdDev < Math.abs(avgAmount) * 0.15) {
        
        // Determine frequency (rough estimation)
        const dates = txs.map(t => new Date(t.date).getTime());
        dates.sort((a, b) => a - b);
        
        const diffs = [];
        for (let i = 1; i < dates.length; i++) {
          diffs.push((dates[i] - dates[i-1]) / (1000 * 60 * 60 * 24)); // diff in days
        }
        
        const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
        
        let frequency = "unknown";
        if (avgDiff > 25 && avgDiff < 35) frequency = "monthly";
        else if (avgDiff > 12 && avgDiff < 16) frequency = "bi-weekly";
        else if (avgDiff > 6 && avgDiff < 9) frequency = "weekly";

        // Save pattern
        patterns.push({
          normalizedName: name,
          merchantName: txs[0].merchantName || txs[0].name,
          category: txs[0].categoryPrimary,
          averageAmount: avgAmount,
          frequency,
          firstSeen: txs[0].date,
          lastSeen: txs[txs.length - 1].date,
          confidenceScore: frequency !== "unknown" ? 0.9 : 0.5,
          direction: avgAmount < 0 ? "income" : "expense",
          exampleTransactionIds: txs.map(t => t.id).slice(0, 5),
        });
      }
    }
  }

  // Update Database
  for (const pattern of patterns) {
    // Basic upsert based on normalized name
    const existing = await prisma.recurringPattern.findFirst({
      where: { userId, normalizedName: pattern.normalizedName }
    });

    if (existing) {
      await prisma.recurringPattern.update({
        where: { id: existing.id },
        data: {
          averageAmount: pattern.averageAmount,
          lastSeen: pattern.lastSeen,
          frequency: pattern.frequency,
          exampleTransactionIds: pattern.exampleTransactionIds,
        }
      });
    } else {
      await prisma.recurringPattern.create({
        data: {
          userId,
          ...pattern,
        }
      });
    }
  }

  return patterns;
}
