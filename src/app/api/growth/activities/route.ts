import { getAppUser } from "@/lib/app-user";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { GROWTH_DOMAINS } from "@/lib/growth-agent";
import { applyMentionsToActivityText } from "@/lib/growth-calendar-sync";

export async function GET() {
  try {
    const user = await getAppUser();
    if (!user) {
      return NextResponse.json({ error: "App user is not configured." }, { status: 503 });
    }

    const activities = await prisma.growthActivity.findMany({
      where: { userId: user.id },
      orderBy: { date: "desc" },
      take: 50,
    });

    return NextResponse.json({ activities });
  } catch (error) {
    console.error("Failed to fetch growth activities:", error);
    return NextResponse.json({ error: "Failed to fetch activities." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAppUser();
    if (!user) {
      return NextResponse.json({ error: "App user is not configured." }, { status: 503 });
    }

    const body = await request.json();
    const {
      date,
      domain,
      category,
      title,
      notes,
      leverage = "long_term_leverage",
      minutesSpent,
      impactScore = 5,
    } = body;

    if (!date || !domain || !category || !title) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (!(GROWTH_DOMAINS as readonly string[]).includes(domain)) {
      return NextResponse.json({ error: "Invalid domain" }, { status: 400 });
    }

    const activity = await prisma.growthActivity.create({
      data: {
        userId: user.id,
        date,
        domain,
        category,
        title,
        notes: notes || null,
        leverage:
          leverage === "immediate_income" ? "immediate_income" : "long_term_leverage",
        minutesSpent: minutesSpent ? parseInt(String(minutesSpent), 10) : null,
        impactScore: Math.max(1, Math.min(10, parseFloat(String(impactScore)) || 5)),
      },
    });

    const mentionText = `${title} ${notes ?? ""}`;
    const linkedPeople = await applyMentionsToActivityText(
      user.id,
      mentionText,
      date,
      title,
    );

    return NextResponse.json({
      activity,
      linkedPeople,
    });
  } catch (error) {
    console.error("Failed to create growth activity:", error);
    return NextResponse.json({ error: "Failed to create activity." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getAppUser();
    if (!user) {
      return NextResponse.json({ error: "App user is not configured." }, { status: 503 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing ID" }, { status: 400 });
    }

    await prisma.growthActivity.deleteMany({
      where: { id, userId: user.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete growth activity:", error);
    return NextResponse.json({ error: "Failed to delete activity." }, { status: 500 });
  }
}
