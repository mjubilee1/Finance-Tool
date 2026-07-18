import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { plaidClient } from "@/lib/plaid";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import type { AccountSummary } from "@/lib/finance";
import { getPlaidConfig } from "@/lib/env";
import {
  getDailyPlaidEndpointCalls,
  getLatestPlaidEndpointCall,
  isPlaidEndpointDailyLimitReached,
  withPlaidTracking,
} from "@/lib/plaid-tracker";
import type { BalanceRefreshMeta } from "@/lib/plaid-balances";

const BALANCE_ENDPOINT = "accountsBalanceGet";

const { dailyBalanceCallLimit, balanceCooldownMinutes } = getPlaidConfig();

/** Prevent concurrent paid Balance refreshes for the same user. */
const inFlightBalanceRefresh = new Set<string>();

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

async function getAllCachedAccounts(userId: string): Promise<AccountSummary[]> {
  const [items, accounts] = await Promise.all([
    prisma.plaidItem.findMany({ where: { userId } }),
    prisma.financialAccount.findMany({ where: { userId } }),
  ]);

  const institutionByItemId = new Map(
    items.map((item) => [item.plaidItemId, item.institutionName]),
  );

  return accounts.map((account) => ({
    accountId: account.plaidAccountId,
    itemId: account.plaidItemId,
    institutionName: institutionByItemId.get(account.plaidItemId) ?? null,
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

async function buildMeta(
  userId: string,
  partial: Partial<BalanceRefreshMeta> & Pick<BalanceRefreshMeta, "usedCachedBalances">,
): Promise<BalanceRefreshMeta> {
  const balanceCallsToday = await getDailyPlaidEndpointCalls(BALANCE_ENDPOINT, userId);
  const latest = await getLatestPlaidEndpointCall(BALANCE_ENDPOINT, userId);
  const cooldownMs = balanceCooldownMinutes * 60 * 1000;
  let cooldownRemainingSeconds = 0;

  if (balanceCooldownMinutes > 0 && latest) {
    const elapsed = Date.now() - latest.createdAt.getTime();
    if (elapsed < cooldownMs) {
      cooldownRemainingSeconds = Math.ceil((cooldownMs - elapsed) / 1000);
    }
  }

  return {
    usedCachedBalances: partial.usedCachedBalances,
    refreshedItems: partial.refreshedItems ?? 0,
    balanceCallsToday,
    balanceCallLimit: dailyBalanceCallLimit,
    balanceCallsRemaining: Math.max(0, dailyBalanceCallLimit - balanceCallsToday),
    cooldownMinutes: balanceCooldownMinutes,
    cooldownRemainingSeconds,
    reason: partial.reason,
  };
}

/**
 * GET /api/plaid/accounts
 * - Default: DB-cached balances only (no Plaid Balance charge).
 * - ?fresh=1: paid /accounts/balance/get, gated by daily cap + server cooldown.
 */
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const wantFresh = searchParams.get("fresh") === "1";

    if (!wantFresh) {
      return NextResponse.json({
        accounts: await getAllCachedAccounts(userId),
        balanceRefresh: await buildMeta(userId, { usedCachedBalances: false, refreshedItems: 0 }),
      });
    }

    if (inFlightBalanceRefresh.has(userId)) {
      return NextResponse.json({
        accounts: await getAllCachedAccounts(userId),
        balanceRefresh: await buildMeta(userId, {
          usedCachedBalances: true,
          refreshedItems: 0,
          reason: "in_flight",
        }),
      });
    }

    const latestBalanceCall = await getLatestPlaidEndpointCall(BALANCE_ENDPOINT, userId);
    const cooldownMs = balanceCooldownMinutes * 60 * 1000;
    if (
      balanceCooldownMinutes > 0 &&
      latestBalanceCall &&
      Date.now() - latestBalanceCall.createdAt.getTime() < cooldownMs
    ) {
      console.warn(
        `[PLAID TRACKER] Balance cooldown active (${balanceCooldownMinutes}m). Serving cached balances for user ${userId}.`,
      );
      return NextResponse.json({
        accounts: await getAllCachedAccounts(userId),
        balanceRefresh: await buildMeta(userId, {
          usedCachedBalances: true,
          refreshedItems: 0,
          reason: "cooldown",
        }),
      });
    }

    const items = await prisma.plaidItem.findMany({
      where: { userId },
    });

    if (items.length === 0) {
      return NextResponse.json({
        accounts: [] satisfies AccountSummary[],
        balanceRefresh: await buildMeta(userId, { usedCachedBalances: false, refreshedItems: 0 }),
      });
    }

    inFlightBalanceRefresh.add(userId);

    try {
      const accounts: AccountSummary[] = [];
      let usedCachedBalances = false;
      let refreshedItems = 0;
      let reason: BalanceRefreshMeta["reason"];

      for (const item of items) {
        try {
          const isBalanceCapReached = await isPlaidEndpointDailyLimitReached(
            BALANCE_ENDPOINT,
            userId,
            dailyBalanceCallLimit,
          );

          if (isBalanceCapReached) {
            usedCachedBalances = true;
            reason = "daily_limit";
            console.warn(
              `[PLAID TRACKER] Daily ${BALANCE_ENDPOINT} cap of ${dailyBalanceCallLimit} reached. Using cached balances for item ${item.id}.`,
            );
            accounts.push(
              ...(await getCachedAccountsForItem(userId, item.plaidItemId, item.institutionName)),
            );
            continue;
          }

          const accessToken = decrypt(item.encryptedAccessToken, {
            itemId: item.id,
            label: `plaid-balance:${item.institutionName ?? item.plaidItemId}`,
          });
          const balances = await withPlaidTracking(BALANCE_ENDPOINT, userId, () =>
            plaidClient.accountsBalanceGet({
              access_token: accessToken,
            }),
          );
          refreshedItems++;

          for (const account of balances.data.accounts) {
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
          reason = reason ?? "error";
          console.error(`Failed to fetch balances for item ${item.id}`, err);
          accounts.push(
            ...(await getCachedAccountsForItem(userId, item.plaidItemId, item.institutionName)),
          );
        }
      }

      return NextResponse.json({
        accounts,
        balanceRefresh: await buildMeta(userId, {
          usedCachedBalances,
          refreshedItems,
          reason,
        }),
      });
    } finally {
      inFlightBalanceRefresh.delete(userId);
    }
  } catch (error) {
    console.error("Failed to fetch accounts:", error);
    return NextResponse.json(
      { error: "Failed to fetch account balances." },
      { status: 500 },
    );
  }
}
