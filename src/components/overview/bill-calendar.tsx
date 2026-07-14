"use client";

import { buildBillCalendar } from "@/lib/cash-flow";
import { MessageSquare } from "lucide-react";

type Props = {
  upcomingBills?: string[];
  incomeExpected?: string[];
  onAskChat?: () => void;
};

function parseScheduleItem(item: string, missingTimingLabel: string) {
  const [maybeTiming, ...detailParts] = item.split(/\s*•\s*/);
  const timing = maybeTiming.trim();

  if (detailParts.length > 0 && isTimingLabel(timing)) {
    return {
      timing,
      detail: detailParts.join(" • ").trim(),
    };
  }

  return {
    timing: missingTimingLabel,
    detail: item,
  };
}

function isTimingLabel(value: string) {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.includes("needed") ||
    /^(est\.?\s+)?(mon|tue|wed|thu|fri|sat|sun)\b/.test(normalized) ||
    /^\d{4}-\d{2}-\d{2}$/.test(normalized)
  );
}

export function BillCalendar({ upcomingBills = [], incomeExpected = [], onAskChat }: Props) {
  const calendarDays = buildBillCalendar(14);
  const hasBills = upcomingBills.length > 0;
  const hasIncome = incomeExpected.length > 0;

  return (
    <div className="app-card p-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <p className="app-label mb-1">Next 14 days</p>
          <h2 className="text-lg font-semibold text-[var(--ink)] tracking-tight">Bills & income</h2>
        </div>
        {onAskChat && (
          <button
            type="button"
            onClick={onAskChat}
            className="flex items-center gap-1.5 text-xs font-semibold text-[var(--accent-strong)] bg-[var(--accent-soft)] hover:brightness-110 px-3 py-1.5 rounded-lg ring-1 ring-[color-mix(in_srgb,var(--accent)_30%,transparent)] transition"
          >
            <MessageSquare size={14} />
            Add dates
          </button>
        )}
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-5 scrollbar-thin">
        {calendarDays.map((day) => (
          <div
            key={day.date}
            className={`shrink-0 w-11 sm:w-12 text-center rounded-xl py-2 ring-1 ${
              day.isToday
                ? "bg-[var(--accent)] text-white ring-[var(--accent)]"
                : "bg-[var(--card-solid)] ring-[var(--card-border)] text-[var(--ink-soft)]"
            }`}
          >
            <p className="text-[9px] font-medium uppercase opacity-80">{day.dayLabel}</p>
            <p className="text-sm font-bold tabular-nums">{day.dayNum}</p>
          </div>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="rounded-xl bg-rose-500/10 p-4 ring-1 ring-rose-400/30 dark:bg-rose-500/15 dark:ring-rose-400/25">
          <p className="text-[11px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-300 mb-2">
            Upcoming bills
          </p>
          {hasBills ? (
            <ul className="space-y-2 text-sm text-[var(--ink)]">
              {upcomingBills.map((bill) => {
                const parsed = parseScheduleItem(bill, "Date needed");
                return (
                  <li key={bill} className="flex items-start gap-2.5">
                    <span className="mt-0.5 shrink-0 rounded-md bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-700 ring-1 ring-rose-400/30 dark:text-rose-200">
                      {parsed.timing}
                    </span>
                    <span className="leading-relaxed">{parsed.detail}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-[var(--muted)] leading-relaxed">
              No bills identified yet. Tell your Coach when bills are due for a sharper safe spend number.
            </p>
          )}
        </div>

        <div className="rounded-xl bg-blue-500/10 p-4 ring-1 ring-blue-400/30 dark:bg-blue-500/15 dark:ring-blue-400/25">
          <p className="text-[11px] font-bold uppercase tracking-wider text-blue-800 dark:text-blue-300 mb-2">
            Income expected
          </p>
          {hasIncome ? (
            <ul className="space-y-2 text-sm text-[var(--ink)]">
              {incomeExpected.map((item) => {
                const parsed = parseScheduleItem(item, "Timing needed");
                return (
                  <li key={item} className="flex items-start gap-2.5">
                    <span className="mt-0.5 shrink-0 rounded-md bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-800 ring-1 ring-blue-400/30 dark:text-blue-200">
                      {parsed.timing}
                    </span>
                    <span className="leading-relaxed">{parsed.detail}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-[var(--muted)] leading-relaxed">
              No expected income listed. Add paycheck or rent timing in Chat.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
