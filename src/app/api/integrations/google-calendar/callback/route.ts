import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import {
  exchangeGoogleCalendarCode,
  getGoogleCalendarRedirectUri,
  GOOGLE_CALENDAR_OAUTH_STATE_COOKIE,
  saveGoogleCalendarConnection,
  verifyGoogleCalendarOAuthState,
} from "@/lib/google-calendar";

function appRedirect(
  request: NextRequest,
  status: "connected" | "error",
  reason?: string,
) {
  const url = new URL("/", request.url);
  url.searchParams.set("google_calendar", status);
  if (reason) {
    url.searchParams.set("google_calendar_reason", reason);
  }
  const response = NextResponse.redirect(url);
  response.cookies.delete(GOOGLE_CALENDAR_OAUTH_STATE_COOKIE);
  return response;
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const state = request.nextUrl.searchParams.get("state");
  const cookieState = request.cookies.get(GOOGLE_CALENDAR_OAUTH_STATE_COOKIE)?.value;
  const stateValid =
    verifyGoogleCalendarOAuthState(state) ||
    Boolean(state && cookieState && state === cookieState);

  if (!stateValid) {
    return appRedirect(request, "error", "state");
  }

  const code = request.nextUrl.searchParams.get("code");
  const oauthError = request.nextUrl.searchParams.get("error");
  if (!code || oauthError) {
    return appRedirect(request, "error", oauthError ? "denied" : "code");
  }

  try {
    const redirectUri = getGoogleCalendarRedirectUri(request);
    const token = await exchangeGoogleCalendarCode(code, redirectUri);
    await saveGoogleCalendarConnection(session.user.id, token);
    return appRedirect(request, "connected");
  } catch (error) {
    const message = error instanceof Error ? error.message : "exchange";
    console.error("Google Calendar callback failed:", message);
    return appRedirect(request, "error", "exchange");
  }
}
