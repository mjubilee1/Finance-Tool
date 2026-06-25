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

export type DailyBriefMetrics = {
  date: string;
  totalSpent: number;
  totalIncome: number;
  foodSpend: number;
  transportationSpend: number;
  billsSpend: number;
  discretionarySpend: number;
  recurringSpend: number;
  accountBalanceTotal: number;
  cashAvailable: number;
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
  let pendingSpendToday = 0;

  for (const transaction of todaysTransactions) {
    if (transaction.amount < 0) {
      totalIncome += Math.abs(transaction.amount);
      continue;
    }

    if (transaction.amount === 0) continue;

    const amount = transaction.amount;
    const text = transactionText(transaction);

    totalSpent += amount;
    if (transaction.pending) {
      pendingSpendToday += amount;
    }

    if (
      transaction.isFoodCandidate ||
      includesAny(text, ["food", "restaurant", "dining", "grocery", "coffee"])
    ) {
      foodSpend += amount;
    }

    if (
      transaction.isTransportationCandidate ||
      includesAny(text, ["transport", "gas", "fuel", "parking", "uber", "lyft"])
    ) {
      transportationSpend += amount;
    }

    if (
      transaction.isUtilityCandidate ||
      includesAny(text, ["rent", "mortgage", "utility", "utilities", "insurance", "loan", "credit card"])
    ) {
      billsSpend += amount;
    }

    if (transaction.isRecurringCandidate) {
      recurringSpend += amount;
    }
  }

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
  const cashBasedAllowance = spendableCash / 14;
  const trendBasedAllowance = recentDailySpendAverage > 0 ? recentDailySpendAverage * 0.85 : cashBasedAllowance;
  const dailyLimitBeforeToday = Math.min(cashBasedAllowance, trendBasedAllowance);
  const safeSpendToday = Math.max(0, dailyLimitBeforeToday - totalSpent);

  const reason =
    cashAvailable > 0
      ? pendingSpendToday > 0
        ? `Includes ${roundCurrency(pendingSpendToday).toLocaleString("en-US", {
            style: "currency",
            currency: "USD",
          })} in pending debit/card charges that may still change when they post.`
        : `Uses available checking cash, protects a ${roundCurrency(protectedBuffer).toLocaleString("en-US", {
            style: "currency",
            currency: "USD",
          })} buffer, and subtracts today's spending.`
      : "No depository cash balance is available yet, so the safe daily spend is held at $0 until balances sync.";

  return {
    date,
    totalSpent: roundCurrency(totalSpent),
    totalIncome: roundCurrency(totalIncome),
    foodSpend: roundCurrency(foodSpend),
    transportationSpend: roundCurrency(transportationSpend),
    billsSpend: roundCurrency(billsSpend),
    discretionarySpend: roundCurrency(Math.max(0, totalSpent - billsSpend)),
    recurringSpend: roundCurrency(recurringSpend),
    accountBalanceTotal: roundCurrency(accountBalanceTotal),
    cashAvailable: roundCurrency(cashAvailable),
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
  const calculatedAllowance = roundCurrency(metrics.totalSpent + metrics.safeSpendToday);
  const dailyAllowance = hasValidAiSafeSpend
    ? Math.min(calculatedAllowance, roundCurrency(aiSafeSpend + metrics.totalSpent))
    : calculatedAllowance;
  const remainingToday = Math.max(0, roundCurrency(dailyAllowance - metrics.totalSpent));

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
