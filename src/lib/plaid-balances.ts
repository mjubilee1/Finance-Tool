export type BalanceRefreshMeta = {
  usedCachedBalances: boolean;
  balanceCallsToday: number;
  balanceCallLimit: number;
  balanceCallsRemaining: number;
  refreshedItems?: number;
};

export async function refreshPlaidBalances(): Promise<BalanceRefreshMeta> {
  const response = await fetch("/api/plaid/accounts");
  const data = (await response.json().catch(() => ({}))) as {
    error?: string;
    balanceRefresh?: BalanceRefreshMeta;
  };

  if (!response.ok) {
    throw new Error(data.error ?? "Failed to refresh account balances.");
  }

  return (
    data.balanceRefresh ?? {
      usedCachedBalances: false,
      balanceCallsToday: 0,
      balanceCallLimit: 0,
      balanceCallsRemaining: 0,
    }
  );
}

export function isBalanceStale(updatedAt: string | Date | null | undefined, maxAgeMinutes = 30) {
  if (!updatedAt) return true;
  const updatedMs = new Date(updatedAt).getTime();
  if (Number.isNaN(updatedMs)) return true;
  return Date.now() - updatedMs > maxAgeMinutes * 60 * 1000;
}

export function getOldestAccountUpdate(accounts: Array<{ updatedAt?: string | Date | null }>) {
  let oldest: number | null = null;
  for (const account of accounts) {
    if (!account.updatedAt) return null;
    const ms = new Date(account.updatedAt).getTime();
    if (Number.isNaN(ms)) return null;
    oldest = oldest == null ? ms : Math.min(oldest, ms);
  }
  return oldest == null ? null : new Date(oldest);
}
