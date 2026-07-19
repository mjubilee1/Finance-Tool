import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { parseIsoDate, serializeLog } from "@/lib/calories";
import { prisma } from "@/lib/prisma";

export async function PUT(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const experiment = await prisma.calorieExperiment.findFirst({
      where: { userId: session.user.id, status: "active" },
      orderBy: { createdAt: "desc" },
    });
    if (!experiment) {
      return NextResponse.json({ error: "Start an experiment first." }, { status: 404 });
    }

    const body = await request.json();
    const dateRaw = typeof body.date === "string" ? body.date.trim() : "";
    const dateDt = parseIsoDate(dateRaw);
    if (!dateDt) {
      return NextResponse.json({ error: "Invalid date (use YYYY-MM-DD)." }, { status: 400 });
    }
    const date = dateDt.toISODate()!;

    const caloriesParsed = Number(body.calories);
    if (!Number.isFinite(caloriesParsed) || caloriesParsed < 0 || caloriesParsed > 12000) {
      return NextResponse.json({ error: "Calories must be between 0 and 12,000." }, { status: 400 });
    }
    const calories = Math.round(caloriesParsed);

    const notes =
      typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;

    const log = await prisma.calorieDayLog.upsert({
      where: {
        userId_date: { userId: session.user.id, date },
      },
      create: {
        userId: session.user.id,
        experimentId: experiment.id,
        date,
        calories,
        notes,
      },
      update: {
        experimentId: experiment.id,
        calories,
        notes,
      },
    });

    return NextResponse.json({ log: serializeLog(log) });
  } catch (error) {
    console.error("Failed to save calorie log:", error);
    return NextResponse.json({ error: "Failed to save calorie log." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id")?.trim();
    const date = searchParams.get("date")?.trim();

    if (!id && !date) {
      return NextResponse.json({ error: "Missing log id or date." }, { status: 400 });
    }

    const existing = await prisma.calorieDayLog.findFirst({
      where: id
        ? { id, userId: session.user.id }
        : { userId: session.user.id, date: date! },
    });
    if (!existing) {
      return NextResponse.json({ error: "Log not found." }, { status: 404 });
    }

    await prisma.calorieDayLog.delete({ where: { id: existing.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to delete calorie log:", error);
    return NextResponse.json({ error: "Failed to delete calorie log." }, { status: 500 });
  }
}
