import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generateHighLeverageRecommendation } from "@/lib/growth-agent";

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const force = Boolean(body?.force);
    const recommendation = await generateHighLeverageRecommendation(session.user.id, { force });
    return NextResponse.json({ recommendation });
  } catch (error) {
    console.error("Failed to generate growth recommendation:", error);
    return NextResponse.json({ error: "Failed to generate recommendation." }, { status: 500 });
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
    if (!id || !status || !["pending", "done", "skipped"].includes(status)) {
      return NextResponse.json({ error: "Invalid id or status" }, { status: 400 });
    }

    const { prisma } = await import("@/lib/prisma");
    const updated = await prisma.growthRecommendation.updateMany({
      where: { id, userId: session.user.id },
      data: { status },
    });

    if (updated.count === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update recommendation:", error);
    return NextResponse.json({ error: "Failed to update recommendation." }, { status: 500 });
  }
}
