import { DateTime } from "luxon";
import { prisma } from "@/lib/prisma";
import type { GrowthDomain } from "@/lib/growth-agent";
import { calendarDateTime, userNow } from "@/lib/user-timezone";
import {
  linkActivityMentions,
  parseAtMentions,
  resolveContactMentions,
  touchContactsFromMentions,
} from "@/lib/growth-contact-mentions";
import {
  fetchUpcomingGoogleCalendarEvents,
  type GoogleCalendarEvent,
} from "@/lib/google-calendar";

type ClassifiedCalendarEvent = {
  domain: GrowthDomain;
  category: string;
  leverage: "immediate_income" | "long_term_leverage";
  impactScore: number;
};

const SKIP_TITLE_RE = /^(busy|focus time|hold|blocked|block|ooo|out of office)$/i;

function classifyCalendarEvent(title: string, description: string | null): ClassifiedCalendarEvent {
  const haystack = `${title} ${description ?? ""}`.toLowerCase();

  if (/\b(gym|workout|training|planet fitness|lift|cardio|push day|pull day|leg day)\b/.test(haystack)) {
    return {
      domain: "fitness",
      category: "gym",
      leverage: "long_term_leverage",
      impactScore: 7,
    };
  }
  if (
    /\b(network|meetup|mixer|happy hour|conference|coffee with|lunch with|dinner with|intro|1:1|one-on-one|founder|investor|reconnect)\b/.test(
      haystack,
    ) ||
    parseAtMentions(`${title} ${description ?? ""}`).length > 0
  ) {
    return {
      domain: "social",
      category: "networking",
      leverage: "long_term_leverage",
      impactScore: 7,
    };
  }
  if (/\b(church|service|bible|volunteer|community)\b/.test(haystack)) {
    return {
      domain: "personal",
      category: "community",
      leverage: "long_term_leverage",
      impactScore: 6,
    };
  }
  if (/\b(interview|promotion|performance review|deep work|build|ship|standup|team meeting|desk)\b/.test(haystack)) {
    return {
      domain: "career",
      category: "work",
      leverage: "long_term_leverage",
      impactScore: 6,
    };
  }

  return {
    domain: "personal",
    category: "calendar",
    leverage: "long_term_leverage",
    impactScore: 4,
  };
}

function eventDateIso(event: GoogleCalendarEvent) {
  const start = calendarDateTime(event.start);
  return start.isValid ? start.toISODate()! : userNow().toISODate()!;
}

function eventDurationMinutes(event: GoogleCalendarEvent) {
  if (!event.end) return null;
  const start = calendarDateTime(event.start);
  const end = calendarDateTime(event.end);
  if (!start.isValid || !end.isValid) return null;
  const minutes = Math.round(end.diff(start, "minutes").minutes);
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  return Math.min(480, minutes);
}

function isEventComplete(event: GoogleCalendarEvent, now: DateTime) {
  if (event.allDay) {
    const day = calendarDateTime(event.start);
    return day.isValid && day.startOf("day") < now.startOf("day");
  }

  const end = event.end ? calendarDateTime(event.end) : calendarDateTime(event.start);
  return end.isValid && end <= now;
}

function shouldSkipCalendarEvent(event: GoogleCalendarEvent) {
  const title = event.title.trim();
  if (!title || SKIP_TITLE_RE.test(title)) return true;
  const minutes = eventDurationMinutes(event);
  if (minutes != null && minutes < 10 && !/@/.test(title)) return true;
  return false;
}

function buildCalendarActivityNotes(
  event: GoogleCalendarEvent,
  matchedContacts: Array<{ name: string }>,
) {
  const parts = ["From Google Calendar."];
  if (matchedContacts.length > 0) {
    parts.push(`With: ${matchedContacts.map((contact) => contact.name).join(", ")}.`);
  }
  if (event.location) {
    parts.push(`Location: ${event.location}.`);
  }
  if (event.description?.trim()) {
    parts.push(event.description.trim());
  }
  return parts.join(" ").slice(0, 2000);
}

export async function syncCalendarEventsToGrowth(
  userId: string,
  options?: { daysBack?: number },
) {
  const daysBack = options?.daysBack ?? 14;
  const now = userNow();
  const timeMin = now.minus({ days: daysBack }).startOf("day");

  let calendar;
  try {
    calendar = await fetchUpcomingGoogleCalendarEvents(userId, {
      timeMin: timeMin.toJSDate(),
      timeMax: now.toJSDate(),
      maxResults: 120,
    });
  } catch {
    return { synced: 0, touchedContacts: 0, connected: false };
  }

  if (!calendar.connected || calendar.events.length === 0) {
    return { synced: 0, touchedContacts: 0, connected: calendar.connected };
  }

  const existing = await prisma.growthActivity.findMany({
    where: {
      userId,
      sourceCalendarEventId: { not: null },
      date: { gte: timeMin.toISODate()! },
    },
    select: { sourceCalendarEventId: true },
  });
  const existingIds = new Set(
    existing.map((activity) => activity.sourceCalendarEventId).filter(Boolean) as string[],
  );

  const contacts = await prisma.growthContact.findMany({
    where: { userId },
    select: { id: true, name: true },
  });

  let synced = 0;
  let touchedContacts = 0;

  for (const event of calendar.events) {
    if (!event.id || existingIds.has(event.id)) continue;
    if (!isEventComplete(event, now)) continue;
    if (shouldSkipCalendarEvent(event)) continue;

    const classified = classifyCalendarEvent(event.title, event.description ?? null);
    const mentions = parseAtMentions(`${event.title} ${event.description ?? ""}`);
    const matched = resolveContactMentions(mentions, contacts);
    const eventDate = eventDateIso(event);

    await prisma.growthActivity.create({
      data: {
        userId,
        date: eventDate,
        domain: classified.domain,
        category: classified.category,
        title: event.title.slice(0, 160),
        notes: buildCalendarActivityNotes(event, matched),
        leverage: classified.leverage,
        minutesSpent: eventDurationMinutes(event),
        impactScore: classified.impactScore,
        sourceCalendarEventId: event.id,
      },
    });

    if (matched.length > 0) {
      await touchContactsFromMentions(
        userId,
        matched.map((contact) => contact.id),
        eventDate,
        `Calendar: ${event.title}`,
      );
      touchedContacts += matched.length;
    }

    synced += 1;
    existingIds.add(event.id);
  }

  return { synced, touchedContacts, connected: true };
}

export async function getRecentCalendarContextForGrowth(userId: string) {
  const now = userNow();
  const pastStart = now.minus({ days: 7 }).startOf("day");
  const futureEnd = now.plus({ days: 7 }).endOf("day");

  try {
    const calendar = await fetchUpcomingGoogleCalendarEvents(userId, {
      timeMin: pastStart.toJSDate(),
      timeMax: futureEnd.toJSDate(),
      maxResults: 40,
    });

    if (!calendar.connected) {
      return { connected: false, recent: [], upcoming: [] };
    }

    const recent = calendar.events
      .filter((event) => isEventComplete(event, now))
      .slice(0, 12)
      .map((event) => ({
        date: eventDateIso(event),
        title: event.title,
        domain: classifyCalendarEvent(event.title, event.description ?? null).domain,
        category: classifyCalendarEvent(event.title, event.description ?? null).category,
        mentions: parseAtMentions(`${event.title} ${event.description ?? ""}`),
        location: event.location,
      }));

    const upcoming = calendar.events
      .filter((event) => !isEventComplete(event, now))
      .slice(0, 8)
      .map((event) => ({
        date: eventDateIso(event),
        title: event.title,
        start: event.start,
        mentions: parseAtMentions(`${event.title} ${event.description ?? ""}`),
      }));

    return { connected: true, recent, upcoming };
  } catch {
    return { connected: false, recent: [], upcoming: [] };
  }
}

export async function applyMentionsToActivityText(
  userId: string,
  text: string,
  activityDate: string,
  activityTitle: string,
) {
  const matched = await linkActivityMentions(userId, text, activityDate, activityTitle);
  return matched.map((contact) => contact.name);
}
