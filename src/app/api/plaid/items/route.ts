import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const items = await prisma.plaidItem.findMany({
      where: { userId: session.user.id },
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
