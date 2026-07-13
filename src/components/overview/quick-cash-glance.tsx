"use client";

import { formatCurrency } from "@/lib/format";
import type { TodayCashFlow } from "@/lib/cash-flow";

type Props = {
  today: TodayCashFlow;
  status?: string;
  warning?: string;
  onExpand?: () => void;
};

/** Compact cash strip for Overview — finance is routine, not the main stage. */
export function QuickCashGlance({ today, status, warning, onExpand }: Props) {
  const { spentToday, dailyAllowance, remainingToday, spentPercent } = today;
  const isOver = spentToday > dailyAllowance && dailyAllowance > 0;
  const barColor = isOver ? "bg-rose-500" : spentPercent >= 80 ? "bg-amber-400" : "bg-[var(--accent)]";

  return (
    <div className="rounded-2xl bg-[var(--card-solid)] p-4 ring-1 ring-[var(--card-border)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
            Quick cash
          </p>
          <p className="text-sm text-[var(--ink-soft)] mt-0.5">
            Food/fun routine — not the main focus.
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-[var(--muted)]">
            Left today
          </p>
          <p
            className={`text-2xl font-bold tabular-nums tracking-tight ${
              isOver ? "text-rose-500" : "text-[var(--ink)]"
            }`}
          >
            {formatCurrency(Math.max(0, remainingToday))}
          </p>
        </div>
      </div>

      <div className="mt-3 h-1.5 bg-[color-mix(in_srgb,var(--ink)_12%,transparent)] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${Math.min(100, isOver ? 100 : spentPercent)}%` }}
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--muted)]">
        <span className="tabular-nums">
          {formatCurrency(spentToday)} / {formatCurrency(dailyAllowance)}
          {status ? ` · ${status.replace(/ mode/i, "")}` : ""}
        </span>
        {onExpand ? (
          <button
            type="button"
            onClick={onExpand}
            className="font-semibold text-[var(--accent-bright)] hover:brightness-110 transition"
          >
            Full cash details →
          </button>
        ) : null}
      </div>

      {warning ? (
        <p className="mt-3 text-xs text-amber-950 dark:text-amber-100 bg-amber-400/15 rounded-lg px-2.5 py-2 ring-1 ring-amber-500/25 leading-relaxed">
          {warning}
        </p>
      ) : null}
    </div>
  );
}
