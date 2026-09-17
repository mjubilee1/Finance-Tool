import { getAppUser } from "@/lib/app-user";
import { NextResponse } from "next/server";
import { DateTime } from "luxon";
import { prisma } from "@/lib/prisma";
import { isFinancialEventCategory } from "@/lib/financial-trends";

export async function POST(request: Request) {
  try {
    const user = await getAppUser();
    if (!user) {
      return NextResponse.json({ error: "App user is not configured." }, { status: 503 });
    }

    const body = (await request.json()) as {
      date?: string;
      title?: string;
      category?: string;
      amount?: number | string | null;
      note?: string | null;
    };

    const date = body.date?.trim() ?? "";
    const title = body.title?.trim() ?? "";
    const category = body.category?.trim() ?? "other";

    if (!DateTime.fromISO(date).isValid) {
      return NextResponse.json({ error: "date must be YYYY-MM-DD." }, { status: 400 });
    }
    if (!title) {
      return NextResponse.json({ error: "title is required." }, { status: 400 });
    }
    if (!isFinancialEventCategory(category)) {
      return NextResponse.json({ error: "Invalid category." }, { status: 400 });
    }

    let amount: number | null = null;
    if (typeof body.amount === "number") {
      amount = body.amount;
    } else if (typeof body.amount === "string" && body.amount.trim() !== "") {
      amount = Number(body.amount);
    }
    if (amount != null && !Number.isFinite(amount)) {
      return NextResponse.json({ error: "amount must be a number." }, { status: 400 });
    }

    const event = await prisma.financialEvent.create({
      data: {
        userId: user.id,
        date,
        title,
        category,
        amount,
        note: body.note?.trim() || null,
      },
    });

    return NextResponse.json({ event });
  } catch (error) {
    console.error("Failed to create financial event:", error);
    return NextResponse.json({ error: "Failed to create event." }, { status: 500 });
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
      return NextResponse.json({ error: "id is required." }, { status: 400 });
    }

    const existing = await prisma.financialEvent.findFirst({
      where: { id, userId: user.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }

    await prisma.financialEvent.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to delete financial event:", error);
    return NextResponse.json({ error: "Failed to delete event." }, { status: 500 });
  }
}
