import { DateTime } from "luxon";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { userNow } from "@/lib/user-timezone";
import {
  disconnectGoogleCalendar,
  fetchUpcomingGoogleCalendarEvents,
  getGoogleCalendarStatus,
} from "@/lib/google-calendar";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = userNow();
  const endOfDay = now.endOf("day");

  try {
    const calendar = await fetchUpcomingGoogleCalendarEvents(session.user.id, {
      timeMin: now.toJSDate(),
      timeMax: endOfDay.toJSDate(),
      maxResults: 8,
    });

    return NextResponse.json(calendar);
  } catch (error) {
    const status = await getGoogleCalendarStatus(session.user.id);
    return NextResponse.json({
      ...status,
      events: [],
      error: error instanceof Error ? error.message : "Could not load Google Calendar.",
    });
  }
}

export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await disconnectGoogleCalendar(session.user.id);
  return NextResponse.json({ connected: false, status: "not_connected" });
}
