import { getAppUser } from "@/lib/app-user";
import { NextResponse } from "next/server";
import { plaidClient, plaidCountryCodes, plaidProducts } from "@/lib/plaid";
import { withPlaidTracking } from "@/lib/plaid-tracker";

export async function POST() {
  try {
    const user = await getAppUser();
    if (!user) {
      return NextResponse.json({ error: "App user is not configured." }, { status: 503 });
    }

    const response = await withPlaidTracking("linkTokenCreate", user.id, () =>
      plaidClient.linkTokenCreate({
        user: { client_user_id: user.id },
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
