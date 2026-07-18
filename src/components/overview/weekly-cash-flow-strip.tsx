"use client";

import { formatCurrency } from "@/lib/format";
import type { WeeklyCashFlow } from "@/lib/cash-flow";
import { CAR_FUNDED_BY } from "@/lib/car";

type Props = {
  weekly: WeeklyCashFlow;
};

const paceStyles = {
  ahead: "bg-[var(--accent-soft)] text-[var(--accent-strong)] dark:text-[var(--accent-bright)] ring-[color-mix(in_srgb,var(--accent)_30%,transparent)]",
  on_track: "bg-[color-mix(in_srgb,var(--ink)_6%,transparent)] text-[var(--ink-soft)] ring-[var(--card-border)]",
  behind: "bg-amber-500/15 text-amber-900 dark:text-amber-200 ring-amber-400/35",
  at_risk: "bg-rose-500/15 text-rose-800 dark:text-rose-300 ring-rose-400/35",
};

export function WeeklyCashFlowStrip({ weekly }: Props) {
  const {
    days,
    weekSpent,
    weekNet,
    baseWeeklyIncome,
    baseDailyIncome,
    extraIncome,
    budgetUsedPercent,
    paceStatus,
    paceMessage,
  } = weekly;

  return (
    <div className="app-card p-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
        <div>
          <p className="app-label mb-1">This week</p>
          <h2 className="text-lg font-semibold text-[var(--ink)] tracking-tight">Weekly cash flow</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Paycheck is spread across 7 days; extra deposits land when they post. Car payment and
            insurance come from {CAR_FUNDED_BY}.
          </p>
        </div>
        <div className={`rounded-xl px-3 py-2 text-sm font-medium ring-1 ${paceStyles[paceStatus]}`}>
          {paceMessage}
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-5">
        {days.map((day) => (
          <div
            key={day.date}
            className={`rounded-xl p-2 sm:p-3 text-center transition-colors ring-1 ${
              day.isToday
                ? "bg-[var(--accent)] text-white ring-[var(--accent)] shadow-sm"
                : day.isFuture
                  ? "bg-[color-mix(in_srgb,var(--ink)_5%,transparent)] ring-[var(--card-border)] text-[var(--muted)]"
                  : "bg-[var(--card-solid)] ring-[var(--card-border)] text-[var(--ink-soft)]"
            }`}
          >
            <p className="text-[10px] sm:text-xs font-medium uppercase opacity-80">{day.label}</p>
            <p className="text-sm sm:text-base font-bold mt-0.5 tabular-nums">
              {new Date(`${day.date}T12:00:00`).getDate()}
            </p>
            <p
              className={`text-[10px] sm:text-xs mt-1 font-medium tabular-nums ${
                day.isToday
                  ? "text-white/85"
                  : day.net >= 0
                    ? "text-[var(--accent-strong)] dark:text-[var(--accent-bright)]"
                    : "text-rose-500"
              }`}
            >
              {formatSignedCurrency(day.net)}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Cost so far", value: weekSpent, className: "text-[var(--ink)]" },
          {
            label: "Base pay",
            value: baseWeeklyIncome,
            className: "text-[var(--accent-strong)] dark:text-[var(--accent-bright)]",
            sub: `${formatCurrency(baseDailyIncome)}/day`,
          },
          {
            label: "Other deposits",
            value: extraIncome,
            className: "text-[var(--accent-strong)] dark:text-[var(--accent-bright)]",
          },
          {
            label: "Cash flow",
            value: weekNet,
            className: weekNet >= 0 ? "text-[var(--accent-strong)] dark:text-[var(--accent-bright)]" : "text-rose-500",
            signed: true,
          },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl bg-[color-mix(in_srgb,var(--ink)_5%,transparent)] p-3 ring-1 ring-[var(--card-border)]">
            <p className="app-label">{stat.label}</p>
            <p className={`text-lg font-bold tabular-nums ${stat.className}`}>
              {stat.signed ? formatSignedCurrency(stat.value) : formatCurrency(stat.value)}
            </p>
            {stat.sub && <p className="text-[10px] text-[var(--muted)] mt-0.5">{stat.sub}</p>}
          </div>
        ))}
      </div>
      <p className="mt-3 text-[10px] text-[var(--muted)]">
        Logged costs have absorbed {Math.round(budgetUsedPercent)}% of base weekly pay.
      </p>
    </div>
  );
}

function formatSignedCurrency(amount: number) {
  if (Math.abs(amount) < 0.01) return "$0.00";
  return `${amount > 0 ? "+" : "-"}${formatCurrency(Math.abs(amount))}`;
}
