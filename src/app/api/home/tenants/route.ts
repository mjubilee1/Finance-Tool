import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { HOME_TENANT_STATUSES, parseIsoDate } from "@/lib/home";
import { getOrCreateHomeProfile } from "@/lib/home-profile";
import { prisma } from "@/lib/prisma";

const ALLOWED_STATUSES = new Set(HOME_TENANT_STATUSES.map((s) => s.id));

function serializeTenant(tenant: {
  id: string;
  name: string;
  unitLabel: string;
  expectedRent: number;
  status: string;
  moveInDate: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: tenant.id,
    name: tenant.name,
    unitLabel: tenant.unitLabel,
    expectedRent: tenant.expectedRent,
    status: tenant.status,
    moveInDate: tenant.moveInDate,
    notes: tenant.notes,
    createdAt: tenant.createdAt.toISOString(),
    updatedAt: tenant.updatedAt.toISOString(),
  };
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const profile = await getOrCreateHomeProfile(session.user.id);
    const tenants = await prisma.homeTenant.findMany({
      where: { userId: session.user.id, homeProfileId: profile.id },
      orderBy: [{ status: "asc" }, { unitLabel: "asc" }],
    });

    return NextResponse.json({ tenants: tenants.map(serializeTenant) });
  } catch (error) {
    console.error("Failed to load home tenants:", error);
    return NextResponse.json({ error: "Failed to load tenants." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const unitLabel =
      typeof body.unitLabel === "string" ? body.unitLabel.trim() : "";
    if (!unitLabel) {
      return NextResponse.json({ error: "Unit label is required." }, { status: 400 });
    }

    const expectedRent = Number(body.expectedRent);
    if (!Number.isFinite(expectedRent) || expectedRent < 0) {
      return NextResponse.json({ error: "Invalid expected rent." }, { status: 400 });
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const status =
      typeof body.status === "string" && ALLOWED_STATUSES.has(body.status)
        ? body.status
        : "active";

    let moveInDate: string | null = null;
    if (body.moveInDate !== "" && body.moveInDate != null) {
      const dt = parseIsoDate(typeof body.moveInDate === "string" ? body.moveInDate : "");
      if (!dt) {
        return NextResponse.json({ error: "Invalid move-in date." }, { status: 400 });
      }
      moveInDate = dt.toISODate();
    }

    const notes =
      typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;

    const profile = await getOrCreateHomeProfile(session.user.id);
    const tenant = await prisma.homeTenant.create({
      data: {
        userId: session.user.id,
        homeProfileId: profile.id,
        name,
        unitLabel,
        expectedRent,
        status,
        moveInDate,
        notes,
      },
    });

    return NextResponse.json({ tenant: serializeTenant(tenant) }, { status: 201 });
  } catch (error) {
    console.error("Failed to create home tenant:", error);
    return NextResponse.json({ error: "Failed to save tenant." }, { status: 500 });
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
      return NextResponse.json({ error: "Missing tenant id." }, { status: 400 });
    }

    const existing = await prisma.homeTenant.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Tenant not found." }, { status: 404 });
    }

    const data: {
      name?: string;
      unitLabel?: string;
      expectedRent?: number;
      status?: string;
      moveInDate?: string | null;
      notes?: string | null;
    } = {};

    if (body.name !== undefined) {
      if (typeof body.name !== "string") {
        return NextResponse.json({ error: "Invalid name." }, { status: 400 });
      }
      data.name = body.name.trim();
    }

    if (body.unitLabel !== undefined) {
      if (typeof body.unitLabel !== "string" || !body.unitLabel.trim()) {
        return NextResponse.json({ error: "Invalid unit label." }, { status: 400 });
      }
      data.unitLabel = body.unitLabel.trim();
    }

    if (body.expectedRent !== undefined) {
      const expectedRent = Number(body.expectedRent);
      if (!Number.isFinite(expectedRent) || expectedRent < 0) {
        return NextResponse.json({ error: "Invalid expected rent." }, { status: 400 });
      }
      data.expectedRent = expectedRent;
    }

    if (body.status !== undefined) {
      if (typeof body.status !== "string" || !ALLOWED_STATUSES.has(body.status)) {
        return NextResponse.json({ error: "Invalid status." }, { status: 400 });
      }
      data.status = body.status;
    }

    if (body.moveInDate !== undefined) {
      if (body.moveInDate === "" || body.moveInDate === null) {
        data.moveInDate = null;
      } else {
        const dt = parseIsoDate(typeof body.moveInDate === "string" ? body.moveInDate : "");
        if (!dt) {
          return NextResponse.json({ error: "Invalid move-in date." }, { status: 400 });
        }
        data.moveInDate = dt.toISODate();
      }
    }

    if (body.notes !== undefined) {
      data.notes =
        typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;
    }

    const tenant = await prisma.homeTenant.update({
      where: { id },
      data,
    });

    return NextResponse.json({ tenant: serializeTenant(tenant) });
  } catch (error) {
    console.error("Failed to update home tenant:", error);
    return NextResponse.json({ error: "Failed to update tenant." }, { status: 500 });
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
      return NextResponse.json({ error: "Missing tenant id." }, { status: 400 });
    }

    const existing = await prisma.homeTenant.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Tenant not found." }, { status: 404 });
    }

    await prisma.homeTenant.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to delete home tenant:", error);
    return NextResponse.json({ error: "Failed to delete tenant." }, { status: 500 });
  }
}
