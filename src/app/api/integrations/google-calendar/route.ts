import { getAppUser } from "@/lib/app-user";
import { DateTime } from "luxon";
import { NextResponse } from "next/server";
import { userNow } from "@/lib/user-timezone";
import {
  disconnectGoogleCalendar,
  fetchUpcomingGoogleCalendarEvents,
  getGoogleCalendarStatus,
} from "@/lib/google-calendar";

export async function GET() {
  const user = await getAppUser();
  if (!user) {
    return NextResponse.json({ error: "App user is not configured." }, { status: 503 });
  }

  const now = userNow();
  const endOfDay = now.endOf("day");

  try {
    const calendar = await fetchUpcomingGoogleCalendarEvents(user.id, {
      timeMin: now.toJSDate(),
      timeMax: endOfDay.toJSDate(),
      maxResults: 8,
    });

    return NextResponse.json(calendar);
  } catch (error) {
    const status = await getGoogleCalendarStatus(user.id);
    return NextResponse.json({
      ...status,
      events: [],
      error: error instanceof Error ? error.message : "Could not load Google Calendar.",
    });
  }
}

export async function DELETE() {
  const user = await getAppUser();
  if (!user) {
    return NextResponse.json({ error: "App user is not configured." }, { status: 503 });
  }

  await disconnectGoogleCalendar(user.id);
  return NextResponse.json({ connected: false, status: "not_connected" });
}
