import { getAppUser } from "@/lib/app-user";
import { NextResponse } from "next/server";
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
    const user = await getAppUser();
    if (!user) {
      return NextResponse.json({ error: "App user is not configured." }, { status: 503 });
    }

    const body = await request.json();
    const data = {
      promotionTarget: optionalString(body.promotionTarget),
      promotionDeadline: optionalString(body.promotionDeadline),
      promotionUpsideAnnual: optionalNumber(body.promotionUpsideAnnual),
      currentWeight: optionalNumber(body.currentWeight),
      targetWeight: optionalNumber(body.targetWeight),
      fitnessGoal: optionalString(body.fitnessGoal),
      joyOptions: joyOptionsFrom(body.joyOptions),
      notes: optionalString(body.notes),
    };

    const profile = await prisma.lifeLeverageProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...data },
      update: data,
    });

    return NextResponse.json({ profile });
  } catch (error) {
    console.error("Failed to save life leverage profile:", error);
    return NextResponse.json({ error: "Failed to save profile." }, { status: 500 });
  }
}
