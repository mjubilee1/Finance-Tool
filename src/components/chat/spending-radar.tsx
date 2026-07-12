"use client";

import { useState } from "react";
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
    description: "Remind the Coach I'm cutting this.",
  },
];

function alertAccent(reason: SpendingAlert["reason"]) {
  switch (reason) {
    case "cryptic_name":
      return "bg-violet-500/15 ring-violet-400/35";
    case "recurring_unknown":
      return "bg-rose-500/15 ring-rose-400/35";
    case "large_unknown":
    case "unusually_high":
      return "bg-amber-500/15 ring-amber-400/35";
    default:
      return "bg-[var(--accent-soft)] ring-[color-mix(in_srgb,var(--accent)_30%,transparent)]";
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

  if (isLoading) {
    return (
      <div className="app-card p-5 animate-pulse">
        <div className="h-4 w-40 rounded mb-4 bg-[color-mix(in_srgb,var(--ink)_12%,transparent)]" />
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-32 w-72 shrink-0 rounded-2xl bg-[color-mix(in_srgb,var(--ink)_8%,transparent)]"
            />
          ))}
        </div>
      </div>
    );
  }

  if (alerts.length === 0) {
    return (
      <div className="app-hero-gradient app-card p-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[var(--accent-soft)] flex items-center justify-center ring-1 ring-[color-mix(in_srgb,var(--accent)_28%,transparent)]">
            <Sparkles size={18} className="text-[var(--accent-strong)] dark:text-[var(--accent-bright)]" />
          </div>
          <div>
            <p className="font-semibold text-[var(--ink)]">Spending radar is clear</p>
            <p className="text-sm text-[var(--muted)] mt-0.5">
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
      <div className="px-5 pt-5 pb-4 border-b border-[var(--card-border)] bg-[color-mix(in_srgb,var(--accent-soft)_55%,var(--card-solid))]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[var(--accent)] flex items-center justify-center shadow-sm shadow-blue-600/20">
              <Radar size={18} className="text-white" />
            </div>
            <div>
              <p className="font-semibold text-[var(--ink)]">Spending radar</p>
              <p className="text-sm text-[var(--muted)] mt-0.5">
                Mystery or higher-than-usual charges. Ask the Coach, or mark reviewed once you understand them.
              </p>
            </div>
          </div>
          {estimatedMonthlyLeak > 0 ? (
            <div className="text-right shrink-0">
              <p className="app-label text-[var(--ember-strong)] dark:text-[var(--ember)]">Possible leak</p>
              <p className="text-lg font-bold text-[var(--ember-strong)] dark:text-[var(--ember)] tabular-nums">
                ~{formatCurrency(estimatedMonthlyLeak)}/mo
              </p>
            </div>
          ) : null}
        </div>
      </div>

      {activeAlert ? (
        <div className="p-4 border-b border-[var(--card-border)] bg-[color-mix(in_srgb,var(--ink)_4%,transparent)]">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <p className="text-sm font-semibold text-[var(--ink)]">
                Mark reviewed: {activeAlert.merchantName ?? activeAlert.name}
              </p>
              <p className="text-xs text-[var(--muted)] mt-0.5">
                Saves context for your Coach so this charge stays off the radar.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setActiveDismissId(null);
                setNote("");
              }}
              className="p-1.5 rounded-lg text-[var(--muted)] hover:bg-[var(--card-solid)] hover:text-[var(--ink)]"
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
                className="rounded-xl bg-[var(--card-solid)] px-3 py-3 text-left ring-1 ring-[var(--card-border)] hover:ring-[color-mix(in_srgb,var(--accent)_35%,transparent)] hover:bg-[var(--accent-soft)] transition-colors disabled:opacity-60"
              >
                <p className="text-sm font-semibold text-[var(--ink)]">{option.label}</p>
                <p className="text-xs text-[var(--muted)] mt-0.5 leading-relaxed">{option.description}</p>
              </button>
            ))}
          </div>

          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note for your Coach (e.g. business workshop subscription)"
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
                className={`relative w-72 shrink-0 rounded-2xl ring-1 ${alertAccent(alert.reason)}`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setActiveDismissId(alert.id);
                    setNote("");
                  }}
                  disabled={isDismissing}
                  className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-[var(--card-solid)] text-[var(--muted)] hover:text-[var(--accent-bright)] hover:brightness-110 ring-1 ring-[var(--card-border)] transition-colors disabled:opacity-50"
                  title="Mark reviewed"
                >
                  {isDismissing ? (
                    <span className="block w-3.5 h-3.5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
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
                    <span className="inline-flex rounded-full bg-[var(--card-solid)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-[var(--card-border)] text-[var(--ink-soft)]">
                      {alert.reasonLabel}
                    </span>
                  </div>
                  <p className="font-semibold text-[var(--ink)] truncate pr-2">{label}</p>
                  <p className="text-xl font-bold text-[var(--ink)] tabular-nums mt-1">
                    {formatCurrency(alert.amount)}
                  </p>
                  <p className="text-xs text-[var(--muted)] mt-1">{alert.date}</p>
                  <p className="text-xs text-[var(--ink-soft)] leading-relaxed mt-3 line-clamp-2">
                    {alert.savingsHint}
                  </p>
                  <p className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent-strong)] dark:text-[var(--accent-bright)] group-hover:brightness-110">
                    <HelpCircle size={13} />
                    Ask the Coach
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
