import { getAppUser } from "@/lib/app-user";
import { NextResponse } from "next/server";
import { generateHighLeverageRecommendation } from "@/lib/growth-agent";
import { storeFinancialMemories } from "@/lib/financial-memory";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const user = await getAppUser();
    if (!user) {
      return NextResponse.json({ error: "App user is not configured." }, { status: 503 });
    }

    const body = await request.json().catch(() => ({}));
    const force = Boolean(body?.force);
    const recommendation = await generateHighLeverageRecommendation(user.id, { force });
    return NextResponse.json({ recommendation });
  } catch (error) {
    console.error("Failed to generate growth recommendation:", error);
    return NextResponse.json({ error: "Failed to generate recommendation." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getAppUser();
    if (!user) {
      return NextResponse.json({ error: "App user is not configured." }, { status: 503 });
    }

    const body = await request.json();
    const { id, status } = body as { id?: string; status?: string };
    if (!id || !status || !["pending", "done", "skipped"].includes(status)) {
      return NextResponse.json({ error: "Invalid id or status" }, { status: 400 });
    }

    const existing = await prisma.growthRecommendation.findFirst({
      where: { id, userId: user.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.growthRecommendation.update({
      where: { id },
      data: { status },
    });

    if (status === "skipped" || status === "done") {
      await storeFinancialMemories(
        user.id,
        [
          {
            title:
              status === "skipped"
                ? `Skipped move ${existing.date}`
                : `Completed move ${existing.date}`,
            content:
              status === "skipped"
                ? `User skipped today's growth move: "${existing.action}". Do not recycle this theme today. If it was promotion planning, they may already have boss guidance — prefer executing existing promo work or a different leverage domain.`
                : `User completed today's growth move: "${existing.action}".`,
            importanceScore: status === "skipped" ? 0.85 : 0.7,
          },
        ],
        {
          source: "growth-agent",
          type: status === "skipped" ? "GROWTH_SKIP" : "GROWTH_DONE",
          limit: 1,
          minImportance: 0.5,
        },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update recommendation:", error);
    return NextResponse.json({ error: "Failed to update recommendation." }, { status: 500 });
  }
}
