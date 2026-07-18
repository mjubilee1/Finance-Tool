import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { CAR_MAINTENANCE_TYPES, parseIsoDate } from "@/lib/car";
import { getOrCreateCarProfile } from "@/lib/car-profile";
import { prisma } from "@/lib/prisma";

const ALLOWED_TYPES = new Set(CAR_MAINTENANCE_TYPES.map((t) => t.id));

function serializeLog(log: {
  id: string;
  serviceType: string;
  serviceDate: string;
  odometerMiles: number | null;
  cost: number | null;
  notes: string | null;
  createdAt: Date;
}) {
  return {
    id: log.id,
    serviceType: log.serviceType,
    serviceDate: log.serviceDate,
    odometerMiles: log.odometerMiles,
    cost: log.cost,
    notes: log.notes,
    createdAt: log.createdAt.toISOString(),
  };
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const profile = await getOrCreateCarProfile(session.user.id);
    const logs = await prisma.carMaintenanceLog.findMany({
      where: { userId: session.user.id, carProfileId: profile.id },
      orderBy: [{ serviceDate: "desc" }, { createdAt: "desc" }],
      take: 50,
    });

    return NextResponse.json({ logs: logs.map(serializeLog) });
  } catch (error) {
    console.error("Failed to load car maintenance:", error);
    return NextResponse.json({ error: "Failed to load maintenance logs." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const serviceType = typeof body.serviceType === "string" ? body.serviceType.trim() : "";
    if (!ALLOWED_TYPES.has(serviceType)) {
      return NextResponse.json({ error: "Invalid service type." }, { status: 400 });
    }

    const serviceDateRaw = typeof body.serviceDate === "string" ? body.serviceDate : "";
    const serviceDateDt = parseIsoDate(serviceDateRaw);
    if (!serviceDateDt) {
      return NextResponse.json({ error: "Invalid service date (use YYYY-MM-DD)." }, { status: 400 });
    }

    let odometerMiles: number | null = null;
    if (body.odometerMiles !== "" && body.odometerMiles != null) {
      const parsed = Number(body.odometerMiles);
      if (!Number.isFinite(parsed) || parsed < 0) {
        return NextResponse.json({ error: "Invalid odometer miles." }, { status: 400 });
      }
      odometerMiles = parsed;
    }

    let cost: number | null = null;
    if (body.cost !== "" && body.cost != null) {
      const parsed = Number(body.cost);
      if (!Number.isFinite(parsed) || parsed < 0) {
        return NextResponse.json({ error: "Invalid cost." }, { status: 400 });
      }
      cost = parsed;
    }

    const notes =
      typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;

    const profile = await getOrCreateCarProfile(session.user.id);
    const serviceDate = serviceDateDt.toISODate()!;

    const log = await prisma.carMaintenanceLog.create({
      data: {
        userId: session.user.id,
        carProfileId: profile.id,
        serviceType,
        serviceDate,
        odometerMiles,
        cost,
        notes,
      },
    });

    // Keep the profile odometer in sync when a service reading is newer/higher.
    if (odometerMiles != null && odometerMiles >= profile.odometerMiles) {
      await prisma.carProfile.update({
        where: { id: profile.id },
        data: {
          odometerMiles,
          odometerAsOf: serviceDate,
        },
      });
    }

    return NextResponse.json({ log: serializeLog(log) }, { status: 201 });
  } catch (error) {
    console.error("Failed to create car maintenance log:", error);
    return NextResponse.json({ error: "Failed to save maintenance log." }, { status: 500 });
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
    if (!id) {
      return NextResponse.json({ error: "Missing log id." }, { status: 400 });
    }

    const existing = await prisma.carMaintenanceLog.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Log not found." }, { status: 404 });
    }

    await prisma.carMaintenanceLog.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to delete car maintenance log:", error);
    return NextResponse.json({ error: "Failed to delete maintenance log." }, { status: 500 });
  }
}
