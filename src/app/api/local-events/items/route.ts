import { getAppUser } from "@/lib/app-user";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  LOCAL_EVENT_STATUSES,
  type LocalEventStatus,
} from "@/lib/local-events-shared";
import { DateTime } from "luxon";
import { USER_TIME_ZONE } from "@/lib/user-timezone";
import {
  buildCeoEventDescription,
  saturdayEventDecision,
} from "@/lib/agenda-policy";
import {
  createGoogleCalendarEvent,
  updateGoogleCalendarEvent,
} from "@/lib/google-calendar";

function themeToDomain(
  theme: string
): "social" | "startup" | "career" | "fitness" | "personal" | "financial" {
  if (theme === "networking" || theme === "culture_social" || theme === "festival" || theme === "music_arts") {
    return "social";
  }
  if (theme === "founder_startup") return "startup";
  if (theme === "learning_skill") return "career";
  if (theme === "fitness_body") return "fitness";
  if (theme === "real_estate_housing") return "financial";
  return "personal";
}

export async function PATCH(request: Request) {
  try {
    const user = await getAppUser();
    if (!user) {
      return NextResponse.json({ error: "App user is not configured." }, { status: 503 });
    }

    const body = await request.json();
    const { id, status, logToGrowth, plannedStart, plannedEnd } = body as {
      id?: string;
      status?: string;
      logToGrowth?: boolean;
      plannedStart?: string;
      plannedEnd?: string;
    };

    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const item = await prisma.localEventItem.findFirst({
      where: { id, digest: { userId: user.id } },
      include: { digest: true },
    });
    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const data: {
      status?: LocalEventStatus;
      loggedActivityId?: string | null;
      plannedStart?: Date | null;
      plannedEnd?: Date | null;
      calendarEventId?: string | null;
    } = {};

    if (status != null) {
      if (!(LOCAL_EVENT_STATUSES as readonly string[]).includes(status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      data.status = status as LocalEventStatus;
    }

    if (status === "planned") {
      const start = DateTime.fromISO(plannedStart ?? "", { zone: USER_TIME_ZONE });
      const end = DateTime.fromISO(plannedEnd ?? "", { zone: USER_TIME_ZONE });
      if (!start.isValid || !end.isValid || end <= start) {
        return NextResponse.json(
          { error: "Plan needs a real start and end time." },
          { status: 400 },
        );
      }
      if (item.relevanceScore < 8) {
        return NextResponse.json(
          { error: "Keep this as Interested. Only high-signal events go on the growth calendar." },
          { status: 409 },
        );
      }
      const saturday = saturdayEventDecision({ startsAt: start, endsAt: end, signal: "high" });
      if (!saturday.allowed) {
        return NextResponse.json({ error: saturday.reason }, { status: 409 });
      }

      const calendarInput = {
        summary: `High-signal event — ${item.title}`.slice(0, 160),
        start: start.toISO()!,
        end: end.toISO()!,
        timeZone: USER_TIME_ZONE,
        location: [item.venue, item.city].filter(Boolean).join(", ") || null,
        description: buildCeoEventDescription({
          blockType: "high_signal_event",
          externalId: `local-event:${item.id}`,
          outcome: item.whyItMatters,
          notes: item.sourceUrl ? `Source: ${item.sourceUrl}` : item.summary,
        }),
      };
      const event = item.calendarEventId
        ? await updateGoogleCalendarEvent(user.id, {
            ...calendarInput,
            eventId: item.calendarEventId,
          })
        : await createGoogleCalendarEvent(user.id, calendarInput);
      if (!event) {
        return NextResponse.json({ error: "Google Calendar did not return the event." }, { status: 502 });
      }
      data.plannedStart = start.toJSDate();
      data.plannedEnd = end.toJSDate();
      data.calendarEventId = event.id;
    }

    let activityId = item.loggedActivityId;

    if (logToGrowth && !item.loggedActivityId) {
      const today = DateTime.now().setZone(USER_TIME_ZONE).toISODate()!;
      const activity = await prisma.growthActivity.create({
        data: {
          userId: user.id,
          date: today,
          domain: themeToDomain(item.theme),
          category: "event",
          title: `Event interest: ${item.title}`.slice(0, 160),
          notes: `${item.summary}\n\nWhy it matters: ${item.whyItMatters}${
            item.city ? `\nWhere: ${item.city}` : ""
          }${item.startsOn ? `\nWhen: ${item.startsOn}` : ""}${
            item.sourceUrl ? `\nSource: ${item.sourceUrl}` : ""
          }`,
          leverage: "long_term_leverage",
          minutesSpent: 20,
          impactScore: Math.max(4, Math.min(9, item.relevanceScore)),
        },
      });
      activityId = activity.id;
      data.loggedActivityId = activity.id;
      if (!data.status) data.status = "interested";
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No updates provided" }, { status: 400 });
    }

    const updated = await prisma.localEventItem.update({
      where: { id: item.id },
      data,
    });

    return NextResponse.json({
      item: {
        id: updated.id,
        status: updated.status,
        loggedActivityId: updated.loggedActivityId,
        plannedStart: updated.plannedStart?.toISOString() ?? null,
        plannedEnd: updated.plannedEnd?.toISOString() ?? null,
        calendarEventId: updated.calendarEventId,
      },
      activityId,
    });
  } catch (error) {
    console.error("Failed to update local event item:", error);
    return NextResponse.json({ error: "Failed to update local event." }, { status: 500 });
  }
}
