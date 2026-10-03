import { NextResponse } from "next/server";
import { getAppUser } from "@/lib/app-user";
import {
  normalizeRoutineScheduleInput,
  routineItemToJson,
} from "@/lib/daily-planning";
import { prisma } from "@/lib/prisma";

async function requireUserId() {
  const user = await getAppUser();
  return user?.id ?? null;
}

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await prisma.routineScheduleItem.findMany({
    where: { userId },
    orderBy: [{ sortOrder: "asc" }, { startTime: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({
    items: items.map(routineItemToJson),
  });
}

export async function POST(request: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const input = normalizeRoutineScheduleInput(body);
    const latest = await prisma.routineScheduleItem.findFirst({
      where: { userId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const item = await prisma.routineScheduleItem.create({
      data: {
        userId,
        ...input,
        sortOrder: (latest?.sortOrder ?? 90) + 10,
      },
    });
    return NextResponse.json({ item: routineItemToJson(item) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not add schedule item.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    if (typeof body.id !== "string" || !body.id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    const existing = await prisma.routineScheduleItem.findFirst({
      where: { id: body.id, userId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Schedule item not found" }, { status: 404 });
    }

    const input = normalizeRoutineScheduleInput(body);
    const item = await prisma.routineScheduleItem.update({
      where: { id: existing.id },
      data: input,
    });
    return NextResponse.json({ item: routineItemToJson(item) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update schedule item.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const result = await prisma.routineScheduleItem.deleteMany({ where: { id, userId } });
  if (result.count === 0) {
    return NextResponse.json({ error: "Schedule item not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
