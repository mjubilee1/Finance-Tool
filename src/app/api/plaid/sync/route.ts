import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { syncTransactionsForItem } from "@/lib/plaid-sync";

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const items = await prisma.plaidItem.findMany({
      where: { userId: session.user.id },
    });

    let addedCount = 0;
    let modifiedCount = 0;
    let removedCount = 0;

    for (const item of items) {
      try {
        const result = await syncTransactionsForItem(item.id);
        addedCount += result.added;
        modifiedCount += result.modified;
        removedCount += result.removed;
      } catch (err) {
        console.error(`Failed to sync transactions for item ${item.id}`, err);
      }
    }

    return NextResponse.json({
      success: true,
      added: addedCount,
      modified: modifiedCount,
      removed: removedCount,
    });
  } catch (error) {
    console.error("Failed to sync transactions:", error);
    return NextResponse.json(
      { error: "Failed to sync transactions." },
      { status: 500 },
    );
  }
}

