"use client";

import { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/format";
import type { SpendingAlert } from "@/lib/spending-alerts";
import type { ChargeReviewDisposition } from "@/lib/charge-review";
import { Check, HelpCircle, Radar, Sparkles, X } from "lucide-react";

type Props = {
  alerts: SpendingAlert[];
  estimatedMonthlyLeak: number;
  isLoading?: boolean;
  dismissingId?: string | null;
  onAskAbout: (alert: SpendingAlert) => void;
  onDismiss: (
    alert: SpendingAlert,
    disposition: ChargeReviewDisposition,
    note?: string,
  ) => Promise<void>;
};

const DISPOSITION_OPTIONS: Array<{
  value: ChargeReviewDisposition;
  label: string;
  description: string;
}> = [
  {
    value: "expected",
    label: "Expected bill",
    description: "I know what this is — stop flagging it.",
  },
  {
    value: "one_time",
    label: "One-time",
    description: "Unusual but not recurring.",
  },
  {
    value: "not_concern",
    label: "Not a concern",
    description: "Reviewed and fine to ignore.",
  },
  {
    value: "will_cancel",
    label: "Will cancel",
    description: "Remind the CFO I'm cutting this.",
  },
];

function alertAccent(reason: SpendingAlert["reason"]) {
  switch (reason) {
    case "cryptic_name":
      return "from-violet-500/10 to-fuchsia-500/10 ring-violet-200/70";
    case "recurring_unknown":
      return "from-rose-500/10 to-orange-500/10 ring-rose-200/70";
    case "large_unknown":
    case "unusually_high":
      return "from-amber-500/10 to-yellow-500/10 ring-amber-200/70";
    default:
      return "from-slate-500/10 to-teal-500/10 ring-slate-200/70";
  }
}

export function SpendingRadar({
  alerts,
  estimatedMonthlyLeak,
  isLoading,
  dismissingId,
  onAskAbout,
  onDismiss,
}: Props) {
  const [activeDismissId, setActiveDismissId] = useState<string | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (activeDismissId && !alerts.some((alert) => alert.id === activeDismissId)) {
      setActiveDismissId(null);
      setNote("");
    }
  }, [alerts, activeDismissId]);

  if (isLoading) {
    return (
      <div className="app-card p-5 animate-pulse">
        <div className="h-4 w-40 bg-slate-200 rounded mb-4" />
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-32 w-72 shrink-0 bg-slate-100 rounded-2xl" />
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
            <p className="text-sm text-slate-500 mt-0.5">
              No mystery or unusually high charges need review right now.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const activeAlert = alerts.find((alert) => alert.id === activeDismissId) ?? null;

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
                Mystery or higher-than-usual charges. Ask the CFO, or mark reviewed once you understand them.
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

      {activeAlert ? (
        <div className="p-4 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Mark reviewed: {activeAlert.merchantName ?? activeAlert.name}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                Saves context for your CFO so this charge stays off the radar.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setActiveDismissId(null);
                setNote("");
              }}
              className="p-1.5 rounded-lg text-slate-400 hover:bg-white hover:text-slate-600"
            >
              <X size={16} />
            </button>
          </div>

          <div className="grid sm:grid-cols-2 gap-2 mb-3">
            {DISPOSITION_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                disabled={dismissingId === activeAlert.id}
                onClick={() => onDismiss(activeAlert, option.value, note)}
                className="rounded-xl bg-white px-3 py-3 text-left ring-1 ring-slate-200/80 hover:ring-teal-200 hover:bg-teal-50/40 transition-colors disabled:opacity-60"
              >
                <p className="text-sm font-semibold text-slate-900">{option.label}</p>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{option.description}</p>
              </button>
            ))}
          </div>

          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note for your CFO (e.g. business workshop subscription)"
            className="w-full app-input px-3 py-2 text-sm"
          />
        </div>
      ) : null}

      <div className="p-4 overflow-x-auto">
        <div className="flex gap-3 min-w-min pb-1">
          {alerts.map((alert) => {
            const label = alert.merchantName ?? alert.name;
            const isDismissing = dismissingId === alert.id;

            return (
              <div
                key={alert.id}
                className={`relative w-72 shrink-0 rounded-2xl bg-gradient-to-br ring-1 ${alertAccent(alert.reason)}`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setActiveDismissId(alert.id);
                    setNote("");
                  }}
                  disabled={isDismissing}
                  className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-white/90 text-slate-500 hover:text-teal-700 hover:bg-white ring-1 ring-white/80 transition-colors disabled:opacity-50"
                  title="Mark reviewed"
                >
                  {isDismissing ? (
                    <span className="block w-3.5 h-3.5 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Check size={14} />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => onAskAbout(alert)}
                  className="group w-full p-4 pr-12 text-left transition-all hover:-translate-y-0.5"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span className="inline-flex rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-white/80 text-slate-700">
                      {alert.reasonLabel}
                    </span>
                  </div>
                  <p className="font-semibold text-slate-900 truncate pr-2">{label}</p>
                  <p className="text-xl font-bold text-slate-900 tabular-nums mt-1">
                    {formatCurrency(alert.amount)}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">{alert.date}</p>
                  <p className="text-xs text-slate-600 leading-relaxed mt-3 line-clamp-2">
                    {alert.savingsHint}
                  </p>
                  <p className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-teal-700 group-hover:text-teal-800">
                    <HelpCircle size={13} />
                    Ask the CFO
                  </p>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
