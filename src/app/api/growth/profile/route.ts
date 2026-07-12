import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalNumber(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function joyOptionsFrom(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/,|\n/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 12);
  }
  return [];
}

export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const data = {
      promotionTarget: optionalString(body.promotionTarget),
      promotionDeadline: optionalString(body.promotionDeadline),
      promotionUpsideAnnual: optionalNumber(body.promotionUpsideAnnual),
      currentWeight: optionalNumber(body.currentWeight),
      targetWeight: optionalNumber(body.targetWeight),
      fitnessGoal: optionalString(body.fitnessGoal),
      lyftHourlyNet: optionalNumber(body.lyftHourlyNet),
      joyOptions: joyOptionsFrom(body.joyOptions),
      notes: optionalString(body.notes),
    };

    const profile = await prisma.lifeLeverageProfile.upsert({
      where: { userId: session.user.id },
      create: { userId: session.user.id, ...data },
      update: data,
    });

    return NextResponse.json({ profile });
  } catch (error) {
    console.error("Failed to save life leverage profile:", error);
    return NextResponse.json({ error: "Failed to save profile." }, { status: 500 });
  }
}
