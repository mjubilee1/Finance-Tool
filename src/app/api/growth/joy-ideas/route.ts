import { getAppUser } from "@/lib/app-user";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateJoyIdeasForToday } from "@/lib/joy-ideas";

export async function POST() {
  try {
    const user = await getAppUser();
    if (!user) {
      return NextResponse.json({ error: "App user is not configured." }, { status: 503 });
    }

    const userId = user.id;
    const [profile, accounts] = await Promise.all([
      prisma.lifeLeverageProfile.findUnique({ where: { userId } }),
      prisma.financialAccount.findMany({ where: { userId } }),
    ]);

    const cashAvailable = accounts
      .filter((a) => a.type === "depository")
      .reduce((sum, a) => sum + (a.availableBalance ?? a.currentBalance ?? 0), 0);

    const result = await generateJoyIdeasForToday({
      notes: profile?.notes,
      cashTight: cashAvailable < 1000,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to generate joy ideas:", error);
    return NextResponse.json({ error: "Failed to generate ideas." }, { status: 500 });
  }
}
