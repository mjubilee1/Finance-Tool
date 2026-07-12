import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCostControlConfig } from "@/lib/env";
import { ensureFreshDailySnapshot } from "@/lib/daily-snapshot";
import {
  generateHighLeverageRecommendation,
  generateWeeklyGrowthReview,
} from "@/lib/growth-agent";
import { DateTime } from "luxon";

export async function POST(req: Request) {
  const { cronSecret, aiBriefRefreshHours } = getCostControlConfig();
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 500 });
  }

  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const users = await prisma.user.findMany();
    let generated = 0;
    let refreshed = 0;
    let skipped = 0;
    let growthRecommendations = 0;
    let weeklyReviews = 0;
    const isSunday = DateTime.local().weekday === 7;

    for (const user of users) {
      try {
        const result = await ensureFreshDailySnapshot(user.id);
        if (result.status === "created") {
          generated++;
        } else if (result.status === "updated") {
          refreshed++;
        } else {
          skipped++;
        }

        try {
          await generateHighLeverageRecommendation(user.id);
          growthRecommendations++;
          if (isSunday) {
            await generateWeeklyGrowthReview(user.id);
            weeklyReviews++;
          }
        } catch (growthErr) {
          console.error(`Growth cron failed for user ${user.id}:`, growthErr);
        }
      } catch (err) {
        console.error(`Failed cron for user ${user.id}:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      cadenceHours: aiBriefRefreshHours,
      generated,
      refreshed,
      skipped,
      growthRecommendations,
      weeklyReviews,
    });
  } catch (error) {
    console.error("Cron failed:", error);
    return NextResponse.json({ error: "Failed to run cron." }, { status: 500 });
  }
}
