import { DateTime } from "luxon";

/** Single-user app default — Maryland / DMV (matches coach calendar context). */
export const USER_TIME_ZONE = "America/New_York";

export function userNow() {
  return DateTime.now().setZone(USER_TIME_ZONE);
}

/** ISO date (yyyy-MM-dd) for "today" in the user's zone — the single source of truth for day-boundary logic. */
export function userToday() {
  return userNow().toISODate()!;
}

/** Weekday (1=Mon…7=Sun) for "today" in the user's zone. */
export function userWeekday() {
  return userNow().weekday;
}

/** Parse a Google Calendar ISO timestamp and express it in the user's zone. */
export function calendarDateTime(iso: string) {
  return DateTime.fromISO(iso, { setZone: true }).setZone(USER_TIME_ZONE);
}
