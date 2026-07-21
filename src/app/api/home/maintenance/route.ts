import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  HOME_MAINTENANCE_STATUSES,
  HOME_MAINTENANCE_TYPES,
  parseIsoDate,
} from "@/lib/home";
import { getOrCreateHomeProfile } from "@/lib/home-profile";
import { prisma } from "@/lib/prisma";

const ALLOWED_TYPES = new Set(HOME_MAINTENANCE_TYPES.map((t) => t.id));
const ALLOWED_STATUSES = new Set(HOME_MAINTENANCE_STATUSES.map((s) => s.id));

function serializeLog(log: {
  id: string;
  issueType: string;
  title: string;
  status: string;
  issueDate: string;
  resolvedDate: string | null;
  cost: number | null;
  notes: string | null;
  createdAt: Date;
}) {
  return {
    id: log.id,
    issueType: log.issueType,
    title: log.title,
    status: log.status,
    issueDate: log.issueDate,
    resolvedDate: log.resolvedDate,
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

    const profile = await getOrCreateHomeProfile(session.user.id);
    const logs = await prisma.homeMaintenanceLog.findMany({
      where: { userId: session.user.id, homeProfileId: profile.id },
      orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
      take: 50,
    });

    return NextResponse.json({ logs: logs.map(serializeLog) });
  } catch (error) {
    console.error("Failed to load home maintenance:", error);
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
    const issueType = typeof body.issueType === "string" ? body.issueType.trim() : "";
    if (!ALLOWED_TYPES.has(issueType)) {
      return NextResponse.json({ error: "Invalid issue type." }, { status: 400 });
    }

    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) {
      return NextResponse.json({ error: "Title is required." }, { status: 400 });
    }

    const issueDateRaw = typeof body.issueDate === "string" ? body.issueDate : "";
    const issueDateDt = parseIsoDate(issueDateRaw);
    if (!issueDateDt) {
      return NextResponse.json({ error: "Invalid issue date (use YYYY-MM-DD)." }, { status: 400 });
    }

    const status =
      typeof body.status === "string" && ALLOWED_STATUSES.has(body.status)
        ? body.status
        : "open";

    let resolvedDate: string | null = null;
    if (body.resolvedDate !== "" && body.resolvedDate != null) {
      const dt = parseIsoDate(typeof body.resolvedDate === "string" ? body.resolvedDate : "");
      if (!dt) {
        return NextResponse.json({ error: "Invalid resolved date." }, { status: 400 });
      }
      resolvedDate = dt.toISODate();
    } else if (status === "resolved") {
      resolvedDate = issueDateDt.toISODate();
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

    const profile = await getOrCreateHomeProfile(session.user.id);
    const log = await prisma.homeMaintenanceLog.create({
      data: {
        userId: session.user.id,
        homeProfileId: profile.id,
        issueType,
        title,
        status,
        issueDate: issueDateDt.toISODate()!,
        resolvedDate,
        cost,
        notes,
      },
    });

    return NextResponse.json({ log: serializeLog(log) }, { status: 201 });
  } catch (error) {
    console.error("Failed to create home maintenance log:", error);
    return NextResponse.json({ error: "Failed to save maintenance log." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) {
      return NextResponse.json({ error: "Missing log id." }, { status: 400 });
    }

    const existing = await prisma.homeMaintenanceLog.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Log not found." }, { status: 404 });
    }

    const data: {
      status?: string;
      resolvedDate?: string | null;
      cost?: number | null;
      notes?: string | null;
      title?: string;
    } = {};

    if (body.status !== undefined) {
      if (typeof body.status !== "string" || !ALLOWED_STATUSES.has(body.status)) {
        return NextResponse.json({ error: "Invalid status." }, { status: 400 });
      }
      data.status = body.status;
      if (body.status === "resolved" && !existing.resolvedDate && body.resolvedDate == null) {
        data.resolvedDate = new Date().toISOString().slice(0, 10);
      }
    }

    if (body.resolvedDate !== undefined) {
      if (body.resolvedDate === "" || body.resolvedDate === null) {
        data.resolvedDate = null;
      } else {
        const dt = parseIsoDate(typeof body.resolvedDate === "string" ? body.resolvedDate : "");
        if (!dt) {
          return NextResponse.json({ error: "Invalid resolved date." }, { status: 400 });
        }
        data.resolvedDate = dt.toISODate();
      }
    }

    if (body.cost !== undefined) {
      if (body.cost === "" || body.cost === null) {
        data.cost = null;
      } else {
        const parsed = Number(body.cost);
        if (!Number.isFinite(parsed) || parsed < 0) {
          return NextResponse.json({ error: "Invalid cost." }, { status: 400 });
        }
        data.cost = parsed;
      }
    }

    if (body.title !== undefined) {
      if (typeof body.title !== "string" || !body.title.trim()) {
        return NextResponse.json({ error: "Invalid title." }, { status: 400 });
      }
      data.title = body.title.trim();
    }

    if (body.notes !== undefined) {
      data.notes =
        typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;
    }

    const log = await prisma.homeMaintenanceLog.update({
      where: { id },
      data,
    });

    return NextResponse.json({ log: serializeLog(log) });
  } catch (error) {
    console.error("Failed to update home maintenance:", error);
    return NextResponse.json({ error: "Failed to update maintenance log." }, { status: 500 });
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

    const existing = await prisma.homeMaintenanceLog.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Log not found." }, { status: 404 });
    }

    await prisma.homeMaintenanceLog.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to delete home maintenance:", error);
    return NextResponse.json({ error: "Failed to delete maintenance log." }, { status: 500 });
  }
}
