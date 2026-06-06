import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateDailyInsight } from "@/lib/ai-coach";
import { getCostControlConfig } from "@/lib/env";

export async function POST(req: Request) {
  const { cronSecret } = getCostControlConfig();
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 500 });
  }

  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const users = await prisma.user.findMany();
    const today = new Date().toISOString().split('T')[0];
    let generated = 0;
    let skipped = 0;
    
    for (const user of users) {
      try {
        const [existingSnapshot, transactionCount] = await Promise.all([
          prisma.dailyFinancialSnapshot.findUnique({
            where: {
              userId_date: {
                userId: user.id,
                date: today,
              },
            },
          }),
          prisma.transaction.count({
            where: { userId: user.id },
          }),
        ]);

        if (existingSnapshot || transactionCount === 0) {
          skipped++;
          continue;
        }
        
        // Generate AI Insight
        const insight = await generateDailyInsight(user.id);
        
        // Create Daily Snapshot
        await prisma.dailyFinancialSnapshot.create({
          data: {
            userId: user.id,
            date: today,
            totalSpent: 0, // Should be calculated
            totalIncome: 0,
            foodSpend: 0,
            transportationSpend: 0,
            billsSpend: 0,
            discretionarySpend: 0,
            recurringSpend: 0,
            accountBalanceTotal: 0,
            dailyScore: insight.financialHealthScore,
            summary: JSON.stringify(insight), // Store the JSON response
          }
        });
        generated++;
      } catch (err) {
        console.error(`Failed cron for user ${user.id}:`, err);
      }
    }

    return NextResponse.json({ success: true, generated, skipped });
  } catch (error) {
    console.error("Cron failed:", error);
    return NextResponse.json({ error: "Failed to run cron." }, { status: 500 });
  }
}
