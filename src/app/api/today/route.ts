import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { buildTodayBriefContext } from "@/lib/today-brief";
import { getTrendDigestForDate, isTechTrendTheme, serializeTrendDigest } from "@/lib/trends";
import { fetchUpcomingGoogleCalendarEvents, type GoogleCalendarEvent } from "@/lib/google-calendar";
import { prisma } from "@/lib/prisma";
import { buildWeeklyOperatingPlan } from "@/lib/weekly-operating-plan";
import { DateTime } from "luxon";

async function loadWeekUserPlanActivities(userId: string, start: DateTime) {
  return prisma.growthActivity.findMany({
    where: {
      userId,
      category: "user_plan",
      date: {
        gte: start.toISODate() ?? undefined,
        lte: start.plus({ days: 6 }).toISODate() ?? undefined,
      },
    },
    orderBy: { createdAt: "asc" },
    select: {
      date: true,
      title: true,
      domain: true,
      notes: true,
      minutesSpent: true,
    },
  });
}

async function loadWeekCalendar(userId: string, now: DateTime) {
  try {
    return await fetchUpcomingGoogleCalendarEvents(userId, {
      timeMin: now.toJSDate(),
      timeMax: now.plus({ days: 6 }).endOf("day").toJSDate(),
      maxResults: 40,
    });
  } catch {
    return null;
  }
}

function isTodayEvent(event: GoogleCalendarEvent, now: DateTime) {
  const start = DateTime.fromISO(event.start);
  return start.isValid && start.hasSame(now, "day");
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = DateTime.local();
    const today = now.toISODate()!;
    const [brief, digest, weekCalendar, userPlanActivities] = await Promise.all([
      buildTodayBriefContext(session.user.id),
      getTrendDigestForDate(session.user.id, today),
      loadWeekCalendar(session.user.id, now),
      loadWeekUserPlanActivities(session.user.id, now),
    ]);

    const serialized = digest ? serializeTrendDigest(digest) : null;
    const calendar = weekCalendar
      ? {
          ...weekCalendar,
          events: weekCalendar.events.filter((event) => isTodayEvent(event, now)),
        }
      : null;
    const weekPlan = buildWeeklyOperatingPlan({
      start: now,
      calendarEvents: weekCalendar?.events ?? [],
      userPlanActivities,
    });

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
      weekPlan,
    });
  } catch (error) {
    console.error("Failed to load today overview:", error);
    return NextResponse.json({ error: "Failed to load today's overview." }, { status: 500 });
  }
}
