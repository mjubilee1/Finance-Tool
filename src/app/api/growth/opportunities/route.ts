import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getGrowthDashboard } from "@/lib/growth-agent";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const data = await getGrowthDashboard(session.user.id);
    return NextResponse.json({
      opportunities: data.opportunities,
      metrics: data.metrics,
      recommendation: data.recommendation,
    });
  } catch (error) {
    console.error("Failed to load growth opportunities:", error);
    return NextResponse.json({ error: "Failed to load opportunities." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { id, status } = body as { id?: string; status?: string };
    if (!id || !status || !["open", "acted", "dismissed"].includes(status)) {
      return NextResponse.json({ error: "Invalid id or status" }, { status: 400 });
    }

    const updated = await prisma.growthOpportunity.updateMany({
      where: { id, userId: session.user.id },
      data: { status },
    });

    if (updated.count === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update opportunity:", error);
    return NextResponse.json({ error: "Failed to update opportunity." }, { status: 500 });
  }
}
