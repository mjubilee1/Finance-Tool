import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { buildTodayBriefContext } from "@/lib/today-brief";
import { getTrendDigestForDate, isTechTrendTheme, serializeTrendDigest } from "@/lib/trends";
import {
  fetchUpcomingGoogleCalendarEvents,
  getGoogleCalendarStatus,
  type GoogleCalendarEvent,
} from "@/lib/google-calendar";
import { buildWeeklyOperatingPlan } from "@/lib/weekly-operating-plan";
import { getPlannerDayLayouts, loadUserPlanActivitiesBetween } from "@/lib/planner";
import { DateTime } from "luxon";
import { calendarDateTime, userNow } from "@/lib/user-timezone";

async function loadWeekUserPlanActivities(userId: string, start: DateTime) {
  const startDate = start.toISODate()!;
  const endDate = start.plus({ days: 6 }).toISODate()!;
  return loadUserPlanActivitiesBetween(userId, startDate, endDate);
}

async function loadWeekCalendar(userId: string, now: DateTime) {
  try {
    return await fetchUpcomingGoogleCalendarEvents(userId, {
      timeMin: now.toJSDate(),
      timeMax: now.plus({ days: 6 }).endOf("day").toJSDate(),
      maxResults: 40,
    });
  } catch (error) {
    const status = await getGoogleCalendarStatus(userId);
    return {
      ...status,
      events: [] as GoogleCalendarEvent[],
      error: error instanceof Error ? error.message : "Could not load Google Calendar.",
    };
  }
}

function isTodayEvent(event: GoogleCalendarEvent, now: DateTime) {
  const start = calendarDateTime(event.start);
  return start.isValid && start.hasSame(now, "day");
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = userNow();
    const today = now.toISODate()!;
    const weekEnd = now.plus({ days: 6 }).toISODate()!;
    const [brief, digest, weekCalendar, userPlanActivities, layoutsByDate] = await Promise.all([
      buildTodayBriefContext(session.user.id),
      getTrendDigestForDate(session.user.id, today).catch((error) => {
        console.error("Trend digest failed while loading today overview:", error);
        return null;
      }),
      loadWeekCalendar(session.user.id, now),
      loadWeekUserPlanActivities(session.user.id, now).catch((error) => {
        console.error("Week user plan activities failed:", error);
        return [];
      }),
      getPlannerDayLayouts(session.user.id, today, weekEnd),
    ]);

    const serialized = digest ? serializeTrendDigest(digest) : null;
    const weekCalendarData =
      weekCalendar ??
      ({
        ...(await getGoogleCalendarStatus(session.user.id)),
        events: [] as GoogleCalendarEvent[],
      } as const);
    const calendar = {
      ...weekCalendarData,
      events: weekCalendarData.events.filter((event) => isTodayEvent(event, now)),
    };
    const weekPlan = buildWeeklyOperatingPlan({
      start: now,
      calendarEvents: weekCalendarData.events,
      userPlanActivities,
      layoutsByDate,
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
      weekPlan,
    });
  } catch (error) {
    console.error("Failed to load today overview:", error);
    return NextResponse.json({ error: "Failed to load today's overview." }, { status: 500 });
  }
}
