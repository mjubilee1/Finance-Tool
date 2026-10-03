import { NextResponse } from "next/server";
import { getAppUser } from "@/lib/app-user";
import { getExecutiveDashboard } from "@/lib/executive-dashboard";

export async function GET() {
  try {
    const user = await getAppUser();
  if (!user) {
    return NextResponse.json({ error: "App user is not configured." }, { status: 503 });
  }

    return NextResponse.json(await getExecutiveDashboard(user.id));
  } catch (error) {
    console.error("Failed to load executive dashboard:", error);
    return NextResponse.json(
      { error: "Failed to load executive dashboard." },
      { status: 500 },
    );
  }
}
