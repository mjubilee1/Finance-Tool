import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { plaidClient } from "@/lib/plaid";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/encryption";
import { CountryCode } from "plaid";
import { withPlaidTracking } from "@/lib/plaid-tracker";

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { public_token, institution } = await request.json();

    if (!public_token) {
      return NextResponse.json({ error: "Missing public_token" }, { status: 400 });
    }

    const exchange = await withPlaidTracking("itemPublicTokenExchange", session.user.id, () => 
      plaidClient.itemPublicTokenExchange({ public_token })
    );
    const { access_token, item_id } = exchange.data;

    const itemResponse = await withPlaidTracking("itemGet", session.user.id, () => 
      plaidClient.itemGet({ access_token })
    );
    const institutionId = itemResponse.data.item.institution_id ?? null;

    let institutionName = institution?.name ?? null;
    if (institutionId && !institutionName) {
      const institutionResponse = await withPlaidTracking("institutionsGetById", session.user.id, () => 
        plaidClient.institutionsGetById({
          institution_id: institutionId,
          country_codes: [CountryCode.Us],
        })
      );
      institutionName = institutionResponse.data.institution.name;
    }

    // Encrypt token and save to DB
    await prisma.plaidItem.upsert({
      where: { plaidItemId: item_id },
      update: {
        encryptedAccessToken: encrypt(access_token),
        institutionName,
        institutionId,
        userId: session.user.id,
      },
      create: {
        plaidItemId: item_id,
        encryptedAccessToken: encrypt(access_token),
        institutionName,
        institutionId,
        userId: session.user.id,
      },
    });

    return NextResponse.json({ success: true, item_id });
  } catch (error) {
    console.error("Failed to exchange public token:", error);
    return NextResponse.json(
      { error: "Failed to link account." },
      { status: 500 },
    );
  }
}
