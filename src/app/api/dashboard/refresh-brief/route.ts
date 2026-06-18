import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ensureFreshDailySnapshot } from "@/lib/daily-snapshot";

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const briefRefresh = await ensureFreshDailySnapshot(session.user.id, { force: false });

    return NextResponse.json({ success: true, briefRefresh });
  } catch (error) {
    console.error("Failed to refresh CFO brief:", error);
    return NextResponse.json({ error: "Failed to refresh CFO brief." }, { status: 500 });
  }
}
