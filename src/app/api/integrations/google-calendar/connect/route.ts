import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import {
  buildGoogleCalendarAuthUrl,
  createGoogleCalendarOAuthState,
  disconnectGoogleCalendar,
  getGoogleCalendarRedirectUri,
  getGoogleCalendarStatus,
  GOOGLE_CALENDAR_OAUTH_STATE_COOKIE,
} from "@/lib/google-calendar";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set(
      "callbackUrl",
      "/api/integrations/google-calendar/connect",
    );
    return NextResponse.redirect(loginUrl);
  }

  try {
    const calendarStatus = await getGoogleCalendarStatus(session.user.id);
    if (calendarStatus.status === "needs_reconnect") {
      // Wipe stale tokens so Google issues a fresh refresh token on re-approval.
      await disconnectGoogleCalendar(session.user.id);
    }

    const state = createGoogleCalendarOAuthState();
    const redirectUri = getGoogleCalendarRedirectUri(request);
    const authUrl = buildGoogleCalendarAuthUrl(state, redirectUri);
    const response = NextResponse.redirect(authUrl);

    response.cookies.set(GOOGLE_CALENDAR_OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 10 * 60,
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not start Google Calendar connection." },
      { status: 500 },
    );
  }
}
