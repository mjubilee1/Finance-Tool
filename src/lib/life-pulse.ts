import { DateTime } from "luxon";
import { loadCoachNetworkPack, type CoachNetworkContact } from "@/lib/coach-network";
import {
  ensureEntrepreneurshipRoutineForToday,
  isEntrepreneurshipNotes,
  type EntrepreneurshipPipelineStage,
} from "@/lib/entrepreneurship-routine";
import {
  fetchUpcomingGoogleCalendarEvents,
  getGoogleCalendarStatus,
  type GoogleCalendarEvent,
  type GoogleCalendarStatus,
} from "@/lib/google-calendar";
import {
  getPlannerDayLayouts,
  loadUserPlanActivitiesBetween,
} from "@/lib/planner";
import {
  loadRelevantMemories,
  type RelevantMemory,
} from "@/lib/relevant-memories";
import {
  buildTodayBriefContext,
  type TodayBriefContext,
} from "@/lib/today-brief";
import { calendarDateTime, userNow } from "@/lib/user-timezone";
import {
  buildWeeklyOperatingPlan,
  type WeeklyOperatingPlan,
} from "@/lib/weekly-operating-plan";

type PulseCalendar = GoogleCalendarStatus & {
  events: GoogleCalendarEvent[];
  error?: string;
};

export type LifePulse = {
  generatedAt: string;
  date: string;
  todayBrief: TodayBriefContext;
  weeklyPlan: WeeklyOperatingPlan;
  calendar: PulseCalendar;
  todayCalendarEvents: GoogleCalendarEvent[];
  network: {
    contacts: CoachNetworkContact[];
    withNotesCount: number;
  } | null;
  relevantMemories: RelevantMemory[];
  entrepreneurship: {
    sectionLabel: string;
    stage: EntrepreneurshipPipelineStage;
    upcomingInterviewTitle: string | null;
    weeklyTargets: string[];
    weekDoneCount: number;
    todayItems: TodayBriefContext["userPlanBlocks"];
  } | null;
};

export type BuildLifePulseOptions = {
  query?: string;
  includeNetwork?: boolean;
  ensureEntrepreneurship?: boolean;
  calendarDaysBack?: number;
  calendarDaysAhead?: number;
  memoryLimit?: number;
};

async function loadPulseCalendar(
  userId: string,
  now: DateTime,
  options: BuildLifePulseOptions,
): Promise<PulseCalendar> {
  try {
    return await fetchUpcomingGoogleCalendarEvents(userId, {
      timeMin: now
        .minus({ days: options.calendarDaysBack ?? 0 })
        .startOf("day")
        .toJSDate(),
      timeMax: now
        .plus({ days: options.calendarDaysAhead ?? 7 })
        .endOf("day")
        .toJSDate(),
      maxResults: 80,
    });
  } catch (error) {
    return {
      ...(await getGoogleCalendarStatus(userId)),
      events: [],
      error:
        error instanceof Error
          ? error.message
          : "Could not load Google Calendar.",
    };
  }
}

/**
 * Shared, current-state context for Overview and every coach surface.
 *
 * The pulse is intentionally factual and compact. Prompt builders decide which
 * slices to expand; they should not rebuild a separate version of the user's day.
 */
export async function buildLifePulse(
  userId: string,
  options: BuildLifePulseOptions = {},
): Promise<LifePulse> {
  const now = userNow();
  const date = now.toISODate()!;
  const weekEnd = now.plus({ days: 6 }).toISODate()!;
  const calendar = await loadPulseCalendar(userId, now, options);

  const entrepreneurship =
    options.ensureEntrepreneurship === false
      ? null
      : await ensureEntrepreneurshipRoutineForToday(userId, {
          calendarEvents: calendar.events,
        }).catch((error) => {
          console.error("Entrepreneurship routine pulse failed:", error);
          return null;
        });

  // Build the brief after seeding so today's startup blocks are visible everywhere.
  const [todayBrief, userPlanActivities, layoutsByDate, network, relevantMemories] =
    await Promise.all([
      buildTodayBriefContext(userId),
      loadUserPlanActivitiesBetween(userId, date, weekEnd),
      getPlannerDayLayouts(userId, date, weekEnd),
      options.includeNetwork
        ? loadCoachNetworkPack(userId)
        : Promise.resolve(null),
      loadRelevantMemories(userId, options.query ?? "", {
        limit: options.memoryLimit ?? 8,
      }),
    ]);

  const weeklyPlan = buildWeeklyOperatingPlan({
    start: now,
    calendarEvents: calendar.events,
    userPlanActivities,
    layoutsByDate,
  });
  const todayCalendarEvents = calendar.events.filter((event) => {
    const start = calendarDateTime(event.start);
    return start.isValid && start.hasSame(now, "day");
  });

  return {
    generatedAt: now.toISO() ?? new Date().toISOString(),
    date,
    todayBrief,
    weeklyPlan,
    calendar,
    todayCalendarEvents,
    network,
    relevantMemories,
    entrepreneurship: entrepreneurship
      ? {
          sectionLabel: entrepreneurship.sectionLabel,
          stage: entrepreneurship.stage,
          upcomingInterviewTitle: entrepreneurship.upcomingInterviewTitle,
          weeklyTargets: entrepreneurship.weeklyTargets,
          weekDoneCount: entrepreneurship.weekDoneCount,
          todayItems: todayBrief.userPlanBlocks.filter((block) =>
            isEntrepreneurshipNotes(block.notes),
          ),
        }
      : null,
  };
}
