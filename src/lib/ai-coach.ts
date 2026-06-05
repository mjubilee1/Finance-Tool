import { openai, getEmbedding } from "./openai";
import { getPineconeIndex } from "./pinecone";
import { prisma } from "./prisma";

export function calculateFinancialHealthScore(params: {
  current7DayAvg: number;
  prev7DayAvg: number;
  monthlyIncome: number;
  monthlySpend: number;
  isRecurringStable: boolean;
  hasOverdraftRisk: boolean;
  discretionarySpend: number;
  discretionaryTarget: number;
  foodSpendIncreasing: boolean;
  recurringBillsIncreased: boolean;
  balanceTrendingDown: boolean;
  uncategorizedCount: number;
}): number {
  let score = 70;

  if (params.current7DayAvg < params.prev7DayAvg) score += 10;
  if (params.monthlyIncome > params.monthlySpend) score += 10;
  if (params.isRecurringStable) score += 5;
  if (!params.hasOverdraftRisk) score += 5;
  if (params.discretionarySpend <= params.discretionaryTarget) score += 5;

  if (params.current7DayAvg > params.discretionaryTarget * 1.2) score -= 10; // "above target for 3+ days" proxy
  if (params.foodSpendIncreasing) score -= 10;
  if (params.recurringBillsIncreased) score -= 10;
  if (params.monthlySpend > params.monthlyIncome) score -= 15;
  if (params.balanceTrendingDown) score -= 10;
  if (params.uncategorizedCount > 10) score -= 5;

  return Math.max(0, Math.min(100, score));
}

export async function generateDailyInsight(userId: string) {
  // 1. Fetch relevant user context
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");

  const today = new Date();
  const past30Days = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  const past7Days = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

  const recentTransactions = await prisma.transaction.findMany({
    where: {
      userId,
      createdAt: { gte: past30Days },
    },
    orderBy: { date: "desc" },
    take: 100,
  });

  const recurringPatterns = await prisma.recurringPattern.findMany({
    where: { userId },
  });

  // 2. Fetch Pinecone Memories
  const index = getPineconeIndex();
  // We just get general memories for the user by doing a basic embedding search or just filtering by userId if supported
  // To keep it simple, we embed a general query
  const queryEmbedding = await getEmbedding("financial goals and daily spending habits");
  const memoryResults = await index.query({
    vector: queryEmbedding,
    filter: { userId },
    topK: 5,
    includeMetadata: true,
  });

  const memories = memoryResults.matches.map((m) => m.metadata?.content || "").join("\n");

  // 3. Build Prompt
  const prompt = `
You are a senior financial coach. You are direct, practical, and encouraging.
Analyze the user's data and provide JSON.

MEMORIES:
${memories}

RECENT TRANSACTIONS (last 30 days):
${JSON.stringify(recentTransactions.slice(0, 30).map(t => ({ name: t.name, amount: t.amount, category: t.categoryPrimary, date: t.date })))}

RECURRING PATTERNS:
${JSON.stringify(recurringPatterns.map(r => ({ merchant: r.merchantName, amount: r.averageAmount, freq: r.frequency })))}

Generate a JSON response exactly matching this structure:
{
  "dailySummary": "...",
  "financialHealthScore": 72,
  "scoreReasoning": "...",
  "spendingTrend": {
    "dailyAverageLast7Days": 52.10,
    "dailyAveragePrevious7Days": 70.25,
    "difference": -18.15,
    "status": "improving" // or "worsening", "stable"
  },
  "wins": ["..."],
  "warnings": ["..."],
  "recommendedActions": [
    {
      "title": "...",
      "estimatedSavings": 60,
      "difficulty": "easy",
      "reason": "..."
    }
  ],
  "recurringTransactionsToReview": [
    {
      "merchant": "...",
      "averageAmount": 15.99,
      "frequency": "monthly",
      "recommendation": "..."
    }
  ],
  "possibleTenantPayments": [
    {
      "name": "...",
      "averageAmount": 1000,
      "confidence": 0.8,
      "note": "..."
    }
  ],
  "newMemoriesToStore": [
    {
      "title": "...",
      "content": "...",
      "importanceScore": 9
    }
  ]
}
`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "system", content: prompt }],
    response_format: { type: "json_object" },
  });

  const content = response.choices[0].message.content || "{}";
  const insight = JSON.parse(content);

  // 4. Save new memories to Pinecone & Prisma
  if (insight.newMemoriesToStore && Array.isArray(insight.newMemoriesToStore)) {
    for (const mem of insight.newMemoriesToStore) {
      const vectorId = crypto.randomUUID();
      const embedding = await getEmbedding(mem.content);
      
      await index.upsert([{
        id: vectorId,
        values: embedding,
        metadata: {
          userId,
          content: mem.content,
          type: "AI_GENERATED",
          createdAt: new Date().toISOString(),
        }
      }]);

      await prisma.financialMemory.create({
        data: {
          userId,
          type: "AI_GENERATED",
          title: mem.title,
          content: mem.content,
          source: "Daily Insight",
          importanceScore: mem.importanceScore,
          pineconeVectorId: vectorId,
        }
      });
    }
  }

  return insight;
}
