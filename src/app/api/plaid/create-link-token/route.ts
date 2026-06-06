import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { plaidClient, plaidCountryCodes, plaidProducts } from "@/lib/plaid";
import { withPlaidTracking } from "@/lib/plaid-tracker";

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const response = await withPlaidTracking("linkTokenCreate", session.user.id, () => 
      plaidClient.linkTokenCreate({
        user: { client_user_id: session.user.id },
        client_name: "Daily Financial Coach",
        products: plaidProducts,
        country_codes: plaidCountryCodes,
        language: "en",
        redirect_uri: process.env.PLAID_REDIRECT_URI || undefined,
      })
    );

    return NextResponse.json({ link_token: response.data.link_token });
  } catch (error) {
    console.error("Failed to create link token:", error);
    return NextResponse.json(
      { error: "Failed to create link token." },
      { status: 500 },
    );
  }
}
