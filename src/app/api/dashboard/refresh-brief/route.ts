import { getAppUser } from "@/lib/app-user";
import { NextResponse } from "next/server";
import { ensureFreshDailySnapshot } from "@/lib/daily-snapshot";

export async function POST() {
  try {
    const user = await getAppUser();
    if (!user) {
      return NextResponse.json({ error: "App user is not configured." }, { status: 503 });
    }

    const briefRefresh = await ensureFreshDailySnapshot(user.id, { force: false });

    return NextResponse.json({ success: true, briefRefresh });
  } catch (error) {
    console.error("Failed to refresh daily brief:", error);
    return NextResponse.json({ error: "Failed to refresh daily brief." }, { status: 500 });
  }
}
