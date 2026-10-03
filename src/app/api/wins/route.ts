import { NextResponse } from "next/server";
import { getAppUser } from "@/lib/app-user";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { userToday } from "@/lib/user-timezone";

const winSchema = z.object({
  date: z.string().trim().max(10).optional(),
  title: z.string().trim().min(1).max(180),
  domain: z.enum([
    "career",
    "business",
    "real_estate",
    "network",
    "health",
    "financial",
    "personal",
  ]),
  impact: z.string().trim().max(1000).optional().nullable(),
});

export async function GET() {
  const user = await getAppUser();
  if (!user) {
    return NextResponse.json({ error: "App user is not configured." }, { status: 503 });
  }
  const wins = await prisma.growthWin.findMany({
    where: { userId: user.id },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 50,
  });
  return NextResponse.json({ wins });
}

export async function POST(request: Request) {
  try {
    const user = await getAppUser();
  if (!user) {
    return NextResponse.json({ error: "App user is not configured." }, { status: 503 });
  }
    const parsed = winSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Add a title and choose the area this win strengthened." },
        { status: 400 },
      );
    }
    const win = await prisma.growthWin.create({
      data: {
        userId: user.id,
        date: parsed.data.date || userToday(),
        title: parsed.data.title,
        domain: parsed.data.domain,
        impact: parsed.data.impact?.trim() || null,
      },
    });
    return NextResponse.json({ win }, { status: 201 });
  } catch (error) {
    console.error("Failed to record growth win:", error);
    return NextResponse.json({ error: "Failed to record win." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const user = await getAppUser();
  if (!user) {
    return NextResponse.json({ error: "App user is not configured." }, { status: 503 });
  }
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing win ID." }, { status: 400 });
  }
  await prisma.growthWin.deleteMany({ where: { id, userId: user.id } });
  return NextResponse.json({ success: true });
}
