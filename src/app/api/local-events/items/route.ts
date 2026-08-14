import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  LOCAL_EVENT_STATUSES,
  type LocalEventStatus,
} from "@/lib/local-events-shared";
import { DateTime } from "luxon";
import { USER_TIME_ZONE } from "@/lib/user-timezone";

function themeToDomain(
  theme: string
): "social" | "startup" | "career" | "fitness" | "personal" | "financial" {
  if (theme === "networking" || theme === "culture_social" || theme === "festival" || theme === "music_arts") {
    return "social";
  }
  if (theme === "founder_startup") return "startup";
  if (theme === "learning_skill") return "career";
  if (theme === "fitness_body") return "fitness";
  if (theme === "real_estate_housing") return "financial";
  return "personal";
}

export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { id, status, logToGrowth } = body as {
      id?: string;
      status?: string;
      logToGrowth?: boolean;
    };

    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const item = await prisma.localEventItem.findFirst({
      where: { id, digest: { userId: session.user.id } },
      include: { digest: true },
    });
    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const data: {
      status?: LocalEventStatus;
      loggedActivityId?: string | null;
    } = {};

    if (status != null) {
      if (!(LOCAL_EVENT_STATUSES as readonly string[]).includes(status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      data.status = status as LocalEventStatus;
    }

    let activityId = item.loggedActivityId;

    if (logToGrowth && !item.loggedActivityId) {
      const today = DateTime.now().setZone(USER_TIME_ZONE).toISODate()!;
      const activity = await prisma.growthActivity.create({
        data: {
          userId: session.user.id,
          date: today,
          domain: themeToDomain(item.theme),
          category: "event",
          title: `Event interest: ${item.title}`.slice(0, 160),
          notes: `${item.summary}\n\nWhy it matters: ${item.whyItMatters}${
            item.city ? `\nWhere: ${item.city}` : ""
          }${item.startsOn ? `\nWhen: ${item.startsOn}` : ""}${
            item.sourceUrl ? `\nSource: ${item.sourceUrl}` : ""
          }`,
          leverage: "long_term_leverage",
          minutesSpent: 20,
          impactScore: Math.max(4, Math.min(9, item.relevanceScore)),
        },
      });
      activityId = activity.id;
      data.loggedActivityId = activity.id;
      if (!data.status) data.status = "interested";
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No updates provided" }, { status: 400 });
    }

    const updated = await prisma.localEventItem.update({
      where: { id: item.id },
      data,
    });

    return NextResponse.json({
      item: {
        id: updated.id,
        status: updated.status,
        loggedActivityId: updated.loggedActivityId,
      },
      activityId,
    });
  } catch (error) {
    console.error("Failed to update local event item:", error);
    return NextResponse.json({ error: "Failed to update local event." }, { status: 500 });
  }
}
