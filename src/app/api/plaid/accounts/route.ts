import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { plaidClient } from "@/lib/plaid";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import type { AccountSummary } from "@/lib/finance";
import { getPlaidConfig } from "@/lib/env";
import { getDailyPlaidEndpointCalls, isPlaidEndpointDailyLimitReached, withPlaidTracking } from "@/lib/plaid-tracker";

const BALANCE_ENDPOINT = "accountsBalanceGet";

const { dailyBalanceCallLimit } = getPlaidConfig();

async function getCachedAccountsForItem(
  userId: string,
  plaidItemId: string,
  institutionName: string | null,
): Promise<AccountSummary[]> {
  const cachedAccounts = await prisma.financialAccount.findMany({
    where: {
      userId,
      plaidItemId,
    },
  });

  return cachedAccounts.map((account) => ({
    accountId: account.plaidAccountId,
    itemId: account.plaidItemId,
    institutionName,
    name: account.name,
    officialName: account.officialName,
    type: account.type,
    subtype: account.subtype,
    mask: account.mask,
    currentBalance: account.currentBalance,
    availableBalance: account.availableBalance,
    isoCurrencyCode: account.isoCurrencyCode,
  }));
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const items = await prisma.plaidItem.findMany({
      where: { userId: session.user.id },
    });

    if (items.length === 0) {
      return NextResponse.json({
        accounts: [] satisfies AccountSummary[],
        balanceRefresh: {
          usedCachedBalances: false,
          balanceCallsToday: 0,
          balanceCallLimit: dailyBalanceCallLimit,
          balanceCallsRemaining: dailyBalanceCallLimit,
        },
      });
    }

    const accounts: AccountSummary[] = [];
    let usedCachedBalances = false;
    let refreshedItems = 0;

    for (const item of items) {
      try {
        const isBalanceCapReached = await isPlaidEndpointDailyLimitReached(
          BALANCE_ENDPOINT,
          session.user.id,
          dailyBalanceCallLimit,
        );

        if (isBalanceCapReached) {
          usedCachedBalances = true;
          console.warn(
            `[PLAID TRACKER] Daily ${BALANCE_ENDPOINT} cap of ${dailyBalanceCallLimit} reached. Using cached balances for item ${item.id}.`,
          );
          accounts.push(
            ...(await getCachedAccountsForItem(
              session.user.id,
              item.plaidItemId,
              item.institutionName,
            )),
          );
          continue;
        }

        const accessToken = decrypt(item.encryptedAccessToken);
        const balances = await withPlaidTracking(BALANCE_ENDPOINT, session.user.id, () => 
          plaidClient.accountsBalanceGet({
            access_token: accessToken,
          })
        );
        refreshedItems++;

        for (const account of balances.data.accounts) {
          // Upsert account in DB
          await prisma.financialAccount.upsert({
            where: { plaidAccountId: account.account_id },
            update: {
              currentBalance: account.balances.current,
              availableBalance: account.balances.available,
              name: account.name,
              officialName: account.official_name,
              mask: account.mask,
            },
            create: {
              userId: session.user.id,
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

          accounts.push({
            accountId: account.account_id,
            itemId: item.plaidItemId,
            institutionName: item.institutionName,
            name: account.name,
            officialName: account.official_name,
            type: account.type,
            subtype: account.subtype,
            mask: account.mask,
            currentBalance: account.balances.current,
            availableBalance: account.balances.available,
            isoCurrencyCode: account.balances.iso_currency_code,
          });
        }
      } catch (err) {
        usedCachedBalances = true;
        console.error(`Failed to fetch balances for item ${item.id}`, err);
        accounts.push(
          ...(await getCachedAccountsForItem(
            session.user.id,
            item.plaidItemId,
            item.institutionName,
          )),
        );
      }
    }

    const balanceCallsToday = await getDailyPlaidEndpointCalls(BALANCE_ENDPOINT, session.user.id);

    return NextResponse.json({
      accounts,
      balanceRefresh: {
        usedCachedBalances,
        refreshedItems,
        balanceCallsToday,
        balanceCallLimit: dailyBalanceCallLimit,
        balanceCallsRemaining: Math.max(0, dailyBalanceCallLimit - balanceCallsToday),
      },
    });
  } catch (error) {
    console.error("Failed to fetch accounts:", error);
    return NextResponse.json(
      { error: "Failed to fetch account balances." },
      { status: 500 },
    );
  }
}
