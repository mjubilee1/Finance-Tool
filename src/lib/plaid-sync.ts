import { plaidClient } from "@/lib/plaid";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { applyRuleBasedCategory } from "@/lib/categorization";
import { getPlaidConfig } from "@/lib/env";
import { syncCachedAccountsForItem } from "@/lib/plaid-accounts";
import { getLatestPlaidEndpointCall, isPlaidEndpointDailyLimitReached, withPlaidTracking } from "./plaid-tracker";

const TRANSACTIONS_SYNC_ENDPOINT = "transactionsSync";
const { dailySyncCallLimit, syncCooldownMinutes } = getPlaidConfig();
const inFlightSyncs = new Set<string>();

export type TransactionSyncResult = {
  added: number;
  modified: number;
  removed: number;
  skipped?: boolean;
  reason?: string;
};

type TransactionSyncOptions = {
  batchStartedAt?: Date;
  bypassCooldown?: boolean;
};

export async function shouldSkipTransactionSync(
  userId: string,
  itemId: string,
  options: TransactionSyncOptions = {},
) {
  if (inFlightSyncs.has(itemId)) {
    return "A sync is already running for this item.";
  }

  const isLimitReached = await isPlaidEndpointDailyLimitReached(
    TRANSACTIONS_SYNC_ENDPOINT,
    userId,
    dailySyncCallLimit,
  );

  if (isLimitReached) {
    return `Daily transaction sync limit of ${dailySyncCallLimit} reached. Resets at midnight.`;
  }

  if (syncCooldownMinutes > 0 && !options.bypassCooldown) {
    const latestSync = await getLatestPlaidEndpointCall(TRANSACTIONS_SYNC_ENDPOINT, userId);
    const cooldownMs = syncCooldownMinutes * 60 * 1000;
    const latestSyncIsFromCurrentBatch = options.batchStartedAt
      ? latestSync && latestSync.createdAt >= options.batchStartedAt
      : false;

    if (latestSync && !latestSyncIsFromCurrentBatch && Date.now() - latestSync.createdAt.getTime() < cooldownMs) {
      return `Transactions were synced recently. Wait ${syncCooldownMinutes} minutes between automatic syncs, or use Refresh to sync now.`;
    }
  }

  return null;
}

export async function syncTransactionsForItem(
  itemId: string,
  options: TransactionSyncOptions = {},
): Promise<TransactionSyncResult> {
  const item = await prisma.plaidItem.findUnique({
    where: { id: itemId },
  });

  if (!item) {
    throw new Error(`PlaidItem with id ${itemId} not found`);
  }

  let addedCount = 0;
  let modifiedCount = 0;
  let removedCount = 0;

  try {
    const skipReason = await shouldSkipTransactionSync(item.userId, item.id, options);
    if (skipReason) {
      console.warn(`[PLAID TRACKER] Skipping transaction sync for item ${item.id}: ${skipReason}`);
      return { added: 0, modified: 0, removed: 0, skipped: true, reason: skipReason };
    }

    inFlightSyncs.add(item.id);

    const accessToken = decrypt(item.encryptedAccessToken, {
      itemId: item.id,
      label: `plaid-item:${item.institutionName ?? item.plaidItemId}`,
    });
    let cursor = item.cursor || undefined;
    let hasMore = true;

    while (hasMore) {
      const isLimitReached = await isPlaidEndpointDailyLimitReached(
        TRANSACTIONS_SYNC_ENDPOINT,
        item.userId,
        dailySyncCallLimit,
      );

      if (isLimitReached) {
        console.warn(`[PLAID TRACKER] Daily ${TRANSACTIONS_SYNC_ENDPOINT} cap reached mid-sync for item ${item.id}.`);
        return {
          added: addedCount,
          modified: modifiedCount,
          removed: removedCount,
          skipped: true,
          reason: `Daily transaction sync limit of ${dailySyncCallLimit} reached. Resets at midnight.`,
        };
      }

      const response = await withPlaidTracking(TRANSACTIONS_SYNC_ENDPOINT, item.userId, () => 
        plaidClient.transactionsSync({
          access_token: accessToken,
          cursor,
        })
      );

      const data = response.data;

      // Handle Added
      for (const transaction of data.added) {
        const rules = applyRuleBasedCategory(
          transaction.name,
          transaction.merchant_name ?? null,
          transaction.amount,
        );

        try {
          await prisma.transaction.upsert({
            where: { plaidTransactionId: transaction.transaction_id },
            update: {
              date: transaction.date,
              authorizedDate: transaction.authorized_date,
              name: transaction.name,
              merchantName: transaction.merchant_name,
              amount: transaction.amount,
              pending: transaction.pending,
              categoryPrimary: rules.categoryPrimary || transaction.personal_finance_category?.primary,
              categoryDetailed: transaction.personal_finance_category?.detailed,
            },
            create: {
              userId: item.userId,
              plaidTransactionId: transaction.transaction_id,
              accountId: transaction.account_id,
              date: transaction.date,
              authorizedDate: transaction.authorized_date,
              name: transaction.name,
              merchantName: transaction.merchant_name,
              amount: transaction.amount,
              isoCurrencyCode: transaction.iso_currency_code,
              pending: transaction.pending,
              paymentChannel: transaction.payment_channel,
              categoryPrimary: rules.categoryPrimary || transaction.personal_finance_category?.primary,
              categoryDetailed: transaction.personal_finance_category?.detailed,
              isFoodCandidate: rules.isFoodCandidate,
              isTransportationCandidate: rules.isTransportationCandidate,
              isUtilityCandidate: rules.isUtilityCandidate,
              isTenantPaymentCandidate: rules.isTenantPaymentCandidate,
            },
          });
          addedCount++;
        } catch (e) {
          console.error(`Error saving transaction ${transaction.transaction_id}`, e);
        }
      }

      // Handle Modified
      for (const transaction of data.modified) {
        const rules = applyRuleBasedCategory(
          transaction.name,
          transaction.merchant_name ?? null,
          transaction.amount,
        );

        await prisma.transaction.update({
          where: { plaidTransactionId: transaction.transaction_id },
          data: {
            date: transaction.date,
            authorizedDate: transaction.authorized_date,
            name: transaction.name,
            merchantName: transaction.merchant_name,
            amount: transaction.amount,
            pending: transaction.pending,
            categoryPrimary: rules.categoryPrimary || transaction.personal_finance_category?.primary,
            categoryDetailed: transaction.personal_finance_category?.detailed,
          },
        });
        modifiedCount++;
      }

      // Handle Removed
      for (const transaction of data.removed) {
        if (transaction.transaction_id) {
          await prisma.transaction.delete({
            where: { plaidTransactionId: transaction.transaction_id },
          });
          removedCount++;
        }
      }

      cursor = data.next_cursor;
      hasMore = data.has_more;
    }

    // Update cursor in DB
    await prisma.plaidItem.update({
      where: { id: item.id },
      data: { cursor },
    });

    // Refresh DB balances from free/cached /accounts/get (not paid Balance).
    try {
      await syncCachedAccountsForItem(item.id, item.userId);
    } catch (accountErr) {
      console.error(`Failed to sync cached accounts for item ${item.id}`, accountErr);
    }

    return { added: addedCount, modified: modifiedCount, removed: removedCount };
  } catch (err) {
    console.error(`Failed to sync transactions for item ${item.id}`, err);
    throw err;
  } finally {
    inFlightSyncs.delete(item.id);
  }
}
