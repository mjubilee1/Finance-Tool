import { plaidClient } from "@/lib/plaid";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { withPlaidTracking } from "@/lib/plaid-tracker";

/**
 * Upsert accounts from Plaid's free/cached /accounts/get response.
 * Does NOT force a real-time institution pull (unlike /accounts/balance/get).
 */
export async function syncCachedAccountsForItem(itemId: string, userId: string) {
  const item = await prisma.plaidItem.findUnique({ where: { id: itemId } });
  if (!item) return 0;

  const accessToken = decrypt(item.encryptedAccessToken, {
    itemId: item.id,
    label: `plaid-accounts:${item.institutionName ?? item.plaidItemId}`,
  });
  const response = await withPlaidTracking("accountsGet", userId, () =>
    plaidClient.accountsGet({ access_token: accessToken }),
  );

  let upserted = 0;
  for (const account of response.data.accounts) {
    await prisma.financialAccount.upsert({
      where: { plaidAccountId: account.account_id },
      update: {
        currentBalance: account.balances.current,
        availableBalance: account.balances.available,
        name: account.name,
        officialName: account.official_name,
        mask: account.mask,
        type: account.type,
        subtype: account.subtype,
        isoCurrencyCode: account.balances.iso_currency_code,
      },
      create: {
        userId,
        plaidItemId: item.plaidItemId,
        plaidAccountId: account.account_id,
        name: account.name,
        officialName: account.official_name,
        type: account.type,
        subtype: account.subtype,
        mask: account.mask,
        currentBalance: account.balances.current,
        availableBalance: account.balances.available,
        isoCurrencyCode: account.balances.iso_currency_code,
      },
    });
    upserted++;
  }

  return upserted;
}
