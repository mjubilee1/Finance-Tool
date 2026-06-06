import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { webhook_type, webhook_code, item_id } = body;

    console.log(`[Plaid Webhook] Ignored: ${webhook_type} - ${webhook_code} for item: ${item_id}`);

    // Always respond with a 200 to acknowledge receipt of the webhook
    return NextResponse.json({ status: "ok" });
  } catch (error) {
    console.error("[Plaid Webhook] Error processing webhook:", error);
    // Still return 200 so Plaid doesn't retry endlessly for invalid payloads
    return NextResponse.json({ status: "error" }, { status: 200 });
  }
}
