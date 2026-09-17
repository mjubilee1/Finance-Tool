import { getAppUser } from "@/lib/app-user";
import { NextResponse } from "next/server";
import {
  ensureYoutubeDigestScript,
  generateDailyYoutubeDigest,
  getYoutubeDigestForDate,
  serializeYoutubeDigest,
} from "@/lib/learning-youtube";
import { DateTime } from "luxon";
import { USER_TIME_ZONE } from "@/lib/user-timezone";

export async function GET() {
  try {
    const user = await getAppUser();
    if (!user) {
      return NextResponse.json({ error: "App user is not configured." }, { status: 503 });
    }

    const today = DateTime.now().setZone(USER_TIME_ZONE).toISODate()!;
    let digestRow = await getYoutubeDigestForDate(user.id, today);

    if (!digestRow) {
      const result = await generateDailyYoutubeDigest(user.id);
      return NextResponse.json({
        digest: result.digest,
        refreshed: result.refreshed,
        alreadyFresh: result.alreadyFresh,
        autoQueued: result.autoQueued ?? false,
      });
    }

    digestRow = await ensureYoutubeDigestScript(user.id, digestRow);

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
    const user = await getAppUser();
    if (!user) {
      return NextResponse.json({ error: "App user is not configured." }, { status: 503 });
    }

    const body = await request.json().catch(() => ({}));
    const force = Boolean(body?.force);
    const result = await generateDailyYoutubeDigest(user.id, { force });

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
