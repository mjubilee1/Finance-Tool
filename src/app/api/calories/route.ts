import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  buildExperimentWeeks,
  computeWeeklyBudget,
  DEFAULT_DURATION_WEEKS,
  DEFAULT_MON_WED_TARGET,
  DEFAULT_THU_SUN_TARGET,
  parseIsoDate,
  serializeExperiment,
  serializeLog,
  todayIso,
  weekStartMonday,
} from "@/lib/calories";
import { prisma } from "@/lib/prisma";

async function loadActiveBundle(userId: string) {
  const experiment = await prisma.calorieExperiment.findFirst({
    where: { userId, status: "active" },
    orderBy: { createdAt: "desc" },
  });

  if (!experiment) {
    return { experiment: null, logs: [], weeks: [], today: todayIso() };
  }

  const logs = await prisma.calorieDayLog.findMany({
    where: { userId, experimentId: experiment.id },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });

  const serialized = serializeExperiment(experiment);
  const weeks = buildExperimentWeeks(
    serialized,
    logs.map((l) => ({ id: l.id, date: l.date, calories: l.calories, notes: l.notes }))
  );

  return {
    experiment: serialized,
    logs: logs.map(serializeLog),
    weeks,
    today: todayIso(),
  };
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const bundle = await loadActiveBundle(session.user.id);
    return NextResponse.json(bundle);
  } catch (error) {
    console.error("Failed to load calorie experiment:", error);
    return NextResponse.json({ error: "Failed to load calorie experiment." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const startRaw =
      typeof body.startDate === "string" && body.startDate.trim()
        ? body.startDate.trim()
        : todayIso();
    const startDt = parseIsoDate(startRaw);
    if (!startDt) {
      return NextResponse.json({ error: "Invalid start date (use YYYY-MM-DD)." }, { status: 400 });
    }

    let durationWeeks = DEFAULT_DURATION_WEEKS;
    if (body.durationWeeks != null) {
      const parsed = Number(body.durationWeeks);
      if (![3, 4].includes(parsed)) {
        return NextResponse.json({ error: "Duration must be 3 or 4 weeks." }, { status: 400 });
      }
      durationWeeks = parsed;
    }

    let monWedTarget = DEFAULT_MON_WED_TARGET;
    if (body.monWedTarget != null) {
      const parsed = Number(body.monWedTarget);
      if (!Number.isFinite(parsed) || parsed < 800 || parsed > 6000) {
        return NextResponse.json({ error: "Invalid Mon–Wed target." }, { status: 400 });
      }
      monWedTarget = Math.round(parsed);
    }

    let thuSunTarget = DEFAULT_THU_SUN_TARGET;
    if (body.thuSunTarget != null) {
      const parsed = Number(body.thuSunTarget);
      if (!Number.isFinite(parsed) || parsed < 800 || parsed > 6000) {
        return NextResponse.json({ error: "Invalid Thu–Sun target." }, { status: 400 });
      }
      thuSunTarget = Math.round(parsed);
    }

    const name =
      typeof body.name === "string" && body.name.trim()
        ? body.name.trim().slice(0, 80)
        : "Calorie experiment";
    const notes =
      typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;

    const startDate = weekStartMonday(startDt.toISODate()!).toISODate()!;
    const weeklyBudget = computeWeeklyBudget(monWedTarget, thuSunTarget);

    await prisma.calorieExperiment.updateMany({
      where: { userId: session.user.id, status: "active" },
      data: { status: "abandoned" },
    });

    const experiment = await prisma.calorieExperiment.create({
      data: {
        userId: session.user.id,
        name,
        startDate,
        durationWeeks,
        monWedTarget,
        thuSunTarget,
        weeklyBudget,
        status: "active",
        notes,
      },
    });

    const bundle = await loadActiveBundle(session.user.id);
    return NextResponse.json(
      { ...bundle, experiment: serializeExperiment(experiment) },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to start calorie experiment:", error);
    return NextResponse.json({ error: "Failed to start experiment." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const experiment = await prisma.calorieExperiment.findFirst({
      where: { userId: session.user.id, status: "active" },
      orderBy: { createdAt: "desc" },
    });
    if (!experiment) {
      return NextResponse.json({ error: "No active experiment." }, { status: 404 });
    }

    const data: {
      name?: string;
      status?: string;
      notes?: string | null;
      monWedTarget?: number;
      thuSunTarget?: number;
      weeklyBudget?: number;
      durationWeeks?: number;
    } = {};

    if (typeof body.name === "string" && body.name.trim()) {
      data.name = body.name.trim().slice(0, 80);
    }
    if (typeof body.status === "string") {
      if (!["active", "completed", "abandoned"].includes(body.status)) {
        return NextResponse.json({ error: "Invalid status." }, { status: 400 });
      }
      data.status = body.status;
    }
    if (body.notes !== undefined) {
      data.notes =
        typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;
    }
    if (body.durationWeeks != null) {
      const parsed = Number(body.durationWeeks);
      if (![3, 4].includes(parsed)) {
        return NextResponse.json({ error: "Duration must be 3 or 4 weeks." }, { status: 400 });
      }
      data.durationWeeks = parsed;
    }

    let monWed = experiment.monWedTarget;
    let thuSun = experiment.thuSunTarget;
    if (body.monWedTarget != null) {
      const parsed = Number(body.monWedTarget);
      if (!Number.isFinite(parsed) || parsed < 800 || parsed > 6000) {
        return NextResponse.json({ error: "Invalid Mon–Wed target." }, { status: 400 });
      }
      monWed = Math.round(parsed);
      data.monWedTarget = monWed;
    }
    if (body.thuSunTarget != null) {
      const parsed = Number(body.thuSunTarget);
      if (!Number.isFinite(parsed) || parsed < 800 || parsed > 6000) {
        return NextResponse.json({ error: "Invalid Thu–Sun target." }, { status: 400 });
      }
      thuSun = Math.round(parsed);
      data.thuSunTarget = thuSun;
    }
    if (data.monWedTarget != null || data.thuSunTarget != null) {
      data.weeklyBudget = computeWeeklyBudget(monWed, thuSun);
    }

    await prisma.calorieExperiment.update({
      where: { id: experiment.id },
      data,
    });

    const bundle = await loadActiveBundle(session.user.id);
    return NextResponse.json(bundle);
  } catch (error) {
    console.error("Failed to update calorie experiment:", error);
    return NextResponse.json({ error: "Failed to update experiment." }, { status: 500 });
  }
}
