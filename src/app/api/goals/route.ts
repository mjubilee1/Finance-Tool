import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const goals = await prisma.financialGoal.findMany({
      where: { userId: session.user.id, status: "active" },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ goals });
  } catch (error) {
    console.error("Failed to fetch goals:", error);
    return NextResponse.json(
      { error: "Failed to fetch goals." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, targetAmount, targetDate, currentAmount = 0, priority = 3, type } = body;

    if (!name || !targetAmount) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const goal = await prisma.financialGoal.create({
      data: {
        userId: session.user.id,
        name,
        targetAmount: parseFloat(targetAmount),
        currentAmount: parseFloat(currentAmount),
        targetDate:
          typeof targetDate === "string" && targetDate.trim()
            ? targetDate.trim()
            : null,
        priority: parseInt(priority, 10),
        category: type,
      },
    });

    return NextResponse.json({ goal });
  } catch (error) {
    console.error("Failed to create goal:", error);
    return NextResponse.json(
      { error: "Failed to create goal." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { id, currentAmount, targetAmount, name, targetDate, priority, status } = body;

    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Missing ID" }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    if (currentAmount !== undefined) data.currentAmount = parseFloat(String(currentAmount));
    if (targetAmount !== undefined) data.targetAmount = parseFloat(String(targetAmount));
    if (typeof name === "string" && name.trim()) data.name = name.trim();
    if (typeof targetDate === "string") data.targetDate = targetDate || null;
    if (priority !== undefined) data.priority = parseInt(String(priority), 10);
    if (typeof status === "string" && ["active", "completed", "abandoned"].includes(status)) {
      data.status = status;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No updates provided" }, { status: 400 });
    }

    const updated = await prisma.financialGoal.updateMany({
      where: { id, userId: session.user.id },
      data,
    });

    if (updated.count === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update goal:", error);
    return NextResponse.json({ error: "Failed to update goal." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing ID" }, { status: 400 });
    }

    await prisma.financialGoal.update({
      where: { id, userId: session.user.id },
      data: { status: "abandoned" },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete goal:", error);
    return NextResponse.json(
      { error: "Failed to delete goal." },
      { status: 500 },
    );
  }
}
