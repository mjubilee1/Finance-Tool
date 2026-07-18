import { prisma } from "@/lib/prisma";
import { decrypt, isTokenDecryptError } from "@/lib/encryption";

function accountMatchKey(account: {
  mask: string | null;
  type: string;
  subtype: string | null;
  name: string;
}) {
  const mask = account.mask?.trim() || "";
  const subtype = account.subtype?.trim() || "";
  if (mask) return `${account.type}|${subtype}|${mask}`;
  return `${account.type}|${subtype}|${account.name.trim().toLowerCase()}`;
}

/**
 * When the user re-links the same bank, Plaid issues a new item_id + account_ids.
 * Retire older items for that institution, migrate primary/credit prefs, and remap
 * transactions so history stays attached to the new accounts.
 */
export async function retireStaleItemsForInstitution(params: {
  userId: string;
  keepPlaidItemId: string;
  institutionId: string | null;
  institutionName: string | null;
}) {
  const { userId, keepPlaidItemId, institutionId, institutionName } = params;

  const whereClauses = [];
  if (institutionId) whereClauses.push({ institutionId });
  if (institutionName) whereClauses.push({ institutionName });
  if (whereClauses.length === 0) {
    return { retiredItems: 0, retiredAccounts: 0, remappedTransactions: 0 };
  }

  const staleItems = await prisma.plaidItem.findMany({
    where: {
      userId,
      plaidItemId: { not: keepPlaidItemId },
      OR: whereClauses,
    },
  });

  if (staleItems.length === 0) {
    return { retiredItems: 0, retiredAccounts: 0, remappedTransactions: 0 };
  }

  const staleItemIds = staleItems.map((item) => item.plaidItemId);
  const oldAccounts = await prisma.financialAccount.findMany({
    where: { userId, plaidItemId: { in: staleItemIds } },
  });
  const newAccounts = await prisma.financialAccount.findMany({
    where: { userId, plaidItemId: keepPlaidItemId },
  });

  const newByKey = new Map(newAccounts.map((account) => [accountMatchKey(account), account]));
  let remappedTransactions = 0;

  for (const old of oldAccounts) {
    const match = newByKey.get(accountMatchKey(old));
    if (!match) continue;

    await prisma.financialAccount.update({
      where: { id: match.id },
      data: {
        isPrimary: match.isPrimary || old.isPrimary,
        creditLimit: match.creditLimit ?? old.creditLimit,
        aprPercent: match.aprPercent ?? old.aprPercent,
        minimumPayment: match.minimumPayment ?? old.minimumPayment,
        dueDay: match.dueDay ?? old.dueDay,
        statementDay: match.statementDay ?? old.statementDay,
      },
    });

    if (old.plaidAccountId !== match.plaidAccountId) {
      const result = await prisma.transaction.updateMany({
        where: { userId, accountId: old.plaidAccountId },
        data: { accountId: match.plaidAccountId },
      });
      remappedTransactions += result.count;
    }
  }

  const deletedAccounts = await prisma.financialAccount.deleteMany({
    where: { userId, plaidItemId: { in: staleItemIds } },
  });

  await prisma.plaidItem.deleteMany({
    where: { userId, plaidItemId: { in: staleItemIds } },
  });

  console.log(
    `[PLAID RECONNECT] retired ${staleItems.length} stale item(s) for ${institutionName ?? institutionId} keep=${keepPlaidItemId} accounts=${deletedAccounts.count} txRemapped=${remappedTransactions}`,
  );

  return {
    retiredItems: staleItems.length,
    retiredAccounts: deletedAccounts.count,
    remappedTransactions,
  };
}

/**
 * After reconnects, remove old Items whose tokens no longer decrypt when a working
 * Item already exists for the same institution. Unblocks Sync and clears duplicates.
 */
export async function cleanupUndecryptableDuplicateItems(userId: string) {
  const items = await prisma.plaidItem.findMany({ where: { userId } });
  if (items.length <= 1) {
    return { removedInstitutions: 0 };
  }

  const working: typeof items = [];
  const broken: typeof items = [];

  for (const item of items) {
    try {
      decrypt(item.encryptedAccessToken, {
        itemId: item.id,
        label: `cleanup:${item.institutionName ?? item.plaidItemId}`,
      });
      working.push(item);
    } catch (error) {
      if (isTokenDecryptError(error)) {
        broken.push(item);
      } else {
        throw error;
      }
    }
  }

  if (broken.length === 0 || working.length === 0) {
    return { removedInstitutions: 0 };
  }

  const keepByInstitution = new Map<string, (typeof items)[number]>();
  for (const item of working) {
    const key = item.institutionId || item.institutionName;
    if (!key) continue;
    const existing = keepByInstitution.get(key);
    if (!existing || item.updatedAt > existing.updatedAt) {
      keepByInstitution.set(key, item);
    }
  }

  let removedInstitutions = 0;
  for (const keep of keepByInstitution.values()) {
    const hasBrokenTwin = broken.some(
      (item) =>
        (keep.institutionId && item.institutionId === keep.institutionId) ||
        (keep.institutionName && item.institutionName === keep.institutionName),
    );
    if (!hasBrokenTwin) continue;

    await retireStaleItemsForInstitution({
      userId,
      keepPlaidItemId: keep.plaidItemId,
      institutionId: keep.institutionId,
      institutionName: keep.institutionName,
    });
    removedInstitutions++;
  }

  return { removedInstitutions };
}
