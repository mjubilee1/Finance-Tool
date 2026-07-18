import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { syncTransactionsForItem } from "@/lib/plaid-sync";
import { isTokenDecryptError, tokenDecryptErrorMessage, getEncryptionDiagnostics } from "@/lib/encryption";

type SyncRequestBody = {
  bypassCooldown?: boolean;
};

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
    const skipReasons: string[] = [];
    const batchStartedAt = new Date();

    if (items.length === 0) {
      return NextResponse.json(
        { success: false, error: "No linked banks found. Connect a bank account first.", code: "NO_ITEMS" },
        { status: 400 },
      );
    }

    console.log(
      `[PLAID SYNC] start user=${session.user.id} items=${items.length} bypassCooldown=${bypassCooldown} crypto=${JSON.stringify(getEncryptionDiagnostics())}`,
    );

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
        if (isTokenDecryptError(err)) {
          tokenDecryptFailures++;
          console.error(
            `[PLAID SYNC] token decrypt failed item=${item.id} institution=${item.institutionName ?? "unknown"} crypto=${JSON.stringify(getEncryptionDiagnostics())}`,
            err,
          );
        } else {
          console.error(`Failed to sync transactions for item ${item.id}`, err);
        }
      }
    }

    const payload = {
      success: true,
      added: addedCount,
      modified: modifiedCount,
      removed: removedCount,
      skipped: skippedCount,
      failed: failedCount,
      skipReasons: [...new Set(skipReasons)],
      syncedItems: items.length - skippedCount - failedCount,
    };

    if (failedCount > 0 && addedCount === 0 && modifiedCount === 0 && removedCount === 0) {
      const crypto = getEncryptionDiagnostics();
      const error =
        tokenDecryptFailures > 0
          ? tokenDecryptErrorMessage()
          : "Failed to sync transactions for linked accounts.";
      const code = tokenDecryptFailures > 0 ? "TOKEN_DECRYPT_FAILED" : "SYNC_FAILED";

      return NextResponse.json(
        {
          ...payload,
          success: false,
          error,
          code,
          // Safe diagnostics for the UI — fingerprints only, no secrets.
          crypto,
        },
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
