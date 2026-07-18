import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TREND_ITEM_STATUSES, type TrendItemStatus } from "@/lib/trends-shared";
import { DateTime } from "luxon";

function themeToDomain(theme: string): "startup" | "career" | "personal" | "financial" {
  if (theme === "startup" || theme === "labs") return "startup";
  if (theme === "real_estate" || theme === "markets") return "financial";
  if (theme === "dmv_state") return "personal";
  return "career";
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

    const item = await prisma.trendItem.findFirst({
      where: { id, digest: { userId: session.user.id } },
      include: { digest: true },
    });
    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const data: {
      status?: TrendItemStatus;
      loggedActivityId?: string | null;
    } = {};

    if (status != null) {
      if (!(TREND_ITEM_STATUSES as readonly string[]).includes(status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      data.status = status as TrendItemStatus;
    }

    let activityId = item.loggedActivityId;

    if (logToGrowth && !item.loggedActivityId) {
      const today = DateTime.local().toISODate()!;
      const activity = await prisma.growthActivity.create({
        data: {
          userId: session.user.id,
          date: today,
          domain: themeToDomain(item.theme),
          category: "learning",
          title: `Trend note: ${item.title}`.slice(0, 160),
          notes: `${item.summary}\n\nWhy it matters: ${item.whyItMatters}${
            item.sourceUrl ? `\nSource: ${item.sourceUrl}` : ""
          }`,
          leverage: "long_term_leverage",
          minutesSpent: 15,
          impactScore: Math.max(4, Math.min(8, item.relevanceScore)),
        },
      });
      activityId = activity.id;
      data.loggedActivityId = activity.id;
      data.status = "noted";
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No updates provided" }, { status: 400 });
    }

    const updated = await prisma.trendItem.update({
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
    console.error("Failed to update trend item:", error);
    return NextResponse.json({ error: "Failed to update trend item." }, { status: 500 });
  }
}
