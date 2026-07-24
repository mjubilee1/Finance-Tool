import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { queueYoutubePicks, recordLearningVideoWatched } from "@/lib/learning-youtube";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const pickIds = Array.isArray(body?.pickIds)
      ? body.pickIds.filter((id: unknown): id is string => typeof id === "string")
      : undefined;

    const result = await queueYoutubePicks(session.user.id, pickIds);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to queue YouTube picks:", error);
    return NextResponse.json({ error: "Failed to queue YouTube picks." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) {
      return NextResponse.json({ error: "Pick id is required." }, { status: 400 });
    }

    const pick = await prisma.learningYoutubePick.findFirst({
      where: { id, digest: { userId: session.user.id } },
    });
    if (!pick) {
      return NextResponse.json({ error: "Pick not found." }, { status: 404 });
    }

    const status = typeof body.status === "string" ? body.status : "";
    if (!["suggested", "queued", "skipped", "played"].includes(status)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }

    if (status === "played") {
      await recordLearningVideoWatched(session.user.id, {
        videoId: pick.videoId,
        title: pick.title,
        queueItemId: pick.queuedItemId,
        pickId: pick.id,
      });
      const updated = await prisma.learningYoutubePick.findUnique({ where: { id: pick.id } });
      return NextResponse.json({ pick: updated });
    }

    const updated = await prisma.learningYoutubePick.update({
      where: { id: pick.id },
      data: { status },
    });

    return NextResponse.json({ pick: updated });
  } catch (error) {
    console.error("Failed to update YouTube pick:", error);
    return NextResponse.json({ error: "Failed to update pick." }, { status: 500 });
  }
}
