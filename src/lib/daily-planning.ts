import { DateTime } from "luxon";
import { prisma } from "@/lib/prisma";
import type { GoogleCalendarEvent } from "@/lib/google-calendar";
import { USER_TIME_ZONE } from "@/lib/user-timezone";

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const WEEKDAY_OPTIONS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 7, label: "Sun" },
] as const;

export type RoutineScheduleInput = {
  title: string;
  weekdays: number[];
  startTime: string;
  endTime?: string | null;
  notes?: string | null;
};

export function normalizeRoutineScheduleInput(input: RoutineScheduleInput) {
  const title = input.title?.trim().slice(0, 160);
  if (!title) throw new Error("Title is required.");

  const weekdays = [
    ...new Set(
      (Array.isArray(input.weekdays) ? input.weekdays : [])
        .map(Number)
        .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7),
    ),
  ].sort((a, b) => a - b);
  if (weekdays.length === 0) throw new Error("Choose at least one day.");

  const startTime = input.startTime?.trim();
  if (!TIME_RE.test(startTime)) throw new Error("Start time must use HH:mm.");

  const endTime = input.endTime?.trim() || null;
  if (endTime && !TIME_RE.test(endTime)) {
    throw new Error("End time must use HH:mm.");
  }
  if (endTime && endTime <= startTime) {
    throw new Error("End time must be after start time.");
  }

  return {
    title,
    weekdays,
    startTime,
    endTime,
    notes: input.notes?.trim().slice(0, 1000) || null,
  };
}

export async function loadRoutineScheduleEventsBetween(
  userId: string,
  startDate: string,
  endDate: string,
): Promise<GoogleCalendarEvent[]> {
  const items = await prisma.routineScheduleItem.findMany({
    where: { userId, active: true },
    orderBy: [{ sortOrder: "asc" }, { startTime: "asc" }, { createdAt: "asc" }],
  });
  if (items.length === 0) return [];

  const start = DateTime.fromISO(startDate, { zone: USER_TIME_ZONE }).startOf("day");
  const end = DateTime.fromISO(endDate, { zone: USER_TIME_ZONE }).startOf("day");
  if (!start.isValid || !end.isValid || end < start) return [];

  const events: GoogleCalendarEvent[] = [];
  for (let date = start; date <= end; date = date.plus({ days: 1 })) {
    const isoDate = date.toISODate()!;
    for (const item of items) {
      if (!item.weekdays.includes(date.weekday)) continue;
      const eventStart = DateTime.fromISO(`${isoDate}T${item.startTime}`, {
        zone: USER_TIME_ZONE,
      });
      const eventEnd = item.endTime
        ? DateTime.fromISO(`${isoDate}T${item.endTime}`, { zone: USER_TIME_ZONE })
        : null;
      events.push({
        id: `routine:${item.id}:${isoDate}`,
        title: item.title,
        start: eventStart.toISO()!,
        end: eventEnd?.toISO() ?? null,
        allDay: false,
        location: null,
        description: item.notes,
        htmlLink: null,
      });
    }
  }
  return events;
}

export function routineItemToJson(item: {
  id: string;
  title: string;
  weekdays: number[];
  startTime: string;
  endTime: string | null;
  notes: string | null;
  active: boolean;
  sortOrder: number;
}) {
  return {
    id: item.id,
    title: item.title,
    weekdays: item.weekdays,
    startTime: item.startTime,
    endTime: item.endTime,
    notes: item.notes,
    active: item.active,
    sortOrder: item.sortOrder,
  };
}
