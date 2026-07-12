import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { plaidClient, plaidCountryCodes, plaidProducts } from "@/lib/plaid";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { withPlaidTracking } from "@/lib/plaid-tracker";

type CreateLinkTokenBody = {
  plaidItemId?: string;
};

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let plaidItemId: string | undefined;
    try {
      const body = (await request.json()) as CreateLinkTokenBody;
      plaidItemId = body.plaidItemId;
    } catch {
      // Empty body is fine for new connections.
    }

    let accessToken: string | undefined;
    if (plaidItemId) {
      const item = await prisma.plaidItem.findFirst({
        where: {
          userId: session.user.id,
          plaidItemId,
        },
      });

      if (!item) {
        return NextResponse.json({ error: "Bank connection not found." }, { status: 404 });
      }

      accessToken = decrypt(item.encryptedAccessToken);
    }

    const response = await withPlaidTracking("linkTokenCreate", session.user.id, () =>
      plaidClient.linkTokenCreate({
        user: { client_user_id: session.user.id },
        client_name: "Life OS",
        products: plaidProducts,
        country_codes: plaidCountryCodes,
        language: "en",
        redirect_uri: process.env.PLAID_REDIRECT_URI || undefined,
        access_token: accessToken,
      }),
    );

    return NextResponse.json({
      link_token: response.data.link_token,
      update_mode: Boolean(accessToken),
    });
  } catch (error) {
    console.error("Failed to create link token:", error);
    return NextResponse.json(
      { error: "Failed to create link token." },
      { status: 500 },
    );
  }
}
