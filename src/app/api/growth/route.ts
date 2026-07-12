import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getGrowthDashboard } from "@/lib/growth-agent";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const data = await getGrowthDashboard(session.user.id);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Failed to load growth dashboard:", error);
    return NextResponse.json({ error: "Failed to load growth dashboard." }, { status: 500 });
  }
}
