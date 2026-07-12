import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { markPlaidItemHealthyByPlaidId } from "@/lib/plaid-item-health";
import { syncTransactionsForItem } from "@/lib/plaid-sync";

type CompleteUpdateBody = {
  plaidItemId?: string;
};

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { plaidItemId } = (await request.json()) as CompleteUpdateBody;
    if (!plaidItemId) {
      return NextResponse.json({ error: "Missing plaidItemId." }, { status: 400 });
    }

    const item = await prisma.plaidItem.findFirst({
      where: {
        userId: session.user.id,
        plaidItemId,
      },
    });

    if (!item) {
      return NextResponse.json({ error: "Bank connection not found." }, { status: 404 });
    }

    await markPlaidItemHealthyByPlaidId(plaidItemId);

    let syncResult = null;
    try {
      syncResult = await syncTransactionsForItem(item.id, { bypassCooldown: true });
    } catch (error) {
      console.error(`Failed to sync after reauth for item ${item.id}`, error);
    }

    return NextResponse.json({
      success: true,
      institutionName: item.institutionName,
      sync: syncResult,
    });
  } catch (error) {
    console.error("Failed to complete bank reauth:", error);
    return NextResponse.json(
      { error: "Failed to complete bank reconnection." },
      { status: 500 },
    );
  }
}
