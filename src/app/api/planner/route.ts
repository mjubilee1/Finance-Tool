import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  createPlannerItem,
  deletePlannerItem,
  isIsoDate,
  isPlannerStatus,
  reorderPlannerDay,
  setSystemBlockOverride,
  updatePlannerItem,
} from "@/lib/planner";

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const activity = await createPlannerItem(session.user.id, {
      date: body.date,
      title: body.title,
      domain: body.domain,
      notes: body.notes,
      minutesSpent:
        body.minutesSpent === "" || body.minutesSpent == null
          ? null
          : Number(body.minutesSpent),
      timeLabel: body.timeLabel,
      status: body.status,
    });

    return NextResponse.json({ item: activity });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create planner item.";
    const status = message === "Unauthorized" ? 401 : 400;
    console.error("Failed to create planner item:", error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const action = typeof body.action === "string" ? body.action : "update";

    if (action === "reorder") {
      if (!isIsoDate(body.date) || !Array.isArray(body.order)) {
        return NextResponse.json({ error: "date and order are required" }, { status: 400 });
      }
      const order = await reorderPlannerDay(session.user.id, body.date, body.order);
      return NextResponse.json({ order });
    }

    if (action === "system") {
      if (!isIsoDate(body.date) || typeof body.blockKey !== "string") {
        return NextResponse.json({ error: "date and blockKey are required" }, { status: 400 });
      }
      if (body.status != null && !isPlannerStatus(body.status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      const lyftGross =
        body.lyftGrossEarnings !== undefined && body.lyftGrossEarnings !== ""
          ? Number(body.lyftGrossEarnings)
          : undefined;
      if (lyftGross != null && (!Number.isFinite(lyftGross) || lyftGross < 0)) {
        return NextResponse.json({ error: "Invalid Lyft earnings amount" }, { status: 400 });
      }
      const override = await setSystemBlockOverride(session.user.id, body.date, body.blockKey, {
        status: body.status,
        label: body.label,
        timeLabel: body.timeLabel,
        notes: body.notes,
        lyftGrossEarnings: lyftGross,
      });
      return NextResponse.json({ override });
    }

    if (typeof body.id !== "string" || !body.id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const item = await updatePlannerItem(session.user.id, body.id, {
      title: body.title,
      domain: body.domain,
      notes: body.notes,
      minutesSpent:
        body.minutesSpent === undefined
          ? undefined
          : body.minutesSpent === "" || body.minutesSpent == null
            ? null
            : Number(body.minutesSpent),
      timeLabel: body.timeLabel,
      status: body.status,
      date: body.date,
      sortOrder: body.sortOrder,
    });

    return NextResponse.json({ item });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update planner item.";
    console.error("Failed to update planner item:", error);
    return NextResponse.json(
      { error: message },
      { status: message.includes("not found") ? 404 : 400 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing ID" }, { status: 400 });
    }

    const result = await deletePlannerItem(session.user.id, id);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete planner item.";
    console.error("Failed to delete planner item:", error);
    return NextResponse.json(
      { error: message },
      { status: message.includes("not found") ? 404 : 400 },
    );
  }
}
