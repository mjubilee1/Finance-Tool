import { plaidClient } from "@/lib/plaid";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { applyRuleBasedCategory } from "@/lib/categorization";

export async function syncTransactionsForItem(itemId: string) {
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
    const accessToken = decrypt(item.encryptedAccessToken);
    let cursor = item.cursor || undefined;
    let hasMore = true;

    while (hasMore) {
      const response = await plaidClient.transactionsSync({
        access_token: accessToken,
        cursor,
      });

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

    return { added: addedCount, modified: modifiedCount, removed: removedCount };
  } catch (err) {
    console.error(`Failed to sync transactions for item ${item.id}`, err);
    throw err;
  }
}
