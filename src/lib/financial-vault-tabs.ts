/** Tabs that show balances, bills, banks, property money — gated when vault is on. */
export const FINANCIAL_VAULT_TABS = [
  "overview",
  "finance",
  "accounts",
  "transactions",
  "recurring",
  "projections",
  "financial-trends",
  "car",
  "home",
  "goals",
] as const;

export function isFinancialVaultTab(tab: string) {
  return (FINANCIAL_VAULT_TABS as readonly string[]).includes(tab);
}
