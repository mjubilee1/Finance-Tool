"use client";

import { formatCurrency } from "@/lib/format";
import type { SpendingAlert } from "@/lib/spending-alerts";
import { HelpCircle, Radar, Sparkles } from "lucide-react";

type Props = {
  alerts: SpendingAlert[];
  estimatedMonthlyLeak: number;
  isLoading?: boolean;
  onAskAbout: (alert: SpendingAlert) => void;
};

function alertAccent(reason: SpendingAlert["reason"]) {
  switch (reason) {
    case "cryptic_name":
      return "from-violet-500/10 to-fuchsia-500/10 ring-violet-200/70 text-violet-700";
    case "recurring_unknown":
      return "from-rose-500/10 to-orange-500/10 ring-rose-200/70 text-rose-700";
    case "large_unknown":
      return "from-amber-500/10 to-yellow-500/10 ring-amber-200/70 text-amber-800";
    default:
      return "from-slate-500/10 to-teal-500/10 ring-slate-200/70 text-slate-700";
  }
}

export function SpendingRadar({ alerts, estimatedMonthlyLeak, isLoading, onAskAbout }: Props) {
  if (isLoading) {
    return (
      <div className="app-card p-5 animate-pulse">
        <div className="h-4 w-40 bg-slate-200 rounded mb-4" />
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-32 w-56 shrink-0 bg-slate-100 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (alerts.length === 0) {
    return (
      <div className="app-hero-gradient app-card p-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-teal-100 flex items-center justify-center ring-1 ring-teal-200/60">
            <Sparkles size={18} className="text-teal-600" />
          </div>
          <div>
            <p className="font-semibold text-slate-900">Spending radar is clear</p>
            <p className="text-sm text-slate-500 mt-0.5">No mystery charges flagged in the last 60 days.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-card overflow-hidden">
      <div className="px-5 pt-5 pb-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-teal-50/40">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-600 flex items-center justify-center shadow-sm shadow-teal-600/20">
              <Radar size={18} className="text-white" />
            </div>
            <div>
              <p className="font-semibold text-slate-900">Spending radar</p>
              <p className="text-sm text-slate-500 mt-0.5">
                Charges we can&apos;t confidently label — tap one and ask the CFO what it is.
              </p>
            </div>
          </div>
          {estimatedMonthlyLeak > 0 ? (
            <div className="text-right shrink-0">
              <p className="app-label text-amber-700">Possible leak</p>
              <p className="text-lg font-bold text-amber-800 tabular-nums">
                ~{formatCurrency(estimatedMonthlyLeak)}/mo
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="p-4 overflow-x-auto">
        <div className="flex gap-3 min-w-min pb-1">
          {alerts.map((alert) => {
            const label = alert.merchantName ?? alert.name;
            return (
              <button
                key={alert.id}
                type="button"
                onClick={() => onAskAbout(alert)}
                className={`group w-64 shrink-0 rounded-2xl bg-gradient-to-br p-4 text-left ring-1 transition-all hover:-translate-y-0.5 hover:shadow-md ${alertAccent(alert.reason)}`}
              >
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="inline-flex rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-white/80">
                    {alert.reasonLabel}
                  </span>
                  <HelpCircle size={16} className="opacity-60 group-hover:opacity-100" />
                </div>
                <p className="font-semibold text-slate-900 truncate">{label}</p>
                <p className="text-xl font-bold text-slate-900 tabular-nums mt-1">
                  {formatCurrency(alert.amount)}
                </p>
                <p className="text-xs text-slate-500 mt-1">{alert.date}</p>
                <p className="text-xs text-slate-600 leading-relaxed mt-3 line-clamp-2">
                  {alert.savingsHint}
                </p>
                <p className="mt-3 text-xs font-semibold text-teal-700 group-hover:text-teal-800">
                  Ask the CFO →
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
