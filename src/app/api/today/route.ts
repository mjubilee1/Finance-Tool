import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getTrendDigestForDate, isTechTrendTheme, serializeTrendDigest } from "@/lib/trends";
import { cleanupPromotionalProjectBlocks } from "@/lib/cleanup-promotion-blocks";
import { buildLifePulse } from "@/lib/life-pulse";
import { userNow } from "@/lib/user-timezone";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = userNow();
    const today = now.toISODate()!;
    // Strip leftover auto-injected promotion rails from the DB before building Today.
    await cleanupPromotionalProjectBlocks(session.user.id).catch((error) => {
      console.error("Promotion-block cleanup failed:", error);
    });
    const [pulse, digest] = await Promise.all([
      buildLifePulse(session.user.id, {
        query: "today overview money growth entrepreneurship schedule",
        includeNetwork: false,
        ensureEntrepreneurship: false,
        calendarDaysAhead: 7,
        memoryLimit: 6,
      }),
      getTrendDigestForDate(session.user.id, today).catch((error) => {
        console.error("Trend digest failed while loading today overview:", error);
        return null;
      }),
    ]);

    const brief = pulse.todayBrief;
    const serialized = digest ? serializeTrendDigest(digest) : null;
    const calendar = {
      ...pulse.calendar,
      events: pulse.todayCalendarEvents,
    };

    return NextResponse.json({
      brief: {
        date: brief.date,
        timeGreeting: brief.timeGreeting,
        dayShape: brief.dayShape,
        dayLabel: brief.dayLabel,
        dateLabel: brief.dateLabel,
        plan: brief.plan,
        recommendation: brief.recommendation,
        moneyHeadline: brief.moneyHeadline,
        userPlanBlocks: brief.userPlanBlocks,
        completedBlockKeys: brief.completedBlockKeys,
        skippedBlockKeys: brief.skippedBlockKeys,
        plannerLayout: brief.plannerLayout,
        planBlocks: brief.planBlocks,
      },
      // Existing digest only — never block Overview on regenerating Trends.
      trendTldr: serialized
        ? {
            tech: serialized.techMain,
            dmv: serialized.dmvMain,
            focusGuardrail: serialized.focusGuardrail,
            topTechItem:
              serialized.items.find((item) => isTechTrendTheme(item.theme)) ?? null,
          }
        : null,
      calendar,
      weekPlan: pulse.weeklyPlan,
      entrepreneurship: pulse.entrepreneurship
        ? {
            sectionLabel: pulse.entrepreneurship.sectionLabel,
            weeklyTargets: pulse.entrepreneurship.weeklyTargets,
            weekDoneCount: pulse.entrepreneurship.weekDoneCount,
            stage: pulse.entrepreneurship.stage,
            upcomingInterviewTitle:
              pulse.entrepreneurship.upcomingInterviewTitle,
          }
        : null,
    });
  } catch (error) {
    console.error("Failed to load today overview:", error);
    return NextResponse.json({ error: "Failed to load today's overview." }, { status: 500 });
  }
}
