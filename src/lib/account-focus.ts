export type FocusAccount = {
  id?: string;
  plaidAccountId: string;
  plaidItemId?: string;
  type: string;
  isPrimary?: boolean;
  name?: string;
  institutionName?: string | null;
  currentBalance?: number | null;
  availableBalance?: number | null;
  subtype?: string | null;
  mask?: string | null;
  updatedAt?: string | Date | null;
};

export function hasPrimarySelection(accounts: FocusAccount[]) {
  return accounts.some((account) => account.isPrimary);
}

/** Accounts the user marked as primary; if none marked, returns all accounts. */
export function getFocusAccounts(accounts: FocusAccount[]) {
  if (!hasPrimarySelection(accounts)) {
    return accounts;
  }
  return accounts.filter((account) => account.isPrimary);
}

export function getFocusDepositoryAccounts(accounts: FocusAccount[]) {
  return getFocusAccounts(accounts).filter((account) => account.type === "depository");
}

/** What Trell can actually use — prefer available over ledger current. */
export function spendableBalance(account: FocusAccount) {
  if (account.type === "credit" || account.type === "loan") {
    return Math.abs(account.currentBalance ?? 0);
  }
  return account.availableBalance ?? account.currentBalance ?? 0;
}

export function getFocusAccountPlaidIds(accounts: FocusAccount[]): Set<string> | null {
  if (!hasPrimarySelection(accounts)) {
    return null;
  }
  return new Set(getFocusAccounts(accounts).map((account) => account.plaidAccountId));
}

export function filterTransactionsByFocus<T extends { accountId: string }>(
  transactions: T[],
  accounts: FocusAccount[],
): T[] {
  const focusIds = getFocusAccountPlaidIds(accounts);
  if (!focusIds) {
    return transactions;
  }
  return transactions.filter((transaction) => focusIds.has(transaction.accountId));
}

/** Count today's spending from checking and credit cards, not just primary accounts. */
export function filterTransactionsForDailySpend<T extends { accountId: string }>(
  transactions: T[],
  accounts: FocusAccount[],
): T[] {
  const spendAccountIds = new Set(
    accounts
      .filter((account) => account.type === "depository" || account.type === "credit")
      .map((account) => account.plaidAccountId),
  );

  return transactions.filter((transaction) => spendAccountIds.has(transaction.accountId));
}

export function sumDepositoryCash(accounts: FocusAccount[]) {
  return getFocusDepositoryAccounts(accounts).reduce(
    (sum, account) => sum + spendableBalance(account),
    0,
  );
}

export function groupAccountsByInstitution(accounts: FocusAccount[]) {
  const groups = new Map<string, FocusAccount[]>();

  for (const account of accounts) {
    const key = account.institutionName ?? "Linked account";
    const existing = groups.get(key) ?? [];
    existing.push(account);
    groups.set(key, existing);
  }

  return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
}

export function summarizeAccountBuckets(accounts: FocusAccount[]) {
  const focus = getFocusAccounts(accounts);
  const focusDepository = getFocusDepositoryAccounts(accounts);

  let totalAssets = 0;
  let totalLiabilities = 0;

  for (const account of accounts) {
    if (account.type === "credit" || account.type === "loan") {
      totalLiabilities += Math.abs(account.currentBalance ?? 0);
    } else if (account.type === "depository") {
      totalAssets += spendableBalance(account);
    } else {
      totalAssets += account.currentBalance ?? 0;
    }
  }

  return {
    primaryCash: sumDepositoryCash(accounts),
    primaryAccountCount: focus.length,
    primaryDepositoryCount: focusDepository.length,
    usingPrimaryFilter: hasPrimarySelection(accounts),
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets - totalLiabilities,
  };
}
