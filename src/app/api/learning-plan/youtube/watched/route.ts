import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { recordLearningVideoWatched } from "@/lib/learning-youtube";

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const videoId = typeof body.videoId === "string" ? body.videoId.trim() : "";
    if (!videoId) {
      return NextResponse.json({ error: "videoId is required." }, { status: 400 });
    }

    const result = await recordLearningVideoWatched(session.user.id, {
      videoId,
      title: typeof body.title === "string" ? body.title : null,
      queueItemId: typeof body.queueItemId === "string" ? body.queueItemId : null,
      pickId: typeof body.pickId === "string" ? body.pickId : null,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Failed to record watched YouTube video:", error);
    return NextResponse.json({ error: "Failed to record watched video." }, { status: 500 });
  }
}
