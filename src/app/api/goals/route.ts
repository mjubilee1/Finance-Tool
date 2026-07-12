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
    const {
      name,
      targetAmount,
      targetDate,
      currentAmount = 0,
      priority = 3,
      type,
      monthlyContribution,
    } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const category =
      typeof type === "string" && type.trim() ? type.trim() : "savings";
    const isLifeGoal = !["savings", "debt_payoff"].includes(category);

    // Life goals track progress 0–100; money goals need a dollar target.
    if (!isLifeGoal && (targetAmount === undefined || targetAmount === "" || Number(targetAmount) <= 0)) {
      return NextResponse.json({ error: "Money goals need a target amount" }, { status: 400 });
    }

    const parsedMonthly =
      monthlyContribution === undefined || monthlyContribution === null || monthlyContribution === ""
        ? null
        : Number(monthlyContribution);
    const safeMonthly =
      parsedMonthly != null && Number.isFinite(parsedMonthly) && parsedMonthly > 0
        ? Math.round(parsedMonthly * 100) / 100
        : null;

    const parsedTarget = isLifeGoal
      ? 100
      : parseFloat(String(targetAmount));
    let parsedCurrent = isLifeGoal
      ? Math.min(100, Math.max(0, parseFloat(String(currentAmount)) || 0))
      : parseFloat(String(currentAmount)) || 0;

    // Seed first month of a planned redirect so the goal isn't stuck at $0.
    if (!isLifeGoal && parsedCurrent <= 0 && safeMonthly != null) {
      parsedCurrent = safeMonthly;
    }

    const goal = await prisma.financialGoal.create({
      data: {
        userId: session.user.id,
        name: name.trim(),
        targetAmount: parsedTarget,
        currentAmount: parsedCurrent,
        monthlyContribution: safeMonthly,
        targetDate:
          typeof targetDate === "string" && targetDate.trim()
            ? targetDate.trim()
            : null,
        priority: parseInt(String(priority), 10),
        category,
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
    const {
      id,
      currentAmount,
      targetAmount,
      name,
      targetDate,
      priority,
      status,
      monthlyContribution,
      addAmount,
      type,
      category,
    } = body;

    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Missing ID" }, { status: 400 });
    }

    const existing = await prisma.financialGoal.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (addAmount !== undefined && addAmount !== null && addAmount !== "") {
      const add = Number(addAmount);
      if (!Number.isFinite(add) || add === 0) {
        return NextResponse.json({ error: "Invalid addAmount" }, { status: 400 });
      }
      data.currentAmount = Math.round((existing.currentAmount + add) * 100) / 100;
    } else if (currentAmount !== undefined) {
      data.currentAmount = parseFloat(String(currentAmount));
    }
    if (targetAmount !== undefined) data.targetAmount = parseFloat(String(targetAmount));
    if (typeof name === "string" && name.trim()) data.name = name.trim();
    if (typeof targetDate === "string") data.targetDate = targetDate.trim() || null;
    if (priority !== undefined) data.priority = parseInt(String(priority), 10);
    if (typeof status === "string" && ["active", "completed", "abandoned"].includes(status)) {
      data.status = status;
    }
    const nextCategory =
      typeof type === "string" && type.trim()
        ? type.trim()
        : typeof category === "string" && category.trim()
          ? category.trim()
          : null;
    if (nextCategory) data.category = nextCategory;
    if (monthlyContribution !== undefined) {
      if (monthlyContribution === null || monthlyContribution === "") {
        data.monthlyContribution = null;
      } else {
        const monthly = Number(monthlyContribution);
        if (!Number.isFinite(monthly) || monthly < 0) {
          return NextResponse.json({ error: "Invalid monthlyContribution" }, { status: 400 });
        }
        data.monthlyContribution = Math.round(monthly * 100) / 100;
      }
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
