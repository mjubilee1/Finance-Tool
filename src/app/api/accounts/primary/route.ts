import { getAppUser } from "@/lib/app-user";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request) {
  try {
    const user = await getAppUser();
    if (!user) {
      return NextResponse.json({ error: "App user is not configured." }, { status: 503 });
    }

    const body = await request.json();
    const { accountId, isPrimary } = body as { accountId?: string; isPrimary?: boolean };

    if (!accountId || typeof isPrimary !== "boolean") {
      return NextResponse.json({ error: "accountId and isPrimary are required." }, { status: 400 });
    }

    const account = await prisma.financialAccount.findFirst({
      where: { id: accountId, userId: user.id },
    });

    if (!account) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    const updated = await prisma.financialAccount.update({
      where: { id: account.id },
      data: { isPrimary },
    });

    const primaryCount = await prisma.financialAccount.count({
      where: { userId: user.id, isPrimary: true },
    });

    return NextResponse.json({
      account: updated,
      primaryCount,
    });
  } catch (error) {
    console.error("Failed to update primary account:", error);
    return NextResponse.json({ error: "Failed to update primary account." }, { status: 500 });
  }
}
