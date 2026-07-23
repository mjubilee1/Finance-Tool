import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  generateDailyYoutubeDigest,
  getYoutubeDigestForDate,
  serializeYoutubeDigest,
} from "@/lib/learning-youtube";
import { DateTime } from "luxon";
import { USER_TIME_ZONE } from "@/lib/user-timezone";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const today = DateTime.now().setZone(USER_TIME_ZONE).toISODate()!;
    const digestRow = await getYoutubeDigestForDate(session.user.id, today);

    if (!digestRow) {
      const result = await generateDailyYoutubeDigest(session.user.id);
      return NextResponse.json({
        digest: result.digest,
        refreshed: result.refreshed,
        alreadyFresh: result.alreadyFresh,
        autoQueued: result.autoQueued ?? false,
      });
    }

    return NextResponse.json({
      digest: serializeYoutubeDigest(digestRow),
      refreshed: false,
      alreadyFresh: true,
      autoQueued: digestRow.autoQueued,
    });
  } catch (error) {
    console.error("Failed to load YouTube learning digest:", error);
    return NextResponse.json(
      { error: "Failed to load daily YouTube picks." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const force = Boolean(body?.force);
    const result = await generateDailyYoutubeDigest(session.user.id, { force });

    return NextResponse.json({
      digest: result.digest,
      refreshed: result.refreshed,
      alreadyFresh: result.alreadyFresh,
      autoQueued: result.autoQueued ?? false,
    });
  } catch (error) {
    console.error("Failed to refresh YouTube learning digest:", error);
    return NextResponse.json(
      { error: "Failed to refresh daily YouTube picks." },
      { status: 500 }
    );
  }
}
