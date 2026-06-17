"use client";

import { buildBillCalendar } from "@/lib/cash-flow";
import { MessageSquare } from "lucide-react";

type Props = {
  upcomingBills?: string[];
  incomeExpected?: string[];
  onAskChat?: () => void;
};

export function BillCalendar({ upcomingBills = [], incomeExpected = [], onAskChat }: Props) {
  const calendarDays = buildBillCalendar(14);
  const hasBills = upcomingBills.length > 0;
  const hasIncome = incomeExpected.length > 0;

  return (
    <div className="app-card p-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <p className="app-label mb-1">Next 14 days</p>
          <h2 className="text-lg font-semibold text-slate-900 tracking-tight">Bills & income</h2>
        </div>
        {onAskChat && (
          <button
            type="button"
            onClick={onAskChat}
            className="flex items-center gap-1.5 text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 px-3 py-1.5 rounded-lg ring-1 ring-teal-200/60 transition"
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
                ? "bg-teal-600 text-white ring-teal-600"
                : "bg-slate-50 ring-slate-200/60 text-slate-600"
            }`}
          >
            <p className="text-[9px] font-medium uppercase opacity-75">{day.dayLabel}</p>
            <p className="text-sm font-bold tabular-nums">{day.dayNum}</p>
          </div>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="rounded-xl bg-rose-50/60 p-4 ring-1 ring-rose-200/50">
          <p className="app-label text-rose-600 mb-2">Upcoming bills</p>
          {hasBills ? (
            <ul className="space-y-2 text-sm text-slate-700">
              {upcomingBills.map((bill) => (
                <li key={bill} className="flex items-start gap-2">
                  <span className="text-rose-400 mt-1.5 w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
                  {bill}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500 leading-relaxed">
              No bills identified yet. Tell your CFO when bills are due for a sharper safe spend number.
            </p>
          )}
        </div>

        <div className="rounded-xl bg-teal-50/60 p-4 ring-1 ring-teal-200/50">
          <p className="app-label text-teal-700 mb-2">Income expected</p>
          {hasIncome ? (
            <ul className="space-y-2 text-sm text-slate-700">
              {incomeExpected.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="text-teal-500 mt-1.5 w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500 leading-relaxed">
              No expected income listed. Add paycheck or rent timing in Chat.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
