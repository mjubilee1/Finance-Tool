import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generateWeeklyGrowthReview } from "@/lib/growth-agent";

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const force = Boolean(body?.force);
    const review = await generateWeeklyGrowthReview(session.user.id, { force });
    return NextResponse.json({ review });
  } catch (error) {
    console.error("Failed to generate weekly growth review:", error);
    return NextResponse.json({ error: "Failed to generate weekly review." }, { status: 500 });
  }
}
