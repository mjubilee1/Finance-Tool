export type AccountSummary = {
  accountId: string;
  itemId: string;
  institutionName: string | null;
  name: string;
  officialName: string | null;
  type: string;
  subtype: string | null;
  mask: string | null;
  currentBalance: number | null;
  availableBalance: number | null;
  isoCurrencyCode: string | null;
};

export type DashboardSummary = {
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
  accounts: AccountSummary[];
  linkedInstitutions: number;
};

export function summarizeAccounts(accounts: AccountSummary[]): DashboardSummary {
  let totalAssets = 0;
  let totalLiabilities = 0;

  for (const account of accounts) {
    const balance = account.currentBalance ?? 0;
    if (account.type === "credit" || account.type === "loan") {
      totalLiabilities += Math.abs(balance);
    } else {
      totalAssets += balance;
    }
  }

  const institutions = new Set(
    accounts.map((a) => a.institutionName).filter(Boolean),
  );

  return {
    netWorth: totalAssets - totalLiabilities,
    totalAssets,
    totalLiabilities,
    accounts,
    linkedInstitutions: institutions.size,
  };
}

export function groupAccountsByInstitution(accounts: AccountSummary[]) {
  const groups = new Map<string, AccountSummary[]>();

  for (const account of accounts) {
    const key = account.institutionName ?? "Linked account";
    const existing = groups.get(key) ?? [];
    existing.push(account);
    groups.set(key, existing);
  }

  return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
}
