import { prisma } from "@/lib/prisma";

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

function institutionKey(item: {
  institutionId: string | null;
  institutionName: string | null;
}) {
  return item.institutionId || item.institutionName || null;
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
 * Always keep one Plaid Item per institution (newest updatedAt wins).
 * Clears reconnect duplicates even when old tokens still decrypt via key recovery.
 */
export async function dedupePlaidItemsByInstitution(userId: string) {
  const items = await prisma.plaidItem.findMany({ where: { userId } });
  if (items.length <= 1) {
    return { removedInstitutions: 0, removedAccounts: 0 };
  }

  const keepByInstitution = new Map<string, (typeof items)[number]>();
  for (const item of items) {
    const key = institutionKey(item);
    if (!key) continue;
    const existing = keepByInstitution.get(key);
    if (!existing || item.updatedAt > existing.updatedAt) {
      keepByInstitution.set(key, item);
    }
  }

  let removedInstitutions = 0;
  let removedAccounts = 0;

  for (const keep of keepByInstitution.values()) {
    const twins = items.filter(
      (item) =>
        item.plaidItemId !== keep.plaidItemId &&
        ((keep.institutionId && item.institutionId === keep.institutionId) ||
          (keep.institutionName && item.institutionName === keep.institutionName)),
    );
    if (twins.length === 0) continue;

    const result = await retireStaleItemsForInstitution({
      userId,
      keepPlaidItemId: keep.plaidItemId,
      institutionId: keep.institutionId,
      institutionName: keep.institutionName,
    });
    removedInstitutions += result.retiredItems > 0 ? 1 : 0;
    removedAccounts += result.retiredAccounts;
  }

  // Safety net: same mask/type under different item ids (orphans).
  const accountCleanup = await dedupeFinancialAccountsByMask(userId);
  removedAccounts += accountCleanup.removedAccounts;

  return { removedInstitutions, removedAccounts };
}

/** @deprecated use dedupePlaidItemsByInstitution */
export async function cleanupUndecryptableDuplicateItems(userId: string) {
  return dedupePlaidItemsByInstitution(userId);
}

/**
 * If duplicate account rows remain (same mask + type), keep the newest and remap txs.
 */
async function dedupeFinancialAccountsByMask(userId: string) {
  const accounts = await prisma.financialAccount.findMany({ where: { userId } });
  if (accounts.length <= 1) {
    return { removedAccounts: 0 };
  }

  const groups = new Map<string, typeof accounts>();
  for (const account of accounts) {
    const key = accountMatchKey(account);
    const list = groups.get(key) ?? [];
    list.push(account);
    groups.set(key, list);
  }

  let removedAccounts = 0;

  for (const group of groups.values()) {
    if (group.length < 2) continue;

    group.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    const [keep, ...dupes] = group;

    for (const dupe of dupes) {
      await prisma.financialAccount.update({
        where: { id: keep.id },
        data: {
          isPrimary: keep.isPrimary || dupe.isPrimary,
          creditLimit: keep.creditLimit ?? dupe.creditLimit,
          aprPercent: keep.aprPercent ?? dupe.aprPercent,
          minimumPayment: keep.minimumPayment ?? dupe.minimumPayment,
          dueDay: keep.dueDay ?? dupe.dueDay,
          statementDay: keep.statementDay ?? dupe.statementDay,
        },
      });

      if (dupe.plaidAccountId !== keep.plaidAccountId) {
        await prisma.transaction.updateMany({
          where: { userId, accountId: dupe.plaidAccountId },
          data: { accountId: keep.plaidAccountId },
        });
      }

      await prisma.financialAccount.delete({ where: { id: dupe.id } });
      removedAccounts++;
    }
  }

  if (removedAccounts > 0) {
    console.log(`[PLAID RECONNECT] deduped ${removedAccounts} duplicate account row(s) for user ${userId}`);
  }

  return { removedAccounts };
}
