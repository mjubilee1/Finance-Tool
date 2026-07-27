import { DateTime } from "luxon";
import { getTransactionActivityDate } from "@/lib/daily-brief";

/** House-hack default when all upstairs + basement rooms are occupied. */
export const DEFAULT_EXPECTED_MONTHLY_RENT = 2650;

export const FINANCIAL_EVENT_CATEGORIES = [
  "vehicle",
  "refund",
  "repair",
  "vacation",
  "tax",
  "tenant",
  "maintenance",
  "other",
] as const;

export type FinancialEventCategory = (typeof FINANCIAL_EVENT_CATEGORIES)[number];

export type TrendsAccount = {
  plaidAccountId: string;
  type: string;
  currentBalance?: number | null;
  availableBalance?: number | null;
};

export type TrendsTransaction = {
  accountId: string;
  date: string;
  authorizedDate?: string | null;
  amount: number;
  pending?: boolean | null;
  categoryPrimary?: string | null;
  name?: string | null;
  merchantName?: string | null;
  isTenantPaymentCandidate?: boolean | null;
};

export type TrendsEvent = {
  id: string;
  date: string;
  title: string;
  category: string;
  amount?: number | null;
  note?: string | null;
};

export type MonthlyTrendPoint = {
  month: string;
  label: string;
  yearLabel: string;
  isCurrentMonth: boolean;
  isPartial: boolean;
  /** Reconstructed month-end cash (depository). */
  cash: number;
  /** Reconstructed month-end debt (credit + loan). */
  debt: number;
  /** Cash + investments / other assets. */
  assets: number;
  /** assets - debt */
  netWorth: number;
  income: number;
  expenses: number;
  netCashFlow: number;
  rentCollected: number;
  expectedRent: number;
  rentCollectionPct: number | null;
  cashRolling3: number | null;
  incomeRolling3: number | null;
  expensesRolling3: number | null;
  netCashFlowRolling3: number | null;
};

export type LargeExpense = {
  date: string;
  name: string;
  amount: number;
  merchantName?: string | null;
};

export type TrendDirection = "up" | "down" | "flat";

export type TrendsInsight = {
  id: string;
  tone: "positive" | "negative" | "neutral";
  title: string;
  detail: string;
};

export type TrajectoryAnswers = {
  richerThanSixMonthsAgo: boolean | null;
  cashGrowing: boolean | null;
  debtShrinking: boolean | null;
  spendingUnderControl: boolean | null;
  rentalHelping: boolean | null;
};

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function isTransfer(transaction: TrendsTransaction) {
  return transaction.categoryPrimary?.toLowerCase().includes("transfer") ?? false;
}

function isDebtAccount(type: string) {
  return type === "credit" || type === "loan";
}

function isCashAccount(type: string) {
  return type === "depository";
}

function spendable(account: TrendsAccount) {
  if (isDebtAccount(account.type)) return 0;
  if (isCashAccount(account.type)) {
    return account.availableBalance ?? account.currentBalance ?? 0;
  }
  return account.currentBalance ?? 0;
}

function currentBuckets(accounts: TrendsAccount[]) {
  let cash = 0;
  let debt = 0;
  let investments = 0;

  for (const account of accounts) {
    if (isDebtAccount(account.type)) {
      debt += Math.abs(account.currentBalance ?? 0);
    } else if (isCashAccount(account.type)) {
      cash += spendable(account);
    } else {
      investments += account.currentBalance ?? 0;
    }
  }

  const assets = cash + investments;
  return {
    cash: roundCurrency(cash),
    debt: roundCurrency(debt),
    investments: roundCurrency(investments),
    assets: roundCurrency(assets),
    netWorth: roundCurrency(assets - debt),
  };
}

function monthKeys(months: number, referenceDate?: string) {
  const today = referenceDate
    ? DateTime.fromISO(referenceDate).startOf("day")
    : DateTime.local().startOf("day");
  const start = today.startOf("month").minus({ months: months - 1 });
  const keys: string[] = [];
  for (let i = 0; i < months; i++) {
    keys.push(start.plus({ months: i }).toFormat("yyyy-MM"));
  }
  return { keys, today, currentMonthKey: today.toFormat("yyyy-MM") };
}

function rollingAverage(values: number[], index: number, window = 3): number | null {
  if (index < window - 1) return null;
  let sum = 0;
  for (let i = index - window + 1; i <= index; i++) sum += values[i] ?? 0;
  return roundCurrency(sum / window);
}

function directionFromDelta(delta: number, flatThreshold = 50): TrendDirection {
  if (Math.abs(delta) < flatThreshold) return "flat";
  return delta > 0 ? "up" : "down";
}

/**
 * Reconstruct monthly wealth trajectory from current balances + transaction history.
 * Walks backwards from today so short-term daily noise doesn't define the story.
 */
export function buildMonthlyFinancialTrends(params: {
  accounts: TrendsAccount[];
  transactions: TrendsTransaction[];
  expectedMonthlyRent?: number;
  months?: number;
  referenceDate?: string;
  /** Optional month-key → observed net-worth from daily snapshots (calibration). */
  snapshotNetWorthByMonth?: Map<string, number> | Record<string, number>;
}): MonthlyTrendPoint[] {
  const months = params.months ?? 12;
  const expectedRent = params.expectedMonthlyRent ?? DEFAULT_EXPECTED_MONTHLY_RENT;
  const { keys, currentMonthKey } = monthKeys(months, params.referenceDate);
  const now = currentBuckets(params.accounts);
  const snapshotMap =
    params.snapshotNetWorthByMonth instanceof Map
      ? params.snapshotNetWorthByMonth
      : new Map(Object.entries(params.snapshotNetWorthByMonth ?? {}));

  const accountTypeById = new Map(
    params.accounts.map((account) => [account.plaidAccountId, account.type]),
  );

  type MonthBucket = {
    income: number;
    expenses: number;
    cashDelta: number;
    debtDelta: number;
    investmentDelta: number;
    rentCollected: number;
  };

  const byMonth = new Map<string, MonthBucket>();
  for (const key of keys) {
    byMonth.set(key, {
      income: 0,
      expenses: 0,
      cashDelta: 0,
      debtDelta: 0,
      investmentDelta: 0,
      rentCollected: 0,
    });
  }

  for (const transaction of params.transactions) {
    const activityDate = getTransactionActivityDate(transaction);
    const monthKey = DateTime.fromISO(activityDate).toFormat("yyyy-MM");
    const bucket = byMonth.get(monthKey);
    if (!bucket) continue;

    const isCurrentMonth = monthKey === currentMonthKey;
    if (!isCurrentMonth && transaction.pending) continue;

    const accountType = accountTypeById.get(transaction.accountId) ?? "depository";
    const amount = transaction.amount;

    if (isDebtAccount(accountType)) {
      // Plaid: positive on credit/loan usually increases outstanding balance.
      bucket.debtDelta += amount;
      continue;
    }

    if (isTransfer(transaction)) continue;

    if (!isCashAccount(accountType)) {
      // Investment / other: negative amount ≈ contribution in, positive ≈ withdrawal.
      bucket.investmentDelta -= amount;
      continue;
    }

    // Cash accounts: negative amount = inflow, positive = outflow.
    bucket.cashDelta -= amount;
    if (amount > 0) {
      bucket.expenses += amount;
    } else if (amount < 0) {
      const inflow = Math.abs(amount);
      bucket.income += inflow;
      if (transaction.isTenantPaymentCandidate) {
        bucket.rentCollected += inflow;
      }
    }
  }

  // Walk backwards from current balances using each month's deltas.
  const cashEnds = new Array<number>(keys.length);
  const debtEnds = new Array<number>(keys.length);
  const investmentEnds = new Array<number>(keys.length);

  cashEnds[keys.length - 1] = now.cash;
  debtEnds[keys.length - 1] = now.debt;
  investmentEnds[keys.length - 1] = now.investments;

  for (let i = keys.length - 2; i >= 0; i--) {
    const nextKey = keys[i + 1]!;
    const next = byMonth.get(nextKey)!;
    cashEnds[i] = roundCurrency(cashEnds[i + 1]! - next.cashDelta);
    debtEnds[i] = roundCurrency(Math.max(0, debtEnds[i + 1]! - next.debtDelta));
    investmentEnds[i] = roundCurrency(investmentEnds[i + 1]! - next.investmentDelta);
  }

  const points: MonthlyTrendPoint[] = keys.map((month, index) => {
    const monthDate = DateTime.fromFormat(month, "yyyy-MM");
    const bucket = byMonth.get(month)!;
    let cash = cashEnds[index]!;
    const debt = debtEnds[index]!;
    const investments = investmentEnds[index]!;
    let assets = roundCurrency(cash + investments);
    let netWorth = roundCurrency(assets - debt);

    // If we have a recorded snapshot for this month, gently calibrate net worth
    // by adjusting cash (keeps debt/investment reconstruction intact).
    const snapshotNw = snapshotMap.get(month);
    if (typeof snapshotNw === "number" && Number.isFinite(snapshotNw) && month !== currentMonthKey) {
      const adjustment = roundCurrency(snapshotNw - netWorth);
      cash = roundCurrency(cash + adjustment);
      assets = roundCurrency(cash + investments);
      netWorth = roundCurrency(assets - debt);
    }

    const income = roundCurrency(bucket.income);
    const expenses = roundCurrency(bucket.expenses);
    const rentCollected = roundCurrency(bucket.rentCollected);

    return {
      month,
      label: monthDate.toFormat("MMM"),
      yearLabel: monthDate.toFormat("MMM yyyy"),
      isCurrentMonth: month === currentMonthKey,
      isPartial: month === currentMonthKey,
      cash,
      debt,
      assets,
      netWorth,
      income,
      expenses,
      netCashFlow: roundCurrency(income - expenses),
      rentCollected,
      expectedRent,
      rentCollectionPct:
        expectedRent > 0 ? roundCurrency((rentCollected / expectedRent) * 100) : null,
      cashRolling3: null,
      incomeRolling3: null,
      expensesRolling3: null,
      netCashFlowRolling3: null,
    };
  });

  const cashValues = points.map((p) => p.cash);
  const incomeValues = points.map((p) => p.income);
  const expenseValues = points.map((p) => p.expenses);
  const netValues = points.map((p) => p.netCashFlow);

  return points.map((point, index) => ({
    ...point,
    cashRolling3: rollingAverage(cashValues, index),
    incomeRolling3: rollingAverage(incomeValues, index),
    expensesRolling3: rollingAverage(expenseValues, index),
    netCashFlowRolling3: rollingAverage(netValues, index),
  }));
}

export function findLargeExpensesThisMonth(
  transactions: TrendsTransaction[],
  referenceDate?: string,
  limit = 5,
  minAmount = 150,
): LargeExpense[] {
  const today = referenceDate
    ? DateTime.fromISO(referenceDate).startOf("day")
    : DateTime.local().startOf("day");
  const monthKey = today.toFormat("yyyy-MM");

  return transactions
    .filter((transaction) => {
      if (isTransfer(transaction) || transaction.amount < minAmount) return false;
      const activityDate = getTransactionActivityDate(transaction);
      return DateTime.fromISO(activityDate).toFormat("yyyy-MM") === monthKey;
    })
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit)
    .map((transaction) => ({
      date: getTransactionActivityDate(transaction),
      name: transaction.name ?? transaction.merchantName ?? "Expense",
      amount: roundCurrency(transaction.amount),
      merchantName: transaction.merchantName,
    }));
}

function deltaOverMonths(points: MonthlyTrendPoint[], lookback: number, field: keyof MonthlyTrendPoint) {
  if (points.length < 2) return null;
  const end = points[points.length - 1]!;
  const startIndex = Math.max(0, points.length - 1 - lookback);
  const start = points[startIndex]!;
  const endValue = Number(end[field]);
  const startValue = Number(start[field]);
  if (!Number.isFinite(endValue) || !Number.isFinite(startValue)) return null;
  return roundCurrency(endValue - startValue);
}

export function buildTrendsInsights(params: {
  points: MonthlyTrendPoint[];
  largeExpenses: LargeExpense[];
}): TrendsInsight[] {
  const { points, largeExpenses } = params;
  if (!points.length) return [];

  const insights: TrendsInsight[] = [];
  const latest = points[points.length - 1]!;

  const nw3 = deltaOverMonths(points, 3, "netWorth");
  const nw6 = deltaOverMonths(points, 6, "netWorth");
  const nw12 = deltaOverMonths(points, Math.min(12, points.length - 1), "netWorth");

  const formatSigned = (n: number) =>
    `${n >= 0 ? "+" : "-"}$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

  if (nw3 != null || nw6 != null || nw12 != null) {
    const parts = [
      nw3 != null ? `3 mo ${formatSigned(nw3)}` : null,
      nw6 != null ? `6 mo ${formatSigned(nw6)}` : null,
      nw12 != null ? `12 mo ${formatSigned(nw12)}` : null,
    ].filter(Boolean);
    const primary = nw6 ?? nw3 ?? nw12 ?? 0;
    insights.push({
      id: "net-worth",
      tone: primary > 50 ? "positive" : primary < -50 ? "negative" : "neutral",
      title:
        primary > 50
          ? "Net worth is climbing"
          : primary < -50
            ? "Net worth has slipped"
            : "Net worth is roughly flat",
      detail: `Change vs earlier months: ${parts.join(" · ")}.`,
    });
  }

  const cash3 = deltaOverMonths(points, 3, "cash");
  if (cash3 != null) {
    insights.push({
      id: "cash",
      tone: cash3 > 50 ? "positive" : cash3 < -50 ? "negative" : "neutral",
      title:
        cash3 > 50
          ? "Cash reserves trending up"
          : cash3 < -50
            ? "Cash reserves trending down"
            : "Cash reserves holding steady",
      detail: `3-month cash change ${formatSigned(cash3)}. Latest reconstructed cash ~$${latest.cash.toLocaleString("en-US", { maximumFractionDigits: 0 })}.`,
    });
  }

  const debt3 = deltaOverMonths(points, 3, "debt");
  if (debt3 != null) {
    // Lower debt is positive.
    insights.push({
      id: "debt",
      tone: debt3 < -50 ? "positive" : debt3 > 50 ? "negative" : "neutral",
      title:
        debt3 < -50
          ? "Debt is decreasing"
          : debt3 > 50
            ? "Debt is increasing"
            : "Debt is roughly stable",
      detail: `3-month debt change ${formatSigned(debt3)}. Outstanding ~$${latest.debt.toLocaleString("en-US", { maximumFractionDigits: 0 })}.`,
    });
  }

  const spendRoll = latest.expensesRolling3;
  const priorSpend =
    points.length >= 6
      ? points[points.length - 4]?.expensesRolling3
      : points.length >= 4
        ? points[points.length - 4]?.expenses
        : null;
  if (spendRoll != null && priorSpend != null) {
    const spendDelta = spendRoll - priorSpend;
    const dir = directionFromDelta(-spendDelta, 75); // spending down = improving
    insights.push({
      id: "spending",
      tone: dir === "up" ? "positive" : dir === "down" ? "negative" : "neutral",
      title:
        dir === "up"
          ? "Spending trend improving"
          : dir === "down"
            ? "Spending trend worsening"
            : "Spending trend stable",
      detail: `3-mo avg spend ~$${spendRoll.toLocaleString("en-US", { maximumFractionDigits: 0 })} vs earlier ~$${priorSpend.toLocaleString("en-US", { maximumFractionDigits: 0 })}.`,
    });
  }

  const rentMonths = points.filter((p) => !p.isPartial || p.rentCollected > 0);
  if (rentMonths.length) {
    const avgPct =
      rentMonths.reduce((sum, p) => sum + (p.rentCollectionPct ?? 0), 0) / rentMonths.length;
    const latestPct = latest.rentCollectionPct;
    insights.push({
      id: "rent",
      tone: (latestPct ?? avgPct) >= 90 ? "positive" : (latestPct ?? avgPct) >= 70 ? "neutral" : "negative",
      title: "Rental income collection",
      detail: `This month ${latest.rentCollected.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })} of ${latest.expectedRent.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })} expected (${latestPct ?? 0}%). Window average ~${Math.round(avgPct)}%.`,
    });
  }

  if (largeExpenses.length) {
    const top = largeExpenses[0]!;
    insights.push({
      id: "large-expenses",
      tone: "neutral",
      title: "Largest one-time expenses this month",
      detail: largeExpenses
        .map((e) => `${e.name}: $${e.amount.toLocaleString("en-US", { maximumFractionDigits: 0 })}`)
        .join(" · "),
    });
    void top;
  }

  return insights;
}

export function buildTrajectoryAnswers(points: MonthlyTrendPoint[]): TrajectoryAnswers {
  if (points.length < 2) {
    return {
      richerThanSixMonthsAgo: null,
      cashGrowing: null,
      debtShrinking: null,
      spendingUnderControl: null,
      rentalHelping: null,
    };
  }

  const nw6 = deltaOverMonths(points, 6, "netWorth");
  const cash3 = deltaOverMonths(points, 3, "cash");
  const debt3 = deltaOverMonths(points, 3, "debt");
  const latest = points[points.length - 1]!;
  const spendRoll = latest.expensesRolling3;
  const olderSpend = points[Math.max(0, points.length - 4)]?.expensesRolling3
    ?? points[Math.max(0, points.length - 4)]?.expenses
    ?? null;

  const rentRecent = points.slice(-3);
  const rentAvgPct =
    rentRecent.reduce((sum, p) => sum + (p.rentCollectionPct ?? 0), 0) / rentRecent.length;

  return {
    richerThanSixMonthsAgo: nw6 == null ? null : nw6 > 50,
    cashGrowing: cash3 == null ? null : cash3 > 50,
    debtShrinking: debt3 == null ? null : debt3 < -50,
    spendingUnderControl:
      spendRoll == null || olderSpend == null ? null : spendRoll <= olderSpend + 75,
    rentalHelping: rentAvgPct >= 80,
  };
}

export function eventsForMonth(events: TrendsEvent[], monthKey: string) {
  return events.filter((event) => event.date.startsWith(monthKey));
}

export function isFinancialEventCategory(value: string): value is FinancialEventCategory {
  return (FINANCIAL_EVENT_CATEGORIES as readonly string[]).includes(value);
}
