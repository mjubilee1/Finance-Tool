import { getAppUser } from "@/lib/app-user";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  buildGoogleDriveAuthUrl,
  createGoogleDriveOAuthState,
  disconnectGoogleDrive,
  getGoogleDriveRedirectUri,
  getGoogleDriveStatus,
  GOOGLE_DRIVE_OAUTH_STATE_COOKIE,
} from "@/lib/google-drive";

export async function GET(request: Request) {
  const user = await getAppUser();
  if (!user) {
    return NextResponse.json(
      { error: "App user is not configured." },
      { status: 503 },
    );
  }

  try {
    const existing = await prisma.googleDriveConnection.findUnique({
      where: { userId: user.id },
    });
    const hasUsableRefresh =
      Boolean(existing?.encryptedRefreshToken) && existing?.status !== "needs_reconnect";

    const driveStatus = await getGoogleDriveStatus(user.id);
    if (driveStatus.status === "needs_reconnect") {
      await disconnectGoogleDrive(user.id);
    }

    const state = createGoogleDriveOAuthState();
    const redirectUri = getGoogleDriveRedirectUri(request);
    const forceConsent =
      driveStatus.status === "needs_reconnect" ||
      driveStatus.status === "not_connected" ||
      !hasUsableRefresh;
    const authUrl = buildGoogleDriveAuthUrl(state, redirectUri, { forceConsent });
    const response = NextResponse.redirect(authUrl);

    response.cookies.set(GOOGLE_DRIVE_OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 10 * 60,
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not start Google Drive connection." },
      { status: 500 },
    );
  }
}
