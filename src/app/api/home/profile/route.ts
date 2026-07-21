import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { parseIsoDate } from "@/lib/home";
import { getOrCreateHomeProfile } from "@/lib/home-profile";
import { prisma } from "@/lib/prisma";

function optionalNumber(value: unknown) {
  if (value === "" || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
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

function optionalString(value: unknown) {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function serializeProfile(profile: Awaited<ReturnType<typeof getOrCreateHomeProfile>>) {
  return {
    id: profile.id,
    mortgageMonthly: profile.mortgageMonthly,
    mortgageNextDue: profile.mortgageNextDue,
    propertyLabel: profile.propertyLabel,
    notes: profile.notes,
  };
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const profile = await getOrCreateHomeProfile(session.user.id);
    return NextResponse.json({ profile: serializeProfile(profile) });
  } catch (error) {
    console.error("Failed to load home profile:", error);
    return NextResponse.json({ error: "Failed to load home profile." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const mortgageMonthly = optionalNumber(body.mortgageMonthly);
    const mortgageNextDue = optionalDate(body.mortgageNextDue);
    const propertyLabel = optionalString(body.propertyLabel);
    const notes = optionalNotes(body.notes);

    if (mortgageMonthly === null) {
      return NextResponse.json({ error: "Invalid mortgage amount." }, { status: 400 });
    }
    if (mortgageNextDue === null) {
      return NextResponse.json({ error: "Invalid due date (use YYYY-MM-DD)." }, { status: 400 });
    }
    if (propertyLabel === null) {
      return NextResponse.json({ error: "Invalid property label." }, { status: 400 });
    }

    await getOrCreateHomeProfile(session.user.id);

    const data: {
      mortgageMonthly?: number;
      mortgageNextDue?: string;
      propertyLabel?: string;
      notes?: string | null;
    } = {};

    if (mortgageMonthly !== undefined) data.mortgageMonthly = mortgageMonthly;
    if (mortgageNextDue !== undefined) data.mortgageNextDue = mortgageNextDue;
    if (propertyLabel !== undefined) data.propertyLabel = propertyLabel;
    if (notes !== undefined) data.notes = notes;

    const profile = await prisma.homeProfile.update({
      where: { userId: session.user.id },
      data,
    });

    return NextResponse.json({
      profile: serializeProfile({
        id: profile.id,
        mortgageMonthly: profile.mortgageMonthly,
        mortgageNextDue: profile.mortgageNextDue,
        propertyLabel: profile.propertyLabel,
        notes: profile.notes,
      }),
    });
  } catch (error) {
    console.error("Failed to save home profile:", error);
    return NextResponse.json({ error: "Failed to save home profile." }, { status: 500 });
  }
}
