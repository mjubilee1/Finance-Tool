import { DateTime } from "luxon";
import { formatCurrency } from "@/lib/format";

export type DebtMonthStatus =
  | "no_plan"
  | "treading_water"
  | "behind"
  | "on_track"
  | "ahead"
  | "done";

export type DebtMonthSummary = {
  monthKey: string;
  monthLabel: string;
  monthPaid: number;
  monthlyPlan: number | null;
  remainingToPlan: number;
  /** 0–100 vs this month's plan (100 if no plan but something was logged) */
  monthProgressPct: number;
  status: DebtMonthStatus;
  /** Short label for badges */
  statusLabel: string;
  /** Coach-style sentence for the card */
  message: string;
};

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

export function currentGoalMonthKey(now = DateTime.local()) {
  return now.toFormat("yyyy-MM");
}

export function summarizeDebtMonth(params: {
  monthPaid: number;
  monthlyPlan?: number | null;
  totalPaid?: number;
  targetAmount?: number;
  now?: DateTime;
}): DebtMonthSummary {
  const now = params.now ?? DateTime.local();
  const monthKey = currentGoalMonthKey(now);
  const monthLabel = now.toFormat("LLLL yyyy");
  const monthPaid = roundCurrency(Math.max(0, params.monthPaid || 0));
  const monthlyPlan =
    params.monthlyPlan != null &&
    Number.isFinite(params.monthlyPlan) &&
    params.monthlyPlan > 0
      ? roundCurrency(params.monthlyPlan)
      : null;
  const targetAmount =
    params.targetAmount != null && params.targetAmount > 0 ? params.targetAmount : null;
  const totalPaid = roundCurrency(Math.max(0, params.totalPaid ?? 0));
  const goalDone = targetAmount != null && totalPaid >= targetAmount;

  if (goalDone) {
    return {
      monthKey,
      monthLabel,
      monthPaid,
      monthlyPlan,
      remainingToPlan: 0,
      monthProgressPct: 100,
      status: "done",
      statusLabel: "Paid off",
      message: "Debt goal reached — protect the win and point surplus at the next highest APR.",
    };
  }

  if (monthlyPlan == null) {
    const status: DebtMonthStatus = monthPaid > 0 ? "on_track" : "no_plan";
    return {
      monthKey,
      monthLabel,
      monthPaid,
      monthlyPlan: null,
      remainingToPlan: 0,
      monthProgressPct: monthPaid > 0 ? 100 : 0,
      status,
      statusLabel: monthPaid > 0 ? "Principal logged" : "Set monthly plan",
      message:
        monthPaid > 0
          ? `${formatCurrency(monthPaid)} principal logged in ${monthLabel}. Set a monthly plan so you can see if you're shrinking the balance or just treading water.`
          : `Set a monthly principal plan, then log extras when you pay — minimums alone usually mean treading water.`,
    };
  }

  const remainingToPlan = roundCurrency(Math.max(0, monthlyPlan - monthPaid));
  const monthProgressPct = Math.min(
    100,
    roundCurrency((monthPaid / monthlyPlan) * 100),
  );
  const dayOfMonth = now.day;
  const daysInMonth = now.daysInMonth || 30;
  /** Expected by now if paying evenly across the month */
  const expectedByNow = roundCurrency(monthlyPlan * (dayOfMonth / daysInMonth));

  let status: DebtMonthStatus;
  let statusLabel: string;
  let message: string;

  if (monthPaid <= 0) {
    status = "treading_water";
    statusLabel = "Treading water";
    message = `Nothing beyond minimums logged in ${monthLabel}. Plan is ${formatCurrency(monthlyPlan)}/mo toward principal — log extras when cash allows so this stops feeling stuck.`;
  } else if (monthPaid + 0.009 >= monthlyPlan) {
    status = "ahead";
    statusLabel = "Paying down";
    message =
      monthPaid > monthlyPlan + 0.009
        ? `Ahead — ${formatCurrency(monthPaid)} principal this month vs a ${formatCurrency(monthlyPlan)} plan. That frees optionality.`
        : `On plan — ${formatCurrency(monthPaid)} of ${formatCurrency(monthlyPlan)} principal this month. Real paydown, not treading water.`;
  } else if (monthPaid + 0.009 >= expectedByNow * 0.85 || monthProgressPct >= 50) {
    status = "on_track";
    statusLabel = "On track";
    message = `${formatCurrency(monthPaid)} of ${formatCurrency(monthlyPlan)} principal this month — ${formatCurrency(remainingToPlan)} left to hit the plan.`;
  } else if (monthPaid < monthlyPlan * 0.25 && dayOfMonth >= 10) {
    status = "treading_water";
    statusLabel = "Treading water";
    message = `Only ${formatCurrency(monthPaid)} of ${formatCurrency(monthlyPlan)} principal logged so far this month. Minimums keep the lights on; extras shrink the balance.`;
  } else {
    status = "behind";
    statusLabel = "Behind plan";
    message = `${formatCurrency(monthPaid)} of ${formatCurrency(monthlyPlan)} this month — ${formatCurrency(remainingToPlan)} still to go if you want real paydown, not tread water.`;
  }

  return {
    monthKey,
    monthLabel,
    monthPaid,
    monthlyPlan,
    remainingToPlan,
    monthProgressPct,
    status,
    statusLabel,
    message,
  };
}

/** Sum contribution amounts for a month key. */
export function sumContributionsForMonth(
  contributions: Array<{ amount: number; monthKey: string }>,
  monthKey: string,
) {
  return roundCurrency(
    contributions
      .filter((row) => row.monthKey === monthKey)
      .reduce((sum, row) => sum + (Number.isFinite(row.amount) ? row.amount : 0), 0),
  );
}
