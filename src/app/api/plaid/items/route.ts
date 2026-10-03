import { getAppUser } from "@/lib/app-user";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await getAppUser();
    if (!user) {
      return NextResponse.json({ error: "App user is not configured." }, { status: 503 });
    }

    const items = await prisma.plaidItem.findMany({
      where: { userId: user.id },
      select: {
        plaidItemId: true,
        institutionName: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      items: items.map((item) => ({
        itemId: item.plaidItemId,
        institutionName: item.institutionName,
        linkedAt: item.createdAt,
      })),
    });
  } catch (error) {
    console.error("Failed to fetch Plaid items:", error);
    return NextResponse.json(
      { error: "Failed to fetch Plaid items." },
      { status: 500 },
    );
  }
}
