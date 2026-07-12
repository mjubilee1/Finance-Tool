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
  net: number;
  isToday: boolean;
  isFuture: boolean;
};

export type WeeklyCashFlow = {
  days: WeekDaySummary[];
  weekSpent: number;
  weekIncome: number;
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

function spendBucket(transaction: CashFlowTransaction): string {
  const text = [
    transaction.name,
    transaction.merchantName,
    transaction.categoryPrimary,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

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
  referenceDate?: string;
}): WeeklyCashFlow {
  const { transactions, dailyAllowance } = params;
  const today = params.referenceDate
    ? DateTime.fromISO(params.referenceDate)
    : DateTime.local();
  const weekStart = today.startOf("week");

  const settled = transactions.filter((t) => !t.pending && !isTransfer(t));

  const days: WeekDaySummary[] = [];
  let weekSpent = 0;
  let weekIncome = 0;

  for (let i = 0; i < 7; i++) {
    const day = weekStart.plus({ days: i });
    const dateKey = day.toISODate() ?? "";
    const isToday = day.hasSame(today, "day");
    const isFuture = day > today.startOf("day");

    const dayTransactions = isToday
      ? transactions.filter((t) => !isTransfer(t) && isTransactionOnDate(t, dateKey))
      : settled.filter((t) => getTransactionActivityDate(t) === dateKey);
    let spent = 0;
    let income = 0;

    for (const t of dayTransactions) {
      if (t.amount > 0) spent += t.amount;
      else if (t.amount < 0) income += Math.abs(t.amount);
    }

    spent = roundCurrency(spent);
    income = roundCurrency(income);

    if (!isFuture) {
      weekSpent += spent;
      weekIncome += income;
    }

    days.push({
      date: dateKey,
      label: day.toFormat("EEE"),
      spent,
      income,
      net: roundCurrency(income - spent),
      isToday,
      isFuture,
    });
  }

  const daysElapsed = today.diff(weekStart, "days").days + 1;
  const weeklyBudget = roundCurrency(dailyAllowance * 7);
  const budgetToDate = roundCurrency(dailyAllowance * Math.min(7, Math.max(1, daysElapsed)));
  const budgetUsedPercent =
    budgetToDate > 0 ? Math.min(100, roundCurrency((weekSpent / budgetToDate) * 100)) : 0;

  let paceStatus: WeeklyCashFlow["paceStatus"] = "on_track";
  let paceMessage = `On pace for the week — ${formatPaceDelta(weekSpent, budgetToDate)}.`;

  if (budgetUsedPercent >= 100) {
    paceStatus = "at_risk";
    paceMessage = `Over weekly budget by ${formatCurrencyDelta(weekSpent - budgetToDate)} with ${7 - daysElapsed} day(s) left.`;
  } else if (budgetUsedPercent >= 85) {
    paceStatus = "behind";
    paceMessage = `${formatCurrencyDelta(budgetToDate - weekSpent)} left in this week's allowance — spending is tight.`;
  } else if (budgetUsedPercent <= 60 && daysElapsed >= 3) {
    paceStatus = "ahead";
    paceMessage = `Ahead of plan by ${formatCurrencyDelta(budgetToDate - weekSpent)} so far this week.`;
  }

  return {
    days,
    weekSpent: roundCurrency(weekSpent),
    weekIncome: roundCurrency(weekIncome),
    weekNet: roundCurrency(weekIncome - weekSpent),
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

function formatPaceDelta(spent: number, budget: number) {
  const delta = budget - spent;
  if (Math.abs(delta) < 1) return "right on target";
  return delta > 0 ? `${formatCurrencyDelta(delta)} under budget` : `${formatCurrencyDelta(delta)} over budget`;
}

export function calculateGoalPace(params: {
  targetAmount: number;
  currentAmount: number;
  targetDate?: string | null;
  netDailyAverage: number;
}): GoalPace {
  const { targetAmount, currentAmount, targetDate, netDailyAverage } = params;
  const remaining = roundCurrency(Math.max(0, targetAmount - currentAmount));

  if (remaining <= 0) {
    return {
      remaining: 0,
      dailyContribution: netDailyAverage,
      daysToComplete: 0,
      projectedDate: null,
      monthsToComplete: 0,
      tenDollarsFasterDays: null,
      onTrack: true,
      paceMessage: "Goal reached.",
    };
  }

  const dailyContribution = Math.max(0, netDailyAverage);

  if (dailyContribution <= 0) {
    return {
      remaining,
      dailyContribution: 0,
      daysToComplete: null,
      projectedDate: null,
      monthsToComplete: null,
      tenDollarsFasterDays: null,
      onTrack: false,
      paceMessage: "Current cash flow won't fund this goal — reduce spending or increase income.",
    };
  }

  const daysToComplete = Math.ceil(remaining / dailyContribution);
  const projected = DateTime.local().plus({ days: daysToComplete });
  const projectedDate = projected.toISODate();
  const monthsToComplete = roundCurrency(daysToComplete / 30);

  let onTrack = true;
  let paceMessage = `At current pace, on track by ${projected.toFormat("MMM d, yyyy")}.`;

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
