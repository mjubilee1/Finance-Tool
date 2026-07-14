import { DateTime } from "luxon";
import type { GoogleCalendarEvent } from "@/lib/google-calendar";
import { dayShapeFor, type DayShape } from "@/lib/joy-ideas-shared";
import { LYFT_WEEKLY_PROGRAM_FEE_LABEL } from "@/lib/lyft";
import {
  applyCustomOrder,
  calendarPlanRef,
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

  const start = DateTime.fromISO(event.start);
  const end = event.end ? DateTime.fromISO(event.end) : null;
  if (!start.isValid) return "Time TBD";

  const startLabel = start.toLocaleString(DateTime.TIME_SIMPLE);
  const endLabel = end?.isValid ? end.toLocaleString(DateTime.TIME_SIMPLE) : null;
  return endLabel ? `${startLabel}-${endLabel}` : startLabel;
}

function eventSortKey(event: GoogleCalendarEvent) {
  if (event.allDay) return 0.5;

  const start = DateTime.fromISO(event.start);
  if (!start.isValid) return 23.9;

  return start.hour + start.minute / 60;
}

function eventDateKey(event: GoogleCalendarEvent) {
  const start = DateTime.fromISO(event.start);
  return start.isValid ? start.toISODate() : null;
}

function isPrepWorthyEvent(event: GoogleCalendarEvent) {
  const text = `${event.title} ${event.location ?? ""}`;
  return SOCIAL_EVENT_RE.test(text) || DRESS_RE.test(text) || Boolean(event.location);
}

function eventPrepBlock(event: GoogleCalendarEvent): WeeklyOperatingBlock | null {
  if (!isPrepWorthyEvent(event)) return null;

  const eventStart = DateTime.fromISO(event.start);
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
  overrides: Record<string, PlannerBlockOverride>,
): WeeklyOperatingBlock | null {
  const override = overrides[block.id] ?? undefined;
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
        priority: "optional",
        label: "Morning Lyft baseline",
        time: "Before commute",
        why: `Useful only if it helps cover the ${LYFT_WEEKLY_PROGRAM_FEE_LABEL} fee without stealing the workday.`,
        source: "weekly_template",
        sortKey: 6.5,
        ref: weekPlanRef(`${day.toISODate()}-lyft`),
        status: "planned",
      },
      {
        id: `${day.toISODate()}-work`,
        type: "work",
        priority: "locked",
        label: "9-5 work",
        time: "9 AM-5 PM",
        why: "W2 job is the locked block Mon-Fri. Midday is desk-only.",
        source: "weekly_template",
        sortKey: 9,
        ref: weekPlanRef(`${day.toISODate()}-work`),
        status: "planned",
      },
      {
        id: `${day.toISODate()}-promotion`,
        type: "focus",
        priority: "optional",
        label: "Extra promotion / network",
        time: "Evening or off-hours",
        why: "Promotion work is optional and happens outside 9-5 when you have bandwidth.",
        source: "weekly_template",
        sortKey: 18,
        ref: weekPlanRef(`${day.toISODate()}-promotion`),
        status: "planned",
      },
      {
        id: `${day.toISODate()}-evening`,
        type: "recovery",
        priority: "optional",
        label: "Evening reset or Lyft",
        time: "After commute",
        why: "Use the evening intentionally: recovery if the floor is handled, Lyft only if the fee math needs it.",
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
        priority: "protect",
        label: "Morning Lyft before 9-5",
        time: "Before work starts",
        why: `Thu-Fri rhythm: drive before the locked job block; count profit only after the ${LYFT_WEEKLY_PROGRAM_FEE_LABEL} fee.`,
        source: "weekly_template",
        sortKey: 6.5,
        ref: weekPlanRef(`${day.toISODate()}-lyft`),
        status: "planned",
      },
      {
        id: `${day.toISODate()}-work`,
        type: "work",
        priority: "locked",
        label: "9-5 work",
        time: "9 AM-5 PM",
        why: "W2 job stays locked. WFH flex pockets — like gym — sit inside this block when meetings allow.",
        source: "weekly_template",
        sortKey: 9,
        ref: weekPlanRef(`${day.toISODate()}-work`),
        status: "planned",
      },
      {
        id: `${day.toISODate()}-training`,
        type: "training",
        priority: "protect",
        label: "Gym in midday flex",
        time: "Lunch or meeting gap",
        why: "On Thu-Fri WFH, fit training inside 9-5 using a flex pocket — not after the whole day is gone.",
        source: "weekly_template",
        sortKey: 12,
        ref: weekPlanRef(`${day.toISODate()}-training`),
        status: "planned",
      },
      {
        id: `${day.toISODate()}-promotion`,
        type: "focus",
        priority: "optional",
        label: "Extra promotion / network",
        time: "Evening or off-hours",
        why: "Promotion, startup, and networking are extras outside the locked job block.",
        source: "weekly_template",
        sortKey: 18,
        ref: weekPlanRef(`${day.toISODate()}-promotion`),
        status: "planned",
      },
    ];
  }

  return [
    {
      id: `${day.toISODate()}-lyft`,
      type: "cash",
      priority: "protect",
      label: "Morning Lyft",
      time: "AM before the day starts",
      why: `Weekend rhythm matches weekdays: morning Lyft first, then count profit only after the ${LYFT_WEEKLY_PROGRAM_FEE_LABEL} fee.`,
      source: "weekly_template",
      sortKey: 6.5,
      ref: weekPlanRef(`${day.toISODate()}-lyft`),
      status: "planned",
    },
    {
      id: `${day.toISODate()}-review`,
      type: "review",
      priority: "protect",
      label: "Weekly review / setup",
      time: day.weekday === 7 ? "After morning Lyft" : "Morning",
      why: "Review what is ahead, what needs prep, and which blocks actually create value.",
      source: "weekly_template",
      sortKey: day.weekday === 7 ? 9 : 8,
      ref: weekPlanRef(`${day.toISODate()}-review`),
      status: "planned",
    },
    {
      id: `${day.toISODate()}-training`,
      type: "training",
      priority: "protect",
      label: "Gym + recovery",
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
  if (shape === "office") return "Office rails: 9-5 work is locked; extras happen after hours.";
  if (shape === "wfh") return "WFH rails: morning Lyft, 9-5 work locked, gym in midday flex.";
  return "Weekend rails: morning Lyft AM, then gym, social, and recovery.";
}

function valueFocusFor(shape: DayShape) {
  if (shape === "office") return "Protect 9-5 work; promotion and network are optional off-hours extras.";
  if (shape === "wfh") return "Morning Lyft, then 9-5 work; gym uses a midday flex pocket inside the job day.";
  return "Morning Lyft AM like every other day, then use the open day for gym, events, and recovery.";
}

export function buildWeeklyOperatingPlan(
  options: BuildWeeklyOperatingPlanOptions = {},
): WeeklyOperatingPlan {
  const start = (options.start ?? DateTime.local()).startOf("day");
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
      priority: "locked" as const,
      label: event.title,
      time: formatEventTime(event),
      why: "Real Google Calendar commitment; plan around it.",
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
      .map((block) => applyOverride(block, layout?.overrides ?? {}))
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
    generatedAt: DateTime.local().toISO() ?? new Date().toISOString(),
    startDate: start.toISODate()!,
    endDate: end.toISODate()!,
    days,
  };
}
