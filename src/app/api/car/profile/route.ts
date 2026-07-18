import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { parseIsoDate } from "@/lib/car";
import { getOrCreateCarProfile } from "@/lib/car-profile";
import { prisma } from "@/lib/prisma";

function optionalNumber(value: unknown) {
  if (value === "" || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function optionalInt(value: unknown) {
  if (value === "" || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 && Number.isInteger(parsed) ? parsed : null;
}

function optionalDate(value: unknown) {
  if (value === "" || value === null || value === undefined) return undefined;
  if (typeof value !== "string") return null;
  const dt = parseIsoDate(value);
  return dt ? dt.toISODate()! : null;
}

function optionalNotes(value: unknown) {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function serializeProfile(profile: Awaited<ReturnType<typeof getOrCreateCarProfile>>) {
  return {
    id: profile.id,
    paymentMonthly: profile.paymentMonthly,
    paymentNextDue: profile.paymentNextDue,
    insuranceMonthly: profile.insuranceMonthly,
    insuranceNextDue: profile.insuranceNextDue,
    loanAmount: profile.loanAmount,
    loanBalance: profile.loanBalance,
    loanTermMonths: profile.loanTermMonths,
    loanStartDate: profile.loanStartDate,
    payoffTargetMonthly: profile.payoffTargetMonthly,
    startOdometerMiles: profile.startOdometerMiles,
    odometerMiles: profile.odometerMiles,
    odometerAsOf: profile.odometerAsOf,
    notes: profile.notes,
  };
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const profile = await getOrCreateCarProfile(session.user.id);
    return NextResponse.json({ profile: serializeProfile(profile) });
  } catch (error) {
    console.error("Failed to load car profile:", error);
    return NextResponse.json({ error: "Failed to load car profile." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const paymentMonthly = optionalNumber(body.paymentMonthly);
    const insuranceMonthly = optionalNumber(body.insuranceMonthly);
    const paymentNextDue = optionalDate(body.paymentNextDue);
    const insuranceNextDue = optionalDate(body.insuranceNextDue);
    const loanAmount = optionalNumber(body.loanAmount);
    const loanBalance = optionalNumber(body.loanBalance);
    const loanTermMonths = optionalInt(body.loanTermMonths);
    const loanStartDate = optionalDate(body.loanStartDate);
    const payoffTargetMonthly = optionalNumber(body.payoffTargetMonthly);
    const startOdometerMiles = optionalNumber(body.startOdometerMiles);
    const odometerMiles = optionalNumber(body.odometerMiles);
    const odometerAsOf = optionalDate(body.odometerAsOf);
    const notes = optionalNotes(body.notes);

    if (
      paymentMonthly === null ||
      insuranceMonthly === null ||
      loanAmount === null ||
      loanBalance === null ||
      payoffTargetMonthly === null ||
      startOdometerMiles === null ||
      odometerMiles === null
    ) {
      return NextResponse.json({ error: "Invalid amount." }, { status: 400 });
    }
    if (loanTermMonths === null) {
      return NextResponse.json({ error: "Invalid loan term (whole months ≥ 1)." }, { status: 400 });
    }
    if (
      paymentNextDue === null ||
      insuranceNextDue === null ||
      loanStartDate === null ||
      odometerAsOf === null
    ) {
      return NextResponse.json({ error: "Invalid due date (use YYYY-MM-DD)." }, { status: 400 });
    }

    await getOrCreateCarProfile(session.user.id);

    const data: {
      paymentMonthly?: number;
      insuranceMonthly?: number;
      paymentNextDue?: string;
      insuranceNextDue?: string;
      loanAmount?: number;
      loanBalance?: number;
      loanTermMonths?: number;
      loanStartDate?: string;
      payoffTargetMonthly?: number;
      startOdometerMiles?: number;
      odometerMiles?: number;
      odometerAsOf?: string;
      notes?: string | null;
    } = {};

    if (paymentMonthly !== undefined) data.paymentMonthly = paymentMonthly;
    if (insuranceMonthly !== undefined) data.insuranceMonthly = insuranceMonthly;
    if (paymentNextDue !== undefined) data.paymentNextDue = paymentNextDue;
    if (insuranceNextDue !== undefined) data.insuranceNextDue = insuranceNextDue;
    if (loanAmount !== undefined) data.loanAmount = loanAmount;
    if (loanBalance !== undefined) data.loanBalance = loanBalance;
    if (loanTermMonths !== undefined) data.loanTermMonths = loanTermMonths;
    if (loanStartDate !== undefined) data.loanStartDate = loanStartDate;
    if (payoffTargetMonthly !== undefined) data.payoffTargetMonthly = payoffTargetMonthly;
    if (startOdometerMiles !== undefined) data.startOdometerMiles = startOdometerMiles;
    if (odometerMiles !== undefined) data.odometerMiles = odometerMiles;
    if (odometerAsOf !== undefined) data.odometerAsOf = odometerAsOf;
    if (notes !== undefined) data.notes = notes;

    const profile = await prisma.carProfile.update({
      where: { userId: session.user.id },
      data,
    });

    return NextResponse.json({
      profile: serializeProfile({
        id: profile.id,
        paymentMonthly: profile.paymentMonthly,
        paymentNextDue: profile.paymentNextDue,
        insuranceMonthly: profile.insuranceMonthly,
        insuranceNextDue: profile.insuranceNextDue,
        loanAmount: profile.loanAmount,
        loanBalance: profile.loanBalance,
        loanTermMonths: profile.loanTermMonths,
        loanStartDate: profile.loanStartDate,
        payoffTargetMonthly: profile.payoffTargetMonthly,
        startOdometerMiles: profile.startOdometerMiles,
        odometerMiles: profile.odometerMiles,
        odometerAsOf: profile.odometerAsOf,
        notes: profile.notes,
      }),
    });
  } catch (error) {
    console.error("Failed to save car profile:", error);
    return NextResponse.json({ error: "Failed to save car profile." }, { status: 500 });
  }
}
