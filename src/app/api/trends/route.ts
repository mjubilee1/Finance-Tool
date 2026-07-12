import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  generateTrendDigest,
  getTrendDigestForDate,
  serializeTrendDigest,
} from "@/lib/trends";
import { DateTime } from "luxon";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const today = DateTime.local().toISODate()!;
    let digest = await getTrendDigestForDate(session.user.id, today);
    let alreadyFresh = Boolean(digest);
    let refreshed = false;

    if (!digest) {
      const result = await generateTrendDigest(session.user.id);
      digest = result.digest;
      refreshed = result.refreshed;
      alreadyFresh = result.alreadyFresh;
    }

    return NextResponse.json({
      digest: serializeTrendDigest(digest),
      refreshed,
      alreadyFresh,
    });
  } catch (error) {
    console.error("Failed to fetch trends:", error);
    return NextResponse.json({ error: "Failed to fetch trends." }, { status: 500 });
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

    const result = await generateTrendDigest(session.user.id, { force });

    return NextResponse.json({
      digest: serializeTrendDigest(result.digest),
      refreshed: result.refreshed,
      alreadyFresh: result.alreadyFresh,
    });
  } catch (error) {
    console.error("Failed to refresh trends:", error);
    return NextResponse.json({ error: "Failed to refresh trends." }, { status: 500 });
  }
}
