"use client";

import { formatCurrency } from "@/lib/format";
import type { TodayCashFlow } from "@/lib/cash-flow";

type Props = {
  today: TodayCashFlow;
  status?: string;
};

export function TodayCashFlowMeter({ today, status }: Props) {
  const { spentToday, dailyAllowance, remainingToday, spentPercent } = today;
  const isOver = spentToday > dailyAllowance && dailyAllowance > 0;
  const barColor = isOver ? "bg-rose-500" : spentPercent >= 80 ? "bg-amber-400" : "bg-teal-500";

  return (
    <div className="app-hero-gradient app-card-elevated p-6 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <p className="app-label mb-1">Safe spend</p>
          <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <span className="bg-teal-500 w-2 h-2 rounded-full" />
            Today&apos;s cash flow
          </h2>
          {status && (
            <p className="text-slate-500 text-sm mt-1 capitalize">{status.replace(/ mode/i, "")}</p>
          )}
        </div>
        <div className="text-right">
          <p className="app-label">Left today</p>
          <p
            className={`text-4xl font-bold tracking-tight tabular-nums ${
              isOver ? "text-rose-600" : "text-teal-700"
            }`}
          >
            {formatCurrency(Math.max(0, remainingToday))}
          </p>
        </div>
      </div>

      <div className="rounded-2xl bg-white/80 backdrop-blur-sm p-5 ring-1 ring-slate-200/60">
        <div className="flex justify-between text-sm mb-3">
          <div>
            <p className="app-label mb-0.5">Spent</p>
            <p className="font-semibold text-slate-900 tabular-nums">{formatCurrency(spentToday)}</p>
          </div>
          <div className="text-right">
            <p className="app-label mb-0.5">Allowance</p>
            <p className="font-semibold text-slate-900 tabular-nums">{formatCurrency(dailyAllowance)}</p>
          </div>
        </div>

        <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${Math.min(100, isOver ? 100 : spentPercent)}%` }}
          />
        </div>

        <p className="text-xs text-slate-500 mt-2.5 text-center">
          {isOver
            ? `${formatCurrency(spentToday - dailyAllowance)} over today's allowance`
            : spentToday === 0
              ? "No posted or pending spending counted yet today — tap Refresh after new charges."
              : `${Math.round(spentPercent)}% of today's safe spend used`}
        </p>
      </div>
    </div>
  );
}
