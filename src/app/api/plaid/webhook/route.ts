import { NextResponse } from "next/server";
import { handlePlaidWebhook, verifyPlaidWebhook } from "@/lib/plaid-webhook";

export async function POST(request: Request) {
  const body = await request.text();

  try {
    const verified = await verifyPlaidWebhook(body, request.headers.get("plaid-verification"));
    if (!verified) {
      return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
    }

    const payload = JSON.parse(body) as Parameters<typeof handlePlaidWebhook>[0];
    await handlePlaidWebhook(payload);

    return NextResponse.json({ status: "ok" });
  } catch (error) {
    console.error("[Plaid Webhook] Error processing webhook:", error);
    // Acknowledge so Plaid does not retry endlessly on transient failures.
    return NextResponse.json({ status: "error" }, { status: 200 });
  }
}
