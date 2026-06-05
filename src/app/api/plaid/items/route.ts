import { NextResponse } from "next/server";
import { listPlaidItems } from "@/lib/store";

export async function GET() {
  const items = await listPlaidItems();
  return NextResponse.json({
    items: items.map(({ itemId, institutionName, linkedAt }) => ({
      itemId,
      institutionName,
      linkedAt,
    })),
  });
}
