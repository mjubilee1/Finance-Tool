type BriefTransaction = {
  date: string;
  amount: number;
  pending?: boolean | null;
  name?: string | null;
  merchantName?: string | null;
  categoryPrimary?: string | null;
  categoryDetailed?: string | null;
  customCategory?: string | null;
  isRecurringCandidate?: boolean | null;
  isFoodCandidate?: boolean | null;
  isTransportationCandidate?: boolean | null;
  isUtilityCandidate?: boolean | null;
};

type BriefAccount = {
  type: string;
  currentBalance?: number | null;
  availableBalance?: number | null;
};

/** Default variable/discretionary spend target most days (not bills/mortgage). */
export const DEFAULT_DISCRETIONARY_DAILY = 40;
/** Hard ceiling for the system daily discretionary allowance. */
export const MAX_DISCRETIONARY_DAILY = 60;

export type DailyBriefMetrics = {
  date: string;
  totalSpent: number;
  totalIncome: number;
  foodSpend: number;
  transportationSpend: number;
  billsSpend: number;
  discretionarySpend: number;
  /** Today's spend that counts against the discretionary daily allowance (excludes bills + gas/transport). */
  discretionarySpentToday: number;
  recurringSpend: number;
  accountBalanceTotal: number;
  cashAvailable: number;
  /** Planned discretionary allowance for the day (before subtracting today's discretionary spend). */
  dailyAllowance: number;
  /** Remaining discretionary room today (allowance minus today's discretionary spend, floored at 0). */
  safeSpendToday: number;
  safeSpendTodayReason: string;
  recentDailySpendAverage: number;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function includesAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
}

function transactionText(transaction: BriefTransaction) {
  return [
    transaction.name,
    transaction.merchantName,
    transaction.categoryPrimary,
    transaction.categoryDetailed,
    transaction.customCategory,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function formatUsd(value: number) {
  return roundCurrency(value).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

/** Date used for daily/weekly cash flow — pending debit charges often only have authorizedDate. */
export function getTransactionActivityDate(transaction: {
  date: string;
  authorizedDate?: string | null;
  pending?: boolean | null;
}) {
  if (transaction.pending && transaction.authorizedDate) {
    return transaction.authorizedDate;
  }
  return transaction.date;
}

export function isTransactionOnDate(
  transaction: {
    date: string;
    authorizedDate?: string | null;
    pending?: boolean | null;
  },
  date: string,
) {
  return getTransactionActivityDate(transaction) === date;
}

export function calculateDailyBriefMetrics(params: {
  date: string;
  transactions: BriefTransaction[];
  accounts: BriefAccount[];
}): DailyBriefMetrics {
  const { date, transactions, accounts } = params;
  const dateStart = new Date(`${date}T00:00:00.000Z`).getTime();
  const fourteenDaysAgo = new Date(dateStart - 14 * MS_PER_DAY)
    .toISOString()
    .slice(0, 10);

  const todaysTransactions = transactions.filter((transaction) => isTransactionOnDate(transaction, date));
  const recentExpenseTransactions = transactions.filter(
    (transaction) =>
      !transaction.pending &&
      transaction.amount > 0 &&
      getTransactionActivityDate(transaction) >= fourteenDaysAgo &&
      getTransactionActivityDate(transaction) < date,
  );

  let totalSpent = 0;
  let totalIncome = 0;
  let foodSpend = 0;
  let transportationSpend = 0;
  let billsSpend = 0;
  let recurringSpend = 0;
  let pendingDiscretionaryToday = 0;

  for (const transaction of todaysTransactions) {
    if (transaction.amount < 0) {
      totalIncome += Math.abs(transaction.amount);
      continue;
    }

    if (transaction.amount === 0) continue;

    const amount = transaction.amount;
    const text = transactionText(transaction);

    totalSpent += amount;

    const isFood =
      Boolean(transaction.isFoodCandidate) ||
      includesAny(text, ["food", "restaurant", "dining", "grocery", "coffee"]);
    const isTransport =
      Boolean(transaction.isTransportationCandidate) ||
      includesAny(text, ["transport", "gas", "fuel", "parking", "uber"]);
    const isBill =
      Boolean(transaction.isUtilityCandidate) ||
      includesAny(text, [
        "rent",
        "mortgage",
        "utility",
        "utilities",
        "insurance",
        "loan",
        "credit card",
        "irs",
        "tax",
        "subscription",
      ]);

    if (isFood) foodSpend += amount;
    if (isTransport) transportationSpend += amount;
    if (isBill) billsSpend += amount;
    if (transaction.isRecurringCandidate) recurringSpend += amount;

    // Discretionary = food/fun/shopping/leak — not bills and not gas/transport operating costs.
    if (transaction.pending && !isTransport && !isBill) {
      pendingDiscretionaryToday += amount;
    }
  }

  const discretionarySpentToday = Math.max(
    0,
    totalSpent - billsSpend - transportationSpend,
  );

  const cashAvailable = accounts
    .filter((account) => account.type === "depository")
    .reduce((sum, account) => sum + (account.availableBalance ?? account.currentBalance ?? 0), 0);

  const accountBalanceTotal = accounts.reduce((sum, account) => {
    const balance = account.currentBalance ?? 0;
    if (account.type === "credit" || account.type === "loan") {
      return sum - Math.abs(balance);
    }

    return sum + balance;
  }, 0);

  const recentDailySpendAverage =
    recentExpenseTransactions.reduce((sum, transaction) => sum + transaction.amount, 0) / 14;
  const protectedBuffer = Math.max(500, cashAvailable * 0.25);
  const spendableCash = Math.max(0, cashAvailable - protectedBuffer);
  // Cash only tightens the discretionary target — never treat checking÷14 as the budget.
  // That old formula produced ~$270/day (~$8k/mo) from a normal checking balance.
  const cashSupportedDaily = spendableCash / 14;
  const dailyLimitBeforeToday =
    cashAvailable <= 0
      ? 0
      : Math.min(
          DEFAULT_DISCRETIONARY_DAILY,
          MAX_DISCRETIONARY_DAILY,
          cashSupportedDaily,
        );
  const dailyAllowance = roundCurrency(dailyLimitBeforeToday);
  const safeSpendToday = Math.max(0, dailyAllowance - discretionarySpentToday);

  const reason =
    cashAvailable <= 0
      ? "No depository cash balance is available yet, so the safe daily spend is held at $0 until balances sync."
      : pendingDiscretionaryToday > 0
        ? `About $${DEFAULT_DISCRETIONARY_DAILY}/day is for food/fun/variable spend. Gas, car operating costs, and bills do not eat this number. Includes ${formatUsd(pendingDiscretionaryToday)} in pending discretionary charges.`
        : cashSupportedDaily < DEFAULT_DISCRETIONARY_DAILY
          ? `Cash buffer is the protected floor in checking (${formatUsd(protectedBuffer)}). Above that floor, variable spend is tightened to about ${formatUsd(dailyAllowance)}/day until income clears.`
          : `Cash buffer (${formatUsd(protectedBuffer)}) is money you do not spend — the safety floor so a bill or late rent does not bounce you. The ~$${DEFAULT_DISCRETIONARY_DAILY}/day target is food/fun only; gas and car costs sit outside it. Capital One funds the car payment and insurance.`;

  return {
    date,
    totalSpent: roundCurrency(totalSpent),
    totalIncome: roundCurrency(totalIncome),
    foodSpend: roundCurrency(foodSpend),
    transportationSpend: roundCurrency(transportationSpend),
    billsSpend: roundCurrency(billsSpend),
    discretionarySpend: roundCurrency(discretionarySpentToday),
    discretionarySpentToday: roundCurrency(discretionarySpentToday),
    recurringSpend: roundCurrency(recurringSpend),
    accountBalanceTotal: roundCurrency(accountBalanceTotal),
    cashAvailable: roundCurrency(cashAvailable),
    dailyAllowance,
    safeSpendToday: roundCurrency(safeSpendToday),
    safeSpendTodayReason: reason,
    recentDailySpendAverage: roundCurrency(recentDailySpendAverage),
  };
}

export function applyCalculatedSafeSpend<T extends { cfoBrief?: Record<string, unknown> }>(
  insight: T,
  metrics: DailyBriefMetrics,
): T {
  const cfoBrief = insight.cfoBrief ?? {};
  const aiSafeSpend = cfoBrief.safeSpendToday;
  const hasValidAiSafeSpend = typeof aiSafeSpend === "number" && Number.isFinite(aiSafeSpend);
  // AI may return remaining room or a full-day allowance; never raise above the system cap.
  const aiImpliedAllowance = hasValidAiSafeSpend
    ? roundCurrency(aiSafeSpend + metrics.discretionarySpentToday)
    : metrics.dailyAllowance;
  const dailyAllowance = Math.min(metrics.dailyAllowance, aiImpliedAllowance);
  const remainingToday = Math.max(0, roundCurrency(dailyAllowance - metrics.discretionarySpentToday));

  return {
    ...insight,
    cfoBrief: {
      ...cfoBrief,
      safeSpendToday: remainingToday,
      safeSpendTodayReason:
        typeof cfoBrief.safeSpendTodayReason === "string" && cfoBrief.safeSpendTodayReason.trim()
          ? cfoBrief.safeSpendTodayReason
          : metrics.safeSpendTodayReason,
    },
  };
}
