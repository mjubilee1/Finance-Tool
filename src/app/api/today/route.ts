import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { buildTodayBriefContext } from "@/lib/today-brief";
import { getTrendDigestForDate, isTechTrendTheme, serializeTrendDigest } from "@/lib/trends";
import { DateTime } from "luxon";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const today = DateTime.local().toISODate()!;
    const [brief, digest] = await Promise.all([
      buildTodayBriefContext(session.user.id),
      getTrendDigestForDate(session.user.id, today),
    ]);

    const serialized = digest ? serializeTrendDigest(digest) : null;

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
        completedBlockKeys: brief.completedBlockKeys,
        skippedBlockKeys: brief.skippedBlockKeys,
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
    });
  } catch (error) {
    console.error("Failed to load today overview:", error);
    return NextResponse.json({ error: "Failed to load today's overview." }, { status: 500 });
  }
}
