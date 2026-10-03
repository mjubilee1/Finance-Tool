import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getExecutiveDashboard } from "@/lib/executive-dashboard";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(await getExecutiveDashboard(session.user.id));
  } catch (error) {
    console.error("Failed to load executive dashboard:", error);
    return NextResponse.json(
      { error: "Failed to load executive dashboard." },
      { status: 500 },
    );
  }
}
