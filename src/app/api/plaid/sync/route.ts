import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { syncTransactionsForItem } from "@/lib/plaid-sync";
import { isTokenDecryptError, tokenDecryptErrorMessage } from "@/lib/encryption";
import { needsPlaidReauth } from "@/lib/plaid-item-health";

type SyncRequestBody = {
  bypassCooldown?: boolean;
};

function buildSyncFailureMessage(
  itemIssues: Array<{ institutionName: string | null; errorMessage: string | null; status: string }>,
) {
  const reauthItems = itemIssues.filter((item) => needsPlaidReauth(item.status));
  if (reauthItems.length > 0) {
    const names = reauthItems
      .map((item) => item.institutionName ?? "A linked bank")
      .join(", ");
    return `${names} need${reauthItems.length === 1 ? "s" : ""} you to sign in again. Tap Reconnect below.`;
  }

  const firstMessage = itemIssues.find((item) => item.errorMessage)?.errorMessage;
  if (firstMessage) return firstMessage;

  return "Failed to sync transactions for linked accounts.";
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let bypassCooldown = false;
    try {
      const body = (await req.json()) as SyncRequestBody;
      bypassCooldown = body.bypassCooldown === true;
    } catch {
      // Empty body is fine for legacy callers.
    }

    const items = await prisma.plaidItem.findMany({
      where: { userId: session.user.id },
    });

    let addedCount = 0;
    let modifiedCount = 0;
    let removedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    let tokenDecryptFailures = 0;
    const failedItemIds: string[] = [];
    const skipReasons: string[] = [];
    const batchStartedAt = new Date();

    if (items.length === 0) {
      return NextResponse.json(
        { success: false, error: "No linked banks found. Connect a bank account first.", code: "NO_ITEMS" },
        { status: 400 },
      );
    }

    for (const item of items) {
      try {
        const result = await syncTransactionsForItem(item.id, { batchStartedAt, bypassCooldown });
        if (result.skipped) {
          skippedCount++;
          if (result.reason) {
            skipReasons.push(result.reason);
          }
        }
        addedCount += result.added;
        modifiedCount += result.modified;
        removedCount += result.removed;
      } catch (err) {
        failedCount++;
        failedItemIds.push(item.id);
        if (isTokenDecryptError(err)) {
          tokenDecryptFailures++;
        }
        console.error(`Failed to sync transactions for item ${item.id}`, err);
      }
    }

    const refreshedItems = await prisma.plaidItem.findMany({
      where: { userId: session.user.id },
      select: {
        plaidItemId: true,
        institutionName: true,
        status: true,
        errorCode: true,
        errorMessage: true,
        lastSyncedAt: true,
      },
    });

    const itemIssues = refreshedItems
      .filter((item) => needsPlaidReauth(item.status) || item.status === "error")
      .map((item) => ({
        plaidItemId: item.plaidItemId,
        institutionName: item.institutionName,
        status: item.status,
        errorCode: item.errorCode,
        errorMessage: item.errorMessage,
      }));

    const payload = {
      success: true,
      added: addedCount,
      modified: modifiedCount,
      removed: removedCount,
      skipped: skippedCount,
      failed: failedCount,
      skipReasons: [...new Set(skipReasons)],
      syncedItems: items.length - skippedCount - failedCount,
      itemIssues,
      failedItemIds,
    };

    if (failedCount > 0 && addedCount === 0 && modifiedCount === 0 && removedCount === 0) {
      const error =
        tokenDecryptFailures > 0
          ? tokenDecryptErrorMessage()
          : buildSyncFailureMessage(refreshedItems);
      const code = tokenDecryptFailures > 0 ? "TOKEN_DECRYPT_FAILED" : "SYNC_FAILED";

      return NextResponse.json({ ...payload, success: false, error, code }, { status: 500 });
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
