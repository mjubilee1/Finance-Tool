"use client";

import { formatCurrency } from "@/lib/format";
import type { WeeklyCashFlow } from "@/lib/cash-flow";

type Props = {
  weekly: WeeklyCashFlow;
};

const paceStyles = {
  ahead: "bg-teal-50 text-teal-800 ring-teal-200/60",
  on_track: "bg-slate-50 text-slate-700 ring-slate-200/60",
  behind: "bg-amber-50 text-amber-800 ring-amber-200/60",
  at_risk: "bg-rose-50 text-rose-800 ring-rose-200/60",
};

export function WeeklyCashFlowStrip({ weekly }: Props) {
  const { days, weekSpent, weekIncome, weekNet, weeklyBudget, budgetUsedPercent, paceStatus, paceMessage } =
    weekly;

  return (
    <div className="app-card p-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
        <div>
          <p className="app-label mb-1">This week</p>
          <h2 className="text-lg font-semibold text-slate-900 tracking-tight">Weekly cash flow</h2>
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
                ? "bg-teal-600 text-white ring-teal-600 shadow-sm"
                : day.isFuture
                  ? "bg-slate-50 ring-slate-100 text-slate-400"
                  : "bg-white ring-slate-200/70 text-slate-700"
            }`}
          >
            <p className="text-[10px] sm:text-xs font-medium uppercase opacity-80">{day.label}</p>
            <p className="text-sm sm:text-base font-bold mt-0.5 tabular-nums">
              {new Date(`${day.date}T12:00:00`).getDate()}
            </p>
            {!day.isFuture && (
              <p
                className={`text-[10px] sm:text-xs mt-1 font-medium tabular-nums ${
                  day.isToday ? "text-teal-100" : "text-slate-500"
                }`}
              >
                {day.spent > 0 ? formatCurrency(day.spent) : "—"}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Spent", value: weekSpent, className: "text-slate-900" },
          { label: "Income", value: weekIncome, className: "text-teal-700" },
          {
            label: "Net",
            value: weekNet,
            className: weekNet >= 0 ? "text-teal-700" : "text-rose-600",
          },
          { label: "Week budget", value: weeklyBudget, className: "text-slate-900", sub: `${Math.round(budgetUsedPercent)}% used` },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl bg-slate-50/80 p-3 ring-1 ring-slate-200/50">
            <p className="app-label">{stat.label}</p>
            <p className={`text-lg font-bold tabular-nums ${stat.className}`}>{formatCurrency(stat.value)}</p>
            {stat.sub && <p className="text-[10px] text-slate-500 mt-0.5">{stat.sub}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
