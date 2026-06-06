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
    let skippedCount = 0;
    let failedCount = 0;

    for (const item of items) {
      try {
        const result = await syncTransactionsForItem(item.id);
        if (result.skipped) {
          skippedCount++;
        }
        addedCount += result.added;
        modifiedCount += result.modified;
        removedCount += result.removed;
      } catch (err) {
        failedCount++;
        console.error(`Failed to sync transactions for item ${item.id}`, err);
      }
    }

    const payload = {
      success: true,
      added: addedCount,
      modified: modifiedCount,
      removed: removedCount,
      skipped: skippedCount,
      failed: failedCount,
    };

    if (failedCount > 0 && addedCount === 0 && modifiedCount === 0 && removedCount === 0) {
      return NextResponse.json(
        { ...payload, success: false, error: "Failed to sync transactions for linked accounts." },
        { status: 500 },
      );
    }

    return NextResponse.json(payload);
  } catch (error) {
    console.error("Failed to sync transactions:", error);
    return NextResponse.json(
      { error: "Failed to sync transactions." },
      { status: 500 },
    );
  }
}

