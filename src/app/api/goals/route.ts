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
        targetDate, // Format YYYY-MM-DD
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
