import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { parseIsoDate } from "@/lib/home";
import { getOrCreateHomeProfile } from "@/lib/home-profile";
import { prisma } from "@/lib/prisma";

function serializePayment(payment: {
  id: string;
  tenantId: string | null;
  amount: number;
  paidOn: string;
  periodLabel: string | null;
  notes: string | null;
  createdAt: Date;
  tenant?: {
    id: string;
    name: string;
    unitLabel: string;
  } | null;
}) {
  return {
    id: payment.id,
    tenantId: payment.tenantId,
    amount: payment.amount,
    paidOn: payment.paidOn,
    periodLabel: payment.periodLabel,
    notes: payment.notes,
    createdAt: payment.createdAt.toISOString(),
    tenant: payment.tenant
      ? {
          id: payment.tenant.id,
          name: payment.tenant.name,
          unitLabel: payment.tenant.unitLabel,
        }
      : null,
  };
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const profile = await getOrCreateHomeProfile(session.user.id);
    const payments = await prisma.homeRentPayment.findMany({
      where: { userId: session.user.id, homeProfileId: profile.id },
      include: {
        tenant: { select: { id: true, name: true, unitLabel: true } },
      },
      orderBy: [{ paidOn: "desc" }, { createdAt: "desc" }],
      take: 100,
    });

    return NextResponse.json({ payments: payments.map(serializePayment) });
  } catch (error) {
    console.error("Failed to load rent payments:", error);
    return NextResponse.json({ error: "Failed to load rent payments." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Invalid amount." }, { status: 400 });
    }

    const paidOnRaw = typeof body.paidOn === "string" ? body.paidOn : "";
    const paidOnDt = parseIsoDate(paidOnRaw);
    if (!paidOnDt) {
      return NextResponse.json({ error: "Invalid payment date (use YYYY-MM-DD)." }, { status: 400 });
    }

    let tenantId: string | null = null;
    if (body.tenantId !== "" && body.tenantId != null) {
      if (typeof body.tenantId !== "string") {
        return NextResponse.json({ error: "Invalid tenant." }, { status: 400 });
      }
      const tenant = await prisma.homeTenant.findFirst({
        where: { id: body.tenantId, userId: session.user.id },
      });
      if (!tenant) {
        return NextResponse.json({ error: "Tenant not found." }, { status: 404 });
      }
      tenantId = tenant.id;
    }

    const periodLabel =
      typeof body.periodLabel === "string" && body.periodLabel.trim()
        ? body.periodLabel.trim()
        : null;
    const notes =
      typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;

    const profile = await getOrCreateHomeProfile(session.user.id);
    const payment = await prisma.homeRentPayment.create({
      data: {
        userId: session.user.id,
        homeProfileId: profile.id,
        tenantId,
        amount,
        paidOn: paidOnDt.toISODate()!,
        periodLabel,
        notes,
      },
      include: {
        tenant: { select: { id: true, name: true, unitLabel: true } },
      },
    });

    return NextResponse.json({ payment: serializePayment(payment) }, { status: 201 });
  } catch (error) {
    console.error("Failed to create rent payment:", error);
    return NextResponse.json({ error: "Failed to save rent payment." }, { status: 500 });
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
      return NextResponse.json({ error: "Missing payment id." }, { status: 400 });
    }

    const existing = await prisma.homeRentPayment.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Payment not found." }, { status: 404 });
    }

    await prisma.homeRentPayment.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to delete rent payment:", error);
    return NextResponse.json({ error: "Failed to delete rent payment." }, { status: 500 });
  }
}
