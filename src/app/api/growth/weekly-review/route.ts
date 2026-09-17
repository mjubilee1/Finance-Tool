import { getAppUser } from "@/lib/app-user";
import { NextResponse } from "next/server";
import { generateWeeklyGrowthReview } from "@/lib/growth-agent";

export async function POST(request: Request) {
  try {
    const user = await getAppUser();
    if (!user) {
      return NextResponse.json({ error: "App user is not configured." }, { status: 503 });
    }

    const body = await request.json().catch(() => ({}));
    const force = Boolean(body?.force);
    const review = await generateWeeklyGrowthReview(user.id, { force });
    return NextResponse.json({ review });
  } catch (error) {
    console.error("Failed to generate weekly growth review:", error);
    return NextResponse.json({ error: "Failed to generate weekly review." }, { status: 500 });
  }
}
