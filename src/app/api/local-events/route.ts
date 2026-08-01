import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  generateLocalEventDigest,
  getLocalEventDigestForDate,
  serializeLocalEventDigest,
} from "@/lib/local-events";
import { DateTime } from "luxon";
import { USER_TIME_ZONE } from "@/lib/user-timezone";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const today = DateTime.now().setZone(USER_TIME_ZONE).toISODate()!;
    let digest = await getLocalEventDigestForDate(session.user.id, today);
    let alreadyFresh = Boolean(digest);
    let refreshed = false;

    if (!digest) {
      const result = await generateLocalEventDigest(session.user.id);
      digest = result.digest;
      refreshed = result.refreshed;
      alreadyFresh = result.alreadyFresh;
    }

    return NextResponse.json({
      digest: serializeLocalEventDigest(digest),
      refreshed,
      alreadyFresh,
    });
  } catch (error) {
    console.error("Failed to fetch local events:", error);
    return NextResponse.json({ error: "Failed to fetch local events." }, { status: 500 });
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

    const result = await generateLocalEventDigest(session.user.id, { force });

    return NextResponse.json({
      digest: serializeLocalEventDigest(result.digest),
      refreshed: result.refreshed,
      alreadyFresh: result.alreadyFresh,
    });
  } catch (error) {
    console.error("Failed to refresh local events:", error);
    return NextResponse.json({ error: "Failed to refresh local events." }, { status: 500 });
  }
}
