import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateJoyIdeasForToday } from "@/lib/joy-ideas";

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
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
