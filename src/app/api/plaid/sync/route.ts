import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { syncTransactionsForItem } from "@/lib/plaid-sync";
import {
  isTokenDecryptError,
  tokenDecryptErrorMessage,
  getEncryptionDiagnostics,
} from "@/lib/encryption";
import { dedupePlaidItemsByInstitution } from "@/lib/plaid-reconnect";

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

    // One Item per institution — drops reconnect duplicates from the DB.
    const cleanup = await dedupePlaidItemsByInstitution(session.user.id);
    if (cleanup.removedInstitutions > 0) {
      console.log(
        `[PLAID SYNC] cleaned ${cleanup.removedInstitutions} stale institution link(s) for user ${session.user.id}`,
      );
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
        {
          success: false,
          error: "No linked banks found. Connect a bank account first.",
          code: "NO_ITEMS",
        },
        { status: 400 },
      );
    }

    console.log(
      `[PLAID SYNC] start user=${session.user.id} items=${items.length} bypassCooldown=${bypassCooldown} crypto=${JSON.stringify(getEncryptionDiagnostics())}`,
    );

    for (const item of items) {
      try {
        const result = await syncTransactionsForItem(item.id, {
          batchStartedAt,
          bypassCooldown,
        });
        if (result.skipped) {
          skippedCount++;
          if (result.reason) skipReasons.push(result.reason);
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
          skipReasons.push(
            `${item.institutionName ?? "A bank"} needs reconnect — saved credentials can’t be read.`,
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
      cleanedStaleLinks: cleanup.removedInstitutions,
    };

    const changed = addedCount + modifiedCount + removedCount;

    // Every remaining link is undecryptable → must reconnect.
    if (
      tokenDecryptFailures > 0 &&
      tokenDecryptFailures === failedCount &&
      changed === 0 &&
      tokenDecryptFailures === items.length
    ) {
      return NextResponse.json(
        {
          ...payload,
          success: false,
          error: tokenDecryptErrorMessage(),
          code: "TOKEN_DECRYPT_FAILED",
          crypto: getEncryptionDiagnostics(),
        },
        { status: 500 },
      );
    }

    if (failedCount > 0 && changed === 0 && tokenDecryptFailures === 0) {
      return NextResponse.json(
        {
          ...payload,
          success: false,
          error: "Failed to sync transactions for linked accounts.",
          code: "SYNC_FAILED",
        },
        { status: 500 },
      );
    }

    return NextResponse.json(payload);
  } catch (error) {
    console.error("Failed to sync transactions:", error);
    return NextResponse.json({ error: "Failed to sync transactions." }, { status: 500 });
  }
}
