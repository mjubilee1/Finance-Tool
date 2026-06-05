import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncTransactionsForItem } from "@/lib/plaid-sync";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { webhook_type, webhook_code, item_id } = body;

    console.log(`[Plaid Webhook] Received: ${webhook_type} - ${webhook_code} for item: ${item_id}`);

    if (webhook_type === "TRANSACTIONS") {
      if (
        webhook_code === "SYNC_UPDATES_AVAILABLE" ||
        webhook_code === "INITIAL_UPDATE" ||
        webhook_code === "HISTORICAL_UPDATE" ||
        webhook_code === "DEFAULT_UPDATE"
      ) {
        // Find the internal item ID using the Plaid item ID
        const item = await prisma.plaidItem.findUnique({
          where: { plaidItemId: item_id },
        });

        if (item) {
          console.log(`[Plaid Webhook] Triggering sync for internal item ID: ${item.id}`);
          // Trigger the sync process in the background
          // We don't await this so we can respond to Plaid quickly
          syncTransactionsForItem(item.id)
            .then((result) => console.log(`[Plaid Webhook] Sync successful. Added: ${result.added}, Modified: ${result.modified}, Removed: ${result.removed}`))
            .catch((err) => console.error(`[Plaid Webhook] Sync failed for item ${item.id}:`, err));
        } else {
          console.warn(`[Plaid Webhook] Plaid item ${item_id} not found in database.`);
        }
      }
    }

    // Always respond with a 200 to acknowledge receipt of the webhook
    return NextResponse.json({ status: "ok" });
  } catch (error) {
    console.error("[Plaid Webhook] Error processing webhook:", error);
    // Still return 200 so Plaid doesn't retry endlessly for invalid payloads
    return NextResponse.json({ status: "error" }, { status: 200 });
  }
}
