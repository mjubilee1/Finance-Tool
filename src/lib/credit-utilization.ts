export type CreditAccountInput = {
  id?: string;
  name?: string | null;
  type: string;
  currentBalance?: number | null;
  availableBalance?: number | null;
  creditLimit?: number | null;
  aprPercent?: number | null;
  minimumPayment?: number | null;
  dueDay?: number | null;
  statementDay?: number | null;
  mask?: string | null;
};

export type CreditUtilization = {
  id?: string;
  name: string;
  balance: number;
  creditLimit: number | null;
  aprPercent: number | null;
  minimumPayment: number | null;
  dueDay: number | null;
  statementDay: number | null;
  /** 0–100 when limit is known */
  utilizationPct: number | null;
  remainingCredit: number | null;
  status: "unknown" | "ok" | "elevated" | "high" | "maxed";
  statusLabel: string;
};

function round(value: number) {
  return Math.round(value * 100) / 100;
}

export function isCreditCardAccount(account: { type: string; subtype?: string | null }) {
  return account.type === "credit";
}

export function calculateCreditUtilization(account: CreditAccountInput): CreditUtilization {
  const balance = Math.max(0, account.currentBalance ?? 0);
  const creditLimit =
    account.creditLimit != null && account.creditLimit > 0 ? account.creditLimit : null;
  const utilizationPct =
    creditLimit != null ? round(Math.min(999, (balance / creditLimit) * 100)) : null;
  const remainingCredit =
    creditLimit != null ? round(Math.max(0, creditLimit - balance)) : null;

  let status: CreditUtilization["status"] = "unknown";
  let statusLabel = "Add limit to see utilization";

  if (utilizationPct != null) {
    if (utilizationPct >= 95) {
      status = "maxed";
      statusLabel = "Nearly maxed";
    } else if (utilizationPct >= 70) {
      status = "high";
      statusLabel = "High utilization";
    } else if (utilizationPct >= 30) {
      status = "elevated";
      statusLabel = "Elevated";
    } else {
      status = "ok";
      statusLabel = "Healthy room";
    }
  }

  return {
    id: account.id,
    name: account.name ?? "Credit card",
    balance: round(balance),
    creditLimit,
    aprPercent: account.aprPercent ?? null,
    minimumPayment: account.minimumPayment ?? null,
    dueDay: account.dueDay ?? null,
    statementDay: account.statementDay ?? null,
    utilizationPct,
    remainingCredit,
    status,
    statusLabel,
  };
}

export function summarizeCreditCards(accounts: CreditAccountInput[]) {
  const cards = accounts
    .filter(isCreditCardAccount)
    .map(calculateCreditUtilization)
    .sort((a, b) => {
      const aUtil = a.utilizationPct ?? -1;
      const bUtil = b.utilizationPct ?? -1;
      return bUtil - aUtil;
    });

  const withLimits = cards.filter((card) => card.creditLimit != null);
  const totalBalance = round(cards.reduce((sum, card) => sum + card.balance, 0));
  const totalLimit = round(withLimits.reduce((sum, card) => sum + (card.creditLimit ?? 0), 0));
  const overallUtilizationPct =
    totalLimit > 0 ? round((totalBalance / totalLimit) * 100) : null;
  const missingDetails = cards.filter(
    (card) => card.creditLimit == null || card.aprPercent == null,
  ).length;

  return {
    cards,
    totalBalance,
    totalLimit: totalLimit > 0 ? totalLimit : null,
    overallUtilizationPct,
    missingDetails,
    highestAprCard: [...cards]
      .filter((card) => card.aprPercent != null)
      .sort((a, b) => (b.aprPercent ?? 0) - (a.aprPercent ?? 0))[0] ?? null,
  };
}
