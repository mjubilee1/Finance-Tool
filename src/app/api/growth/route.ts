import { getAppUser } from "@/lib/app-user";
import { NextResponse } from "next/server";
import { getGrowthDashboard } from "@/lib/growth-agent";

export async function GET() {
  try {
    const user = await getAppUser();
    if (!user) {
      return NextResponse.json({ error: "App user is not configured." }, { status: 503 });
    }

    const data = await getGrowthDashboard(user.id);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Failed to load growth dashboard:", error);
    return NextResponse.json({ error: "Failed to load growth dashboard." }, { status: 500 });
  }
}
