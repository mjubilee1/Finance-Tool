import { prisma } from "../src/lib/prisma";
import { generateDailyInsight } from "../src/lib/ai-coach";

async function main() {
  const users = await prisma.user.findMany();
  const today = new Date().toISOString().split('T')[0];
  
  for (const user of users) {
    console.log(`Generating insight for user ${user.id}...`);
    try {
      const insight = await generateDailyInsight(user.id);
      
      await prisma.dailyFinancialSnapshot.upsert({
        where: {
          userId_date: {
            userId: user.id,
            date: today,
          },
        },
        update: {
          summary: JSON.stringify(insight),
          dailyScore: insight.financialHealthScore || 70,
        },
        create: {
          userId: user.id,
          date: today,
          totalSpent: 0,
          totalIncome: 0,
          foodSpend: 0,
          transportationSpend: 0,
          billsSpend: 0,
          discretionarySpend: 0,
          recurringSpend: 0,
          accountBalanceTotal: 0,
          dailyScore: insight.financialHealthScore || 70,
          summary: JSON.stringify(insight),
        }
      });
      console.log(`Successfully generated insight for user ${user.id}`);
    } catch (err) {
      console.error(`Failed to generate insight for user ${user.id}:`, err);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
