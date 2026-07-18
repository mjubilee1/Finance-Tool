import { DateTime } from "luxon";
import type { DailyBriefMetrics } from "./daily-brief";
import { getTransactionActivityDate, isTransactionOnDate } from "./daily-brief";

type CashFlowTransaction = {
  date: string;
  authorizedDate?: string | null;
  amount: number;
  pending?: boolean | null;
  categoryPrimary?: string | null;
  name?: string | null;
  merchantName?: string | null;
};

const DEFAULT_WEEKLY_BASE_INCOME = 1555.27;

export type DailySpendBreakdownItem = {
  label: string;
  amount: number;
};

export type DailySpendPoint = {
  date: string;
  totalSpent: number;
  breakdown?: DailySpendBreakdownItem[];
  topMerchants?: DailySpendBreakdownItem[];
};

export type WeekDaySummary = {
  date: string;
  label: string;
  spent: number;
  income: number;
  baseIncome: number;
  extraIncome: number;
  net: number;
  isToday: boolean;
  isFuture: boolean;
};

export type MonthlyCashFlowPoint = {
  month: string;
  label: string;
  income: number;
  spent: number;
  net: number;
  isCurrentMonth: boolean;
  isPartial: boolean;
};

export type WeeklyCashFlow = {
  days: WeekDaySummary[];
  weekSpent: number;
  weekIncome: number;
  baseWeeklyIncome: number;
  baseDailyIncome: number;
  extraIncome: number;
  weekNet: number;
  weeklyBudget: number;
  budgetToDate: number;
  budgetUsedPercent: number;
  paceStatus: "ahead" | "on_track" | "behind" | "at_risk";
  paceMessage: string;
};

export type TodayCashFlow = {
  spentToday: number;
  incomeToday: number;
  dailyAllowance: number;
  remainingToday: number;
  spentPercent: number;
};

export type GoalPace = {
  remaining: number;
  dailyContribution: number;
  daysToComplete: number | null;
  projectedDate: string | null;
  monthsToComplete: number | null;
  tenDollarsFasterDays: number | null;
  onTrack: boolean;
  paceMessage: string;
};

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function isTransfer(transaction: CashFlowTransaction) {
  return transaction.categoryPrimary?.toLowerCase().includes("transfer") ?? false;
}

function transactionText(transaction: CashFlowTransaction) {
  return [
    transaction.name,
    transaction.merchantName,
    transaction.categoryPrimary,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function isLikelyBasePaycheck(transaction: CashFlowTransaction) {
  if (transaction.amount >= 0) return false;

  const amount = Math.abs(transaction.amount);
  const text = transactionText(transaction);

  return (
    /\b(payroll|paycheck|direct dep|direct deposit|salary|w2|employer|amergis)\b/.test(text) ||
    (text.includes("income") && amount >= 1200 && amount <= 2000)
  );
}

function inferWeeklyBaseIncome(transactions: CashFlowTransaction[]) {
  const paychecks = transactions
    .filter((transaction) => !transaction.pending && !isTransfer(transaction) && isLikelyBasePaycheck(transaction))
    .map((transaction) => Math.abs(transaction.amount))
    .filter((amount) => Number.isFinite(amount) && amount > 0);

  if (paychecks.length === 0) return DEFAULT_WEEKLY_BASE_INCOME;

  const average = paychecks.reduce((sum, amount) => sum + amount, 0) / paychecks.length;
  return roundCurrency(average);
}

function spendBucket(transaction: CashFlowTransaction): string {
  const text = transactionText(transaction);

  if (
    text.includes("food") ||
    text.includes("restaurant") ||
    text.includes("dining") ||
    text.includes("grocery") ||
    text.includes("coffee") ||
    text.includes("bakery")
  ) {
    return "Food";
  }
  if (
    text.includes("gas") ||
    text.includes("fuel") ||
    text.includes("transport") ||
    text.includes("uber") ||
    text.includes("lyft") ||
    text.includes("parking") ||
    text.includes("shell") ||
    text.includes("bp ") ||
    text.includes("sunoco") ||
    text.includes("marathon")
  ) {
    return "Gas / rides";
  }
  if (
    text.includes("utility") ||
    text.includes("utilities") ||
    text.includes("mortgage") ||
    text.includes("insurance") ||
    text.includes("rent") ||
    text.includes("pepco") ||
    text.includes("interest") ||
    text.includes("loan")
  ) {
    return "Bills / interest";
  }
  if (
    text.includes("merchandise") ||
    text.includes("shopping") ||
    text.includes("amazon") ||
    text.includes("target") ||
    text.includes("h&m") ||
    text.includes("apple")
  ) {
    return "Shopping";
  }
  if (text.includes("entertainment") || text.includes("netflix") || text.includes("spotify")) {
    return "Entertainment";
  }
  return "Other";
}

function topAmounts(map: Map<string, number>, limit: number): DailySpendBreakdownItem[] {
  return Array.from(map.entries())
    .map(([label, amount]) => ({ label, amount: roundCurrency(amount) }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

/** Last N calendar months of actual income, spend, and net (not projections). */
export function buildMonthlyCashFlowSeries(
  transactions: CashFlowTransaction[],
  months = 6,
  referenceDate?: string,
): MonthlyCashFlowPoint[] {
  const today = referenceDate
    ? DateTime.fromISO(referenceDate).startOf("day")
    : DateTime.local().startOf("day");
  const currentMonthKey = today.toFormat("yyyy-MM");
  const startMonth = today.startOf("month").minus({ months: months - 1 });

  const byMonth = new Map<string, { income: number; spent: number }>();
  for (let i = 0; i < months; i++) {
    const month = startMonth.plus({ months: i });
    const key = month.toFormat("yyyy-MM");
    byMonth.set(key, { income: 0, spent: 0 });
  }

  for (const transaction of transactions) {
    if (isTransfer(transaction)) continue;

    const activityDate = getTransactionActivityDate(transaction);
    const monthKey = DateTime.fromISO(activityDate).toFormat("yyyy-MM");
    const bucket = byMonth.get(monthKey);
    if (!bucket) continue;

    const isCurrentMonth = monthKey === currentMonthKey;
    if (!isCurrentMonth && transaction.pending) continue;

    if (transaction.amount > 0) {
      bucket.spent += transaction.amount;
    } else if (transaction.amount < 0) {
      bucket.income += Math.abs(transaction.amount);
    }
  }

  return Array.from(byMonth.entries()).map(([month, totals]) => {
    const monthDate = DateTime.fromFormat(month, "yyyy-MM");
    const income = roundCurrency(totals.income);
    const spent = roundCurrency(totals.spent);
    const isCurrentMonth = month === currentMonthKey;

    return {
      month,
      label: monthDate.toFormat("MMM"),
      income,
      spent,
      net: roundCurrency(income - spent),
      isCurrentMonth,
      isPartial: isCurrentMonth,
    };
  });
}

/** Last N days of spending from transactions (not snapshot rows). */
export function buildDailySpendSeries(
  transactions: CashFlowTransaction[],
  days = 30,
  referenceDate?: string,
): DailySpendPoint[] {
  const today = referenceDate
    ? DateTime.fromISO(referenceDate).startOf("day")
    : DateTime.local().startOf("day");
  const start = today.minus({ days: days - 1 });
  const startKey = start.toISODate() ?? "";
  const todayKey = today.toISODate() ?? "";

  const byDate = new Map<
    string,
    { total: number; buckets: Map<string, number>; merchants: Map<string, number> }
  >();
  for (let i = 0; i < days; i++) {
    const key = start.plus({ days: i }).toISODate();
    if (key) byDate.set(key, { total: 0, buckets: new Map(), merchants: new Map() });
  }

  for (const transaction of transactions) {
    if (isTransfer(transaction) || transaction.amount <= 0) continue;
    const activityDate = getTransactionActivityDate(transaction);
    if (activityDate < startKey || activityDate > todayKey) continue;
    const day = byDate.get(activityDate);
    if (!day) continue;

    const amount = transaction.amount;
    day.total += amount;

    const bucket = spendBucket(transaction);
    day.buckets.set(bucket, (day.buckets.get(bucket) ?? 0) + amount);

    const merchant = (transaction.merchantName || transaction.name || "Unknown").trim();
    day.merchants.set(merchant, (day.merchants.get(merchant) ?? 0) + amount);
  }

  return Array.from(byDate.entries()).map(([date, day]) => ({
    date,
    totalSpent: roundCurrency(day.total),
    breakdown: topAmounts(day.buckets, 6),
    topMerchants: topAmounts(day.merchants, 4),
  }));
}

export function calculateNetDailyAverage(
  transactions: CashFlowTransaction[],
  days = 14,
): number {
  const cutoff = DateTime.local().minus({ days }).toISODate() ?? "";
  const settled = transactions.filter(
    (t) => !t.pending && !isTransfer(t) && t.date >= cutoff,
  );

  let spend = 0;
  let income = 0;
  for (const t of settled) {
    if (t.amount > 0) spend += t.amount;
    else if (t.amount < 0) income += Math.abs(t.amount);
  }

  return roundCurrency((income - spend) / Math.max(1, days));
}

export function calculateTodayCashFlow(
  metrics: Pick<
    DailyBriefMetrics,
    | "totalSpent"
    | "totalIncome"
    | "safeSpendToday"
    | "dailyAllowance"
    | "discretionarySpentToday"
  >,
): TodayCashFlow {
  const spentToday = metrics.discretionarySpentToday;
  const remainingToday = Math.max(0, metrics.safeSpendToday);
  const dailyAllowance = roundCurrency(
    metrics.dailyAllowance > 0
      ? metrics.dailyAllowance
      : spentToday + remainingToday,
  );
  const spentPercent =
    dailyAllowance > 0 ? roundCurrency((spentToday / dailyAllowance) * 100) : 0;

  return {
    spentToday,
    incomeToday: metrics.totalIncome,
    dailyAllowance,
    remainingToday,
    spentPercent,
  };
}

export function calculateWeeklyCashFlow(params: {
  transactions: CashFlowTransaction[];
  dailyAllowance: number;
  weeklyBaseIncome?: number | null;
  referenceDate?: string;
}): WeeklyCashFlow {
  const { transactions, dailyAllowance } = params;
  const today = params.referenceDate
    ? DateTime.fromISO(params.referenceDate)
    : DateTime.local();
  const weekStart = today.startOf("week");

  const settled = transactions.filter((t) => !t.pending && !isTransfer(t));
  const baseWeeklyIncome =
    params.weeklyBaseIncome != null && Number.isFinite(params.weeklyBaseIncome) && params.weeklyBaseIncome > 0
      ? roundCurrency(params.weeklyBaseIncome)
      : inferWeeklyBaseIncome(settled);
  const baseDailyIncome = roundCurrency(baseWeeklyIncome / 7);

  const days: WeekDaySummary[] = [];
  let weekSpent = 0;
  let extraIncome = 0;

  for (let i = 0; i < 7; i++) {
    const day = weekStart.plus({ days: i });
    const dateKey = day.toISODate() ?? "";
    const isToday = day.hasSame(today, "day");
    const isFuture = day > today.startOf("day");

    const dayTransactions = isToday
      ? transactions.filter((t) => !isTransfer(t) && isTransactionOnDate(t, dateKey))
      : settled.filter((t) => getTransactionActivityDate(t) === dateKey);
    let spent = 0;
    let dayExtraIncome = 0;

    for (const t of dayTransactions) {
      if (t.amount > 0) spent += t.amount;
      else if (t.amount < 0 && !isLikelyBasePaycheck(t)) dayExtraIncome += Math.abs(t.amount);
    }

    spent = roundCurrency(spent);
    dayExtraIncome = roundCurrency(dayExtraIncome);
    const income = roundCurrency(baseDailyIncome + dayExtraIncome);

    if (!isFuture) {
      weekSpent += spent;
      extraIncome += dayExtraIncome;
    }

    days.push({
      date: dateKey,
      label: day.toFormat("EEE"),
      spent,
      baseIncome: baseDailyIncome,
      extraIncome: dayExtraIncome,
      income,
      net: roundCurrency(income - spent),
      isToday,
      isFuture,
    });
  }

  const daysElapsed = today.diff(weekStart, "days").days + 1;
  const weekIncome = roundCurrency(baseWeeklyIncome + extraIncome);
  const weeklyBudget = baseWeeklyIncome;
  const budgetToDate = roundCurrency(
    baseDailyIncome * Math.min(7, Math.max(1, daysElapsed)),
  );
  const budgetUsedPercent =
    weeklyBudget > 0 ? Math.min(100, roundCurrency((weekSpent / weeklyBudget) * 100)) : 0;

  let paceStatus: WeeklyCashFlow["paceStatus"] = "on_track";
  const weekNet = roundCurrency(weekIncome - weekSpent);
  let paceMessage = `${formatSignedCurrency(weekNet)} projected weekly cash flow after costs logged so far.`;

  if (weekNet < 0) {
    paceStatus = "at_risk";
    paceMessage = `${formatCurrencyDelta(Math.abs(weekNet))} short after this week's logged costs. Hold cash.`;
  } else if (budgetUsedPercent >= 85) {
    paceStatus = "behind";
    paceMessage = `${Math.round(budgetUsedPercent)}% of weekly pay is already absorbed by costs.`;
  } else if (weekNet >= dailyAllowance * 7 && daysElapsed >= 3) {
    paceStatus = "ahead";
    paceMessage = `${formatSignedCurrency(weekNet)} projected weekly cushion after logged costs.`;
  }

  return {
    days,
    weekSpent: roundCurrency(weekSpent),
    weekIncome,
    baseWeeklyIncome,
    baseDailyIncome,
    extraIncome: roundCurrency(extraIncome),
    weekNet,
    weeklyBudget,
    budgetToDate,
    budgetUsedPercent,
    paceStatus,
    paceMessage,
  };
}

function formatCurrencyDelta(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Math.abs(amount));
}

function formatSignedCurrency(amount: number) {
  const formatted = formatCurrencyDelta(amount);
  if (Math.abs(amount) < 1) return "$0";
  return amount > 0 ? `+${formatted}` : `-${formatted}`;
}

export function calculateGoalPace(params: {
  targetAmount: number;
  currentAmount: number;
  targetDate?: string | null;
  netDailyAverage: number;
  /** Planned monthly redirect (e.g. $15 from canceled sub) */
  monthlyContribution?: number | null;
  category?: string | null;
}): GoalPace {
  const {
    targetAmount,
    currentAmount,
    targetDate,
    netDailyAverage,
    monthlyContribution,
    category,
  } = params;
  const remaining = roundCurrency(Math.max(0, targetAmount - currentAmount));
  const plannedMonthly =
    monthlyContribution != null && Number.isFinite(monthlyContribution) && monthlyContribution > 0
      ? monthlyContribution
      : null;
  const plannedDaily = plannedMonthly != null ? plannedMonthly / 30 : 0;

  if (remaining <= 0) {
    return {
      remaining: 0,
      dailyContribution: Math.max(netDailyAverage, plannedDaily),
      daysToComplete: 0,
      projectedDate: null,
      monthsToComplete: 0,
      tenDollarsFasterDays: null,
      onTrack: true,
      paceMessage: "Goal reached.",
    };
  }

  // Prefer planned redirect over "leftover cash flow" when the goal is a debt redirect plan.
  const dailyContribution = Math.max(0, netDailyAverage, plannedDaily);

  if (dailyContribution <= 0) {
    return {
      remaining,
      dailyContribution: 0,
      daysToComplete: null,
      projectedDate: null,
      monthsToComplete: null,
      tenDollarsFasterDays: null,
      onTrack: false,
      paceMessage:
        category === "debt_payoff"
          ? "Set a monthly principal plan and log extras when you pay — minimums alone usually mean treading water."
          : "Current cash flow won't fund this goal — reduce spending or increase income.",
    };
  }

  const daysToComplete = Math.ceil(remaining / dailyContribution);
  const projected = DateTime.local().plus({ days: daysToComplete });
  const projectedDate = projected.toISODate();
  const monthsToComplete = roundCurrency(daysToComplete / 30);

  let onTrack = true;
  let paceMessage =
    plannedMonthly != null && plannedMonthly >= netDailyAverage * 30
      ? `Plan: ${formatCurrencyDelta(plannedMonthly)}/mo toward this — on track by ${projected.toFormat("MMM d, yyyy")}.`
      : `At current pace, on track by ${projected.toFormat("MMM d, yyyy")}.`;

  if (category === "debt_payoff" && plannedMonthly != null) {
    paceMessage = `Plan ${formatCurrencyDelta(plannedMonthly)}/mo toward principal (beyond minimums) — log each payment so you can see real paydown vs treading water. On pace by ${projected.toFormat("MMM d, yyyy")}.`;
  }

  if (targetDate) {
    const target = DateTime.fromISO(targetDate);
    if (projected > target) {
      onTrack = false;
      const daysLate = Math.ceil(projected.diff(target, "days").days);
      paceMessage = `About ${daysLate} day(s) behind target — cut ~$10/day to close the gap faster.`;
    }
  }

  const tenDollarsFasterDays =
    dailyContribution + 10 > 0 ? Math.ceil(remaining / (dailyContribution + 10)) : null;

  return {
    remaining,
    dailyContribution,
    daysToComplete,
    projectedDate,
    monthsToComplete,
    tenDollarsFasterDays:
      tenDollarsFasterDays !== null && daysToComplete > 0
        ? daysToComplete - tenDollarsFasterDays
        : null,
    onTrack,
    paceMessage,
  };
}

export type CalendarDay = {
  date: string;
  dayLabel: string;
  dayNum: number;
  isToday: boolean;
  bills: string[];
  income: string[];
};

export function buildBillCalendar(days = 14): CalendarDay[] {
  const today = DateTime.local();
  const result: CalendarDay[] = [];

  for (let i = 0; i < days; i++) {
    const day = today.plus({ days: i });
    result.push({
      date: day.toISODate() ?? "",
      dayLabel: day.toFormat("EEE"),
      dayNum: day.day,
      isToday: i === 0,
      bills: [],
      income: [],
    });
  }

  return result;
}

export function getStatusStyle(status?: string) {
  const normalized = status?.toLowerCase() ?? "";
  if (normalized.includes("attack")) {
    return {
      bg: "bg-sky-500/15",
      text: "text-sky-800 dark:text-sky-300",
      dot: "bg-sky-500",
      ring: "ring-sky-400/40",
    };
  }
  if (normalized.includes("conservative") || normalized.includes("tight")) {
    return {
      bg: "bg-amber-500/15",
      text: "text-amber-900 dark:text-amber-200",
      dot: "bg-amber-500",
      ring: "ring-amber-400/40",
    };
  }
  if (normalized.includes("stable")) {
    return {
      bg: "bg-[var(--accent-soft)]",
      text: "text-[var(--accent-strong)] dark:text-[var(--accent-bright)]",
      dot: "bg-[var(--accent)]",
      ring: "ring-[color-mix(in_srgb,var(--accent)_35%,transparent)]",
    };
  }
  return {
    bg: "bg-[color-mix(in_srgb,var(--ink)_8%,transparent)]",
    text: "text-[var(--ink-soft)]",
    dot: "bg-[var(--muted)]",
    ring: "ring-[var(--card-border)]",
  };
}
