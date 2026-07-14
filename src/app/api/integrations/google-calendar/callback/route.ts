import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import {
  exchangeGoogleCalendarCode,
  getGoogleCalendarRedirectUri,
  GOOGLE_CALENDAR_OAUTH_STATE_COOKIE,
  saveGoogleCalendarConnection,
} from "@/lib/google-calendar";

function appRedirect(request: NextRequest, status: "connected" | "error") {
  const url = new URL("/", request.url);
  url.searchParams.set("google_calendar", status);
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
  const expectedState = request.cookies.get(GOOGLE_CALENDAR_OAUTH_STATE_COOKIE)?.value;
  if (!state || !expectedState || state !== expectedState) {
    return appRedirect(request, "error");
  }

  const code = request.nextUrl.searchParams.get("code");
  const oauthError = request.nextUrl.searchParams.get("error");
  if (!code || oauthError) {
    return appRedirect(request, "error");
  }

  try {
    const redirectUri = getGoogleCalendarRedirectUri(request);
    const token = await exchangeGoogleCalendarCode(code, redirectUri);
    await saveGoogleCalendarConnection(session.user.id, token);
    return appRedirect(request, "connected");
  } catch {
    return appRedirect(request, "error");
  }
}
