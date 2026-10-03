import { DateTime } from "luxon";
import type { GoogleCalendarEvent } from "@/lib/google-calendar";
import { calendarDateTime, userNow } from "@/lib/user-timezone";
import { dayShapeFor, type DayShape } from "@/lib/joy-ideas-shared";
import { isCeoGrowthCalendarEvent } from "@/lib/agenda-policy";
import {
  applyCustomOrder,
  calendarPlanRef,
  resolvePlannerOverride,
  userPlanRef,
  weekPlanRef,
  type PlannerBlockOverride,
  type PlannerDayLayoutData,
} from "@/lib/planner";

export type WeeklyOperatingBlockType =
  | "calendar"
  | "cash"
  | "focus"
  | "free"
  | "prep"
  | "recovery"
  | "review"
  | "training"
  | "work";

export type WeeklyOperatingBlockPriority = "locked" | "protect" | "optional" | "prep";

export type WeeklyOperatingBlock = {
  id: string;
  type: WeeklyOperatingBlockType;
  priority: WeeklyOperatingBlockPriority;
  label: string;
  time: string;
  why: string;
  source: "weekly_template" | "google_calendar" | "user_plan";
  sortKey: number;
  ref?: string;
  status?: "planned" | "done" | "skipped" | "hidden";
  activityId?: string;
  domain?: string;
  calendarEventId?: string;
  location?: string | null;
  htmlLink?: string | null;
};

export type WeeklyOperatingDay = {
  date: string;
  dateLabel: string;
  weekdayLabel: string;
  dayShape: DayShape;
  headline: string;
  valueFocus: string;
  blocks: WeeklyOperatingBlock[];
};

export type WeeklyOperatingPlan = {
  generatedAt: string;
  startDate: string;
  endDate: string;
  days: WeeklyOperatingDay[];
};

type UserPlanActivity = {
  id?: string;
  date: string;
  title: string;
  domain: string;
  notes: string | null;
  minutesSpent: number | null;
  status?: string;
  sortOrder?: number;
  timeLabel?: string | null;
};

type BuildWeeklyOperatingPlanOptions = {
  start?: DateTime;
  calendarEvents?: GoogleCalendarEvent[];
  userPlanActivities?: UserPlanActivity[];
  layoutsByDate?: Map<string, PlannerDayLayoutData>;
};

const SOCIAL_EVENT_RE = /\b(birthday|party|dinner|date|wedding|network|meetup|event|brunch|happy hour)\b/i;
const DRESS_RE = /\b(dress|outfit|attire|white|black tie|formal|casual)\b/i;

function formatEventTime(event: GoogleCalendarEvent) {
  if (event.allDay) return "All day";

  const start = calendarDateTime(event.start);
  const end = event.end ? calendarDateTime(event.end) : null;
  if (!start.isValid) return "Time TBD";

  const startLabel = start.toLocaleString(DateTime.TIME_SIMPLE);
  const endLabel = end?.isValid ? end.toLocaleString(DateTime.TIME_SIMPLE) : null;
  return endLabel ? `${startLabel}-${endLabel}` : startLabel;
}

function eventSortKey(event: GoogleCalendarEvent) {
  if (event.allDay) return 0.5;

  const start = calendarDateTime(event.start);
  if (!start.isValid) return 23.9;

  return start.hour + start.minute / 60;
}

function eventDateKey(event: GoogleCalendarEvent) {
  const start = calendarDateTime(event.start);
  return start.isValid ? start.toISODate() : null;
}

function isPrepWorthyEvent(event: GoogleCalendarEvent) {
  const text = `${event.title} ${event.location ?? ""}`;
  return SOCIAL_EVENT_RE.test(text) || DRESS_RE.test(text) || Boolean(event.location);
}

function eventPrepBlock(event: GoogleCalendarEvent): WeeklyOperatingBlock | null {
  if (!isPrepWorthyEvent(event)) return null;

  const eventStart = calendarDateTime(event.start);
  const sortKey = eventStart.isValid ? Math.max(0.25, eventSortKey(event) - 1.5) : 17.5;
  const hasDressSignal = DRESS_RE.test(event.title);
  const prepParts = [
    event.location ? "travel" : null,
    hasDressSignal ? "outfit" : null,
    "cash/time buffer",
  ].filter(Boolean);

  const id = `prep-${event.id}`;
  return {
    id,
    type: "prep",
    priority: "prep",
    label: `Prep for ${event.title}`,
    time: event.allDay ? "Before event" : "60-90 min before",
    why: `Check ${prepParts.join(", ")} so the event does not sneak up on the day.`,
    source: "weekly_template",
    sortKey,
    ref: weekPlanRef(id),
    status: "planned",
    calendarEventId: event.id,
    location: event.location,
    htmlLink: event.htmlLink,
  };
}

function applyOverride(
  block: WeeklyOperatingBlock,
  date: string,
  overrides: Record<string, PlannerBlockOverride>,
): WeeklyOperatingBlock | null {
  const override = resolvePlannerOverride(overrides, date, block.id);
  if (!override) return block;
  if (override.status === "hidden") return null;
  return {
    ...block,
    label: override.label?.trim() || block.label,
    time: override.timeLabel?.trim() || block.time,
    why: override.notes?.trim() || block.why,
    status: override.status ?? block.status ?? "planned",
  };
}

function userPlanBlocksForDay(activities: UserPlanActivity[], date: string): WeeklyOperatingBlock[] {
  return activities
    .filter((activity) => activity.date === date)
    .sort((a, b) => (a.sortOrder ?? 100) - (b.sortOrder ?? 100))
    .map((activity, index) => {
      const id = activity.id ?? `user-plan-${date}-${index}`;
      const status =
        activity.status === "done" || activity.status === "skipped" || activity.status === "planned"
          ? activity.status
          : ("planned" as const);
      return {
        id,
        type: "free" as const,
        priority: "optional" as const,
        label: activity.title,
        time:
          activity.timeLabel?.trim() ||
          (activity.minutesSpent ? `${activity.minutesSpent} min` : "Your block"),
        why: activity.notes?.trim() || `${activity.domain} · added to your plan`,
        source: "user_plan" as const,
        sortKey: 12 + index / 10,
        ref: activity.id ? userPlanRef(activity.id) : weekPlanRef(id),
        status,
        activityId: activity.id,
        domain: activity.domain,
      };
    });
}

function defaultBlocksFor(day: DateTime, shape: DayShape): WeeklyOperatingBlock[] {
  if (shape === "office") {
    return [
      {
        id: `${day.toISODate()}-lyft`,
        type: "cash",
        priority: "locked",
        label: "Lyft until $100",
        time: "AM first",
        why: "Autopilot: target $100 in the morning; after-work driving is catch-up only.",
        source: "weekly_template",
        sortKey: 6.5,
        ref: weekPlanRef(`${day.toISODate()}-lyft`),
        status: "planned",
      },
      {
        id: `${day.toISODate()}-work`,
        type: "work",
        priority: "locked",
        label: "W-2 commitments",
        time: "Use Google Calendar",
        why: "W-2 is locked; Calendar owns the exact time boxes.",
        source: "weekly_template",
        sortKey: 9,
        ref: weekPlanRef(`${day.toISODate()}-work`),
        status: "planned",
      },
      {
        id: `${day.toISODate()}-evening`,
        type: "recovery",
        priority: "optional",
        label: "Flex or Lyft catch-up",
        time: "After commute",
        why: "Drive only for the gap below $100. A named CEO growth calendar block beats vague suggestions; flex gets the remainder.",
        source: "weekly_template",
        sortKey: 19,
        ref: weekPlanRef(`${day.toISODate()}-evening`),
        status: "planned",
      },
    ];
  }

  if (shape === "wfh") {
    return [
      {
        id: `${day.toISODate()}-lyft`,
        type: "cash",
        priority: "locked",
        label: "Lyft until $100",
        time: "AM first",
        why: "Autopilot: target $100 in the morning; after-work driving is catch-up only.",
        source: "weekly_template",
        sortKey: 6.5,
        ref: weekPlanRef(`${day.toISODate()}-lyft`),
        status: "planned",
      },
      {
        id: `${day.toISODate()}-work`,
        type: "work",
        priority: "locked",
        label: "W-2 commitments",
        time: "Use Google Calendar",
        why: "W-2 stays locked; Calendar owns the exact time boxes.",
        source: "weekly_template",
        sortKey: 9,
        ref: weekPlanRef(`${day.toISODate()}-work`),
        status: "planned",
      },
      {
        id: `${day.toISODate()}-training`,
        type: "training",
        priority: "optional",
        label: "Optional gym",
        time: "Lunch or meeting gap",
        why: "Use a real flex pocket only when needed to reach three gym days this week.",
        source: "weekly_template",
        sortKey: 12,
        ref: weekPlanRef(`${day.toISODate()}-training`),
        status: "planned",
      },
      {
        id: `${day.toISODate()}-evening`,
        type: "recovery",
        priority: "optional",
        label: "Evening reset",
        time: "After work",
        why: "Leftover only after Lyft, W-2, and named CEO growth blocks.",
        source: "weekly_template",
        sortKey: 18,
        ref: weekPlanRef(`${day.toISODate()}-evening`),
        status: "planned",
      },
    ];
  }

  return [
    {
      id: `${day.toISODate()}-lyft`,
      type: "cash",
      priority: "locked",
      label: "Lyft until $100",
      time: "AM first",
      why: "Autopilot: target $100 in the morning; later driving is catch-up only.",
      source: "weekly_template",
      sortKey: 6.5,
      ref: weekPlanRef(`${day.toISODate()}-lyft`),
      status: "planned",
    },
    {
      id: `${day.toISODate()}-review`,
      type: "review",
      priority: "protect",
      label: day.weekday === 6 ? "Nearby deep work" : "Weekly review / setup",
      time: "After morning Lyft",
      why: day.weekday === 6
        ? "Saturday default: advance Nearby story → demo. Replace only with a high-signal event that has a real time."
        : "Review what is ahead and put named growth blocks on Google Calendar.",
      source: "weekly_template",
      sortKey: day.weekday === 7 ? 9 : 8,
      ref: weekPlanRef(`${day.toISODate()}-review`),
      status: "planned",
    },
    {
      id: `${day.toISODate()}-training`,
      type: "training",
      priority: "optional",
      label: "Optional gym + recovery",
      time: "Late morning or afternoon",
      why: "A longer body/recovery block fits better on weekends than office days.",
      source: "weekly_template",
      sortKey: 11,
      ref: weekPlanRef(`${day.toISODate()}-training`),
      status: "planned",
    },
    {
      id: `${day.toISODate()}-social`,
      type: "free",
      priority: "optional",
      label: "Social / network window",
      time: "Afternoon or evening",
      why: "Use open weekend space for relationships, events, or high-quality recovery.",
      source: "weekly_template",
      sortKey: 16,
      ref: weekPlanRef(`${day.toISODate()}-social`),
      status: "planned",
    },
  ];
}

function headlineFor(shape: DayShape) {
  if (shape === "office") return "Autopilot: Lyft AM first, W-2 locked; CEO growth owns named evening blocks.";
  if (shape === "wfh") return "Autopilot: Lyft AM first, W-2 locked; gym is optional.";
  return "Weekend: Lyft AM first, then Nearby deep work unless a high-signal timed event wins.";
}

function valueFocusFor(shape: DayShape) {
  if (shape === "office") {
    return "Protect W-2 and the named Calendar growth block. After-work Lyft exists only for a shortfall.";
  }
  if (shape === "wfh") return "Hit Lyft in the AM, protect W-2, then execute the named growth block; gym stays optional.";
  return "Saturday defaults to Nearby story/demo; attend only high-signal events with a real time.";
}

export function buildWeeklyOperatingPlan(
  options: BuildWeeklyOperatingPlanOptions = {},
): WeeklyOperatingPlan {
  const start = (options.start ?? userNow()).startOf("day");
  const end = start.plus({ days: 6 });
  const eventsByDate = new Map<string, GoogleCalendarEvent[]>();

  for (const event of options.calendarEvents ?? []) {
    const key = eventDateKey(event);
    if (!key) continue;
    const events = eventsByDate.get(key) ?? [];
    events.push(event);
    eventsByDate.set(key, events);
  }

  const days: WeeklyOperatingDay[] = Array.from({ length: 7 }, (_, index) => {
    const day = start.plus({ days: index });
    const date = day.toISODate()!;
    const shape = dayShapeFor(day.weekday);
    const layout = options.layoutsByDate?.get(date);
    const calendarBlocks = (eventsByDate.get(date) ?? []).map((event) => ({
      id: `calendar-${event.id}`,
      type: "calendar" as const,
      priority: isCeoGrowthCalendarEvent(event) ? "protect" as const : "locked" as const,
      label: event.title,
      time: formatEventTime(event),
      why: isCeoGrowthCalendarEvent(event)
        ? "Named CEO growth block; this overrides vague Life OS suggestions."
        : "Real Google Calendar commitment; plan around it.",
      source: "google_calendar" as const,
      sortKey: eventSortKey(event),
      ref: calendarPlanRef(event.id),
      status: "planned" as const,
      calendarEventId: event.id,
      location: event.location,
      htmlLink: event.htmlLink,
    }));
    const prepBlocks = (eventsByDate.get(date) ?? [])
      .map(eventPrepBlock)
      .filter((block): block is WeeklyOperatingBlock => Boolean(block));
    const userBlocks = userPlanBlocksForDay(options.userPlanActivities ?? [], date);

    const merged = [
      ...defaultBlocksFor(day, shape),
      ...userBlocks,
      ...prepBlocks,
      ...calendarBlocks,
    ]
      .map((block) => applyOverride(block, date, layout?.overrides ?? {}))
      .filter((block): block is WeeklyOperatingBlock => Boolean(block));

    const ordered = applyCustomOrder(
      merged.map((block) => ({
        ...block,
        ref: block.ref ?? weekPlanRef(block.id),
      })),
      layout?.order ?? [],
    ).slice(0, 8);

    return {
      date,
      dateLabel: day.toFormat("MMM d"),
      weekdayLabel: day.toFormat("ccc"),
      dayShape: shape,
      headline: headlineFor(shape),
      valueFocus: valueFocusFor(shape),
      blocks: ordered,
    };
  });

  return {
    generatedAt: userNow().toISO() ?? new Date().toISOString(),
    startDate: start.toISODate()!,
    endDate: end.toISODate()!,
    days,
  };
}
