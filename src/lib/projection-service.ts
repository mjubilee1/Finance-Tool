import { DateTime } from "luxon";

const DAYS_PER_MONTH = 30.4375;
const MAX_HISTORY_MONTHS = 6;

export type ProjectionTransaction = {
  id: string;
  date: string;
  amount: number;
  pending?: boolean | null;
  name?: string | null;
  merchantName?: string | null;
  categoryPrimary?: string | null;
};

export type ProjectionRecurringPattern = {
  normalizedName: string;
  averageAmount: number;
  frequency: string;
  lastSeen: string;
  confidenceScore: number;
  direction: string;
};

export type ProjectionPoint = {
  date: string;
  projectedBalance: number;
  cumulativeRecurringIncome: number;
  cumulativeRecurringSpend: number;
  cumulativeVariableIncome: number;
  cumulativeVariableSpend: number;
};

export type MonthlyProjectionHistory = {
  month: string;
  income: number;
  spend: number;
  net: number;
  incomeChangeRate: number | null;
  spendChangeRate: number | null;
};

export type CashFlowProjection = {
  points: ProjectionPoint[];
  history: MonthlyProjectionHistory[];
  assumptions: {
    spendMonthlyRate: number;
    incomeMonthlyRate: number;
    variableMonthlySpend: number;
    variableMonthlyIncome: number;
    recurringMonthlySpend: number;
    recurringMonthlyIncome: number;
    recurringExpenseCount: number;
    recurringIncomeCount: number;
    completedMonthsAnalyzed: number;
    method: "transaction_mom_rate";
  };
  averageDailySpend: number;
  averageDailyIncome: number;
  netDailyAverage: number;
  daysAnalyzed: number;
};

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function isTransfer(transaction: ProjectionTransaction) {
  return transaction.categoryPrimary?.toLowerCase().includes("transfer") ?? false;
}

function normalizeName(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[0-9]/g, "")
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function monthlyEquivalent(amount: number, frequency: string) {
  const absolute = Math.abs(amount);
  if (frequency === "weekly") return absolute * (DAYS_PER_MONTH / 7);
  if (frequency === "bi-weekly") return absolute * (DAYS_PER_MONTH / 14);
  if (frequency === "monthly") return absolute;
  return 0;
}

function weightedAverage(values: number[]) {
  if (values.length === 0) return 0;
  const recent = values.slice(-3);
  let weightedTotal = 0;
  let totalWeight = 0;
  recent.forEach((value, index) => {
    const weight = index + 1;
    weightedTotal += value * weight;
    totalWeight += weight;
  });
  return weightedTotal / totalWeight;
}

function calculateRate(values: number[], minimum: number, maximum: number) {
  const changes: number[] = [];
  for (let index = 1; index < values.length; index += 1) {
    const previous = values[index - 1];
    if (previous <= 0) continue;
    changes.push((values[index] - previous) / previous);
  }
  if (changes.length === 0) return 0;
  return Math.min(maximum, Math.max(minimum, weightedAverage(changes)));
}

function weekdayFactors(
  transactions: ProjectionTransaction[],
  direction: "income" | "spend",
) {
  const totals = Array.from({ length: 7 }, () => 0);
  const dayCounts = Array.from({ length: 7 }, () => 0);
  const uniqueDates = new Set(transactions.map((transaction) => transaction.date));

  for (const date of uniqueDates) {
    const parsed = DateTime.fromISO(date);
    if (parsed.isValid) dayCounts[parsed.weekday - 1] += 1;
  }

  for (const transaction of transactions) {
    const parsed = DateTime.fromISO(transaction.date);
    if (!parsed.isValid) continue;
    if (direction === "spend" && transaction.amount > 0) {
      totals[parsed.weekday - 1] += transaction.amount;
    }
    if (direction === "income" && transaction.amount < 0) {
      totals[parsed.weekday - 1] += Math.abs(transaction.amount);
    }
  }

  const averages = totals.map((total, index) => total / Math.max(1, dayCounts[index]));
  const overall = averages.reduce((sum, value) => sum + value, 0) / 7;
  if (overall <= 0) return Array.from({ length: 7 }, () => 1);
  return averages.map((value) => Math.max(0.2, Math.min(3, value / overall)));
}

function nextOccurrence(lastSeen: DateTime, frequency: string) {
  if (frequency === "weekly") return lastSeen.plus({ days: 7 });
  if (frequency === "bi-weekly") return lastSeen.plus({ days: 14 });
  if (frequency === "monthly") return lastSeen.plus({ months: 1 });
  return null;
}

function recurringEvents(
  patterns: ProjectionRecurringPattern[],
  today: DateTime,
  horizonDays: number,
) {
  const end = today.plus({ days: horizonDays });
  const events = new Map<string, { income: number; spend: number }>();

  for (const pattern of patterns) {
    if (
      pattern.confidenceScore < 0.7 ||
      !["weekly", "bi-weekly", "monthly"].includes(pattern.frequency)
    ) {
      continue;
    }

    let occurrence: DateTime = DateTime.fromISO(pattern.lastSeen);
    if (!occurrence.isValid) continue;
    while (occurrence <= today) {
      const next = nextOccurrence(occurrence, pattern.frequency);
      if (!next) break;
      occurrence = next;
    }

    while (occurrence <= end) {
      const key = occurrence.toISODate();
      if (key) {
        const event = events.get(key) ?? { income: 0, spend: 0 };
        if (pattern.direction === "income") event.income += Math.abs(pattern.averageAmount);
        else event.spend += Math.abs(pattern.averageAmount);
        events.set(key, event);
      }
      const next = nextOccurrence(occurrence, pattern.frequency);
      if (!next) break;
      occurrence = next;
    }
  }

  return events;
}

export function buildCashFlowProjection(params: {
  transactions: ProjectionTransaction[];
  recurringPatterns: ProjectionRecurringPattern[];
  currentBalance: number;
  referenceDate: string;
  horizonDays?: number;
}): CashFlowProjection {
  const horizonDays = params.horizonDays ?? 180;
  const today = DateTime.fromISO(params.referenceDate).startOf("day");
  const currentMonth = today.startOf("month");
  const historyStart = currentMonth.minus({ months: MAX_HISTORY_MONTHS });
  const historyStartKey = historyStart.toISODate() ?? "";
  const todayKey = today.toISODate() ?? "";

  const settled = params.transactions.filter(
    (transaction) =>
      !transaction.pending &&
      !isTransfer(transaction) &&
      transaction.date >= historyStartKey &&
      transaction.date <= todayKey,
  );
  const activePatterns = params.recurringPatterns.filter(
    (pattern) =>
      pattern.confidenceScore >= 0.7 &&
      ["weekly", "bi-weekly", "monthly"].includes(pattern.frequency),
  );
  const recurringNames = new Set(activePatterns.map((pattern) => pattern.normalizedName));
  const variableTransactions = settled.filter((transaction) => {
    const name = normalizeName(transaction.merchantName || transaction.name);
    return !recurringNames.has(name);
  });

  const completedMonths = Array.from({ length: MAX_HISTORY_MONTHS }, (_, index) =>
    historyStart.plus({ months: index }),
  );
  const historyBase = completedMonths.map((month) => {
    const key = month.toFormat("yyyy-MM");
    let income = 0;
    let spend = 0;
    for (const transaction of variableTransactions) {
      if (!transaction.date.startsWith(key)) continue;
      if (transaction.amount > 0) spend += transaction.amount;
      else if (transaction.amount < 0) income += Math.abs(transaction.amount);
    }
    return { month: key, income, spend };
  });

  const monthsWithActivity = historyBase.filter((month) => month.income > 0 || month.spend > 0);
  const spendValues = monthsWithActivity.map((month) => month.spend);
  const incomeValues = monthsWithActivity.map((month) => month.income);
  const spendMonthlyRate = calculateRate(spendValues, -0.1, 0.15);
  const incomeMonthlyRate = calculateRate(incomeValues, -0.1, 0.1);
  const variableMonthlySpend = weightedAverage(spendValues);
  const variableMonthlyIncome = weightedAverage(incomeValues);

  const history: MonthlyProjectionHistory[] = historyBase.map((month, index) => {
    const previous = index > 0 ? historyBase[index - 1] : null;
    return {
      month: month.month,
      income: roundMoney(month.income),
      spend: roundMoney(month.spend),
      net: roundMoney(month.income - month.spend),
      incomeChangeRate:
        previous && previous.income > 0
          ? roundMoney((month.income - previous.income) / previous.income)
          : null,
      spendChangeRate:
        previous && previous.spend > 0
          ? roundMoney((month.spend - previous.spend) / previous.spend)
          : null,
    };
  });

  const recurringMonthlyIncome = activePatterns
    .filter((pattern) => pattern.direction === "income")
    .reduce(
      (sum, pattern) => sum + monthlyEquivalent(pattern.averageAmount, pattern.frequency),
      0,
    );
  const recurringMonthlySpend = activePatterns
    .filter((pattern) => pattern.direction !== "income")
    .reduce(
      (sum, pattern) => sum + monthlyEquivalent(pattern.averageAmount, pattern.frequency),
      0,
    );
  const events = recurringEvents(activePatterns, today, horizonDays);
  const spendFactors = weekdayFactors(variableTransactions, "spend");
  const incomeFactors = weekdayFactors(variableTransactions, "income");
  const averageSpendFactor = spendFactors.reduce((sum, value) => sum + value, 0) / 7;
  const averageIncomeFactor = incomeFactors.reduce((sum, value) => sum + value, 0) / 7;

  let cumulativeRecurringIncome = 0;
  let cumulativeRecurringSpend = 0;
  let cumulativeVariableIncome = 0;
  let cumulativeVariableSpend = 0;
  const points: ProjectionPoint[] = [];

  for (let dayIndex = 0; dayIndex <= horizonDays; dayIndex += 1) {
    const date = today.plus({ days: dayIndex });
    if (dayIndex > 0) {
      const event = events.get(date.toISODate() ?? "");
      cumulativeRecurringIncome += event?.income ?? 0;
      cumulativeRecurringSpend += event?.spend ?? 0;

      const monthOffset = Math.max(
        0,
        (date.year - currentMonth.year) * 12 + date.month - currentMonth.month,
      );
      const monthSpend = variableMonthlySpend * Math.pow(1 + spendMonthlyRate, monthOffset + 1);
      const monthIncome = variableMonthlyIncome * Math.pow(1 + incomeMonthlyRate, monthOffset + 1);
      cumulativeVariableSpend +=
        (monthSpend / DAYS_PER_MONTH) *
        (spendFactors[date.weekday - 1] / averageSpendFactor);
      cumulativeVariableIncome +=
        (monthIncome / DAYS_PER_MONTH) *
        (incomeFactors[date.weekday - 1] / averageIncomeFactor);
    }

    points.push({
      date: date.toISODate() ?? "",
      projectedBalance: roundMoney(
        params.currentBalance +
          cumulativeRecurringIncome +
          cumulativeVariableIncome -
          cumulativeRecurringSpend -
          cumulativeVariableSpend,
      ),
      cumulativeRecurringIncome: roundMoney(cumulativeRecurringIncome),
      cumulativeRecurringSpend: roundMoney(cumulativeRecurringSpend),
      cumulativeVariableIncome: roundMoney(cumulativeVariableIncome),
      cumulativeVariableSpend: roundMoney(cumulativeVariableSpend),
    });
  }

  const averageDailySpend = (variableMonthlySpend + recurringMonthlySpend) / DAYS_PER_MONTH;
  const averageDailyIncome = (variableMonthlyIncome + recurringMonthlyIncome) / DAYS_PER_MONTH;
  const dates = settled.map((transaction) => transaction.date).sort();
  const daysAnalyzed =
    dates.length > 1
      ? Math.max(1, Math.round(today.diff(DateTime.fromISO(dates[0]), "days").days))
      : 1;

  return {
    points,
    history,
    assumptions: {
      spendMonthlyRate: roundMoney(spendMonthlyRate),
      incomeMonthlyRate: roundMoney(incomeMonthlyRate),
      variableMonthlySpend: roundMoney(variableMonthlySpend),
      variableMonthlyIncome: roundMoney(variableMonthlyIncome),
      recurringMonthlySpend: roundMoney(recurringMonthlySpend),
      recurringMonthlyIncome: roundMoney(recurringMonthlyIncome),
      recurringExpenseCount: activePatterns.filter((pattern) => pattern.direction !== "income").length,
      recurringIncomeCount: activePatterns.filter((pattern) => pattern.direction === "income").length,
      completedMonthsAnalyzed: monthsWithActivity.length,
      method: "transaction_mom_rate",
    },
    averageDailySpend: roundMoney(averageDailySpend),
    averageDailyIncome: roundMoney(averageDailyIncome),
    netDailyAverage: roundMoney(averageDailyIncome - averageDailySpend),
    daysAnalyzed,
  };
}
