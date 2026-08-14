"use client";

import { useState } from "react";
import { formatCurrency } from "@/lib/format";
import type { SpendingAlert } from "@/lib/spending-alerts";
import type { ChargeReviewDisposition } from "@/lib/charge-review";
import { Check, ChevronDown, HelpCircle, Radar, X } from "lucide-react";

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
  const [expanded, setExpanded] = useState(false);
  const [activeDismissId, setActiveDismissId] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const reviewAlert = async (
    alert: SpendingAlert,
    disposition: ChargeReviewDisposition,
    reviewNote?: string,
  ) => {
    await onDismiss(alert, disposition, reviewNote);
    setActiveDismissId(null);
    setNote("");
  };

  // Keep Coach chat full-height — don't render a "clear" banner.
  if (isLoading || alerts.length === 0) {
    return null;
  }

  const activeAlert = alerts.find((alert) => alert.id === activeDismissId) ?? null;
  const topAlert = alerts[0];
  const topLabel = topAlert.merchantName ?? topAlert.name;
  const moreCount = alerts.length - 1;

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="app-card flex w-full items-center gap-2.5 px-3 py-2 text-left transition hover:brightness-[1.03] sm:px-3.5"
        aria-expanded={false}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)] shadow-sm shadow-blue-600/20">
          <Radar size={14} className="text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[var(--ink)]">
            Spending radar
            <span className="font-normal text-[var(--muted)]"> · {topLabel}</span>
          </p>
          <p className="truncate text-[11px] text-[var(--muted)]">
            {formatCurrency(topAlert.amount)}
            {moreCount > 0 ? ` · +${moreCount} more` : ""}
            {estimatedMonthlyLeak > 0
              ? ` · possible leak ~${formatCurrency(estimatedMonthlyLeak)}/mo`
              : " · tap to review"}
          </p>
        </div>
        <ChevronDown size={16} className="shrink-0 text-[var(--muted)]" />
      </button>
    );
  }

  return (
    <div className="app-card overflow-hidden">
      <div className="border-b border-[var(--card-border)] bg-[color-mix(in_srgb,var(--accent-soft)_55%,var(--card-solid))] px-4 py-3 sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent)] shadow-sm shadow-blue-600/20">
              <Radar size={16} className="text-white" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-[var(--ink)]">Spending radar</p>
              <p className="mt-0.5 text-xs text-[var(--muted)] sm:text-sm">
                Approve if it belongs, decline to cut it, or ask the Coach.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-start gap-2">
            {estimatedMonthlyLeak > 0 ? (
              <div className="hidden text-right sm:block">
                <p className="app-label text-[var(--ember-strong)] dark:text-[var(--ember)]">Possible leak</p>
                <p className="text-base font-bold tabular-nums text-[var(--ember-strong)] dark:text-[var(--ember)]">
                  ~{formatCurrency(estimatedMonthlyLeak)}/mo
                </p>
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setExpanded(false);
                setActiveDismissId(null);
                setNote("");
              }}
              className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-[var(--card-solid)] hover:text-[var(--ink)]"
              aria-label="Collapse spending radar"
            >
              <X size={16} />
            </button>
          </div>
        </div>
        {estimatedMonthlyLeak > 0 ? (
          <p className="mt-2 text-xs font-semibold text-[var(--ember-strong)] dark:text-[var(--ember)] sm:hidden">
            Possible leak ~{formatCurrency(estimatedMonthlyLeak)}/mo
          </p>
        ) : null}
      </div>

      {activeAlert ? (
        <div className="border-b border-[var(--card-border)] bg-[color-mix(in_srgb,var(--ink)_4%,transparent)] p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[var(--ink)]">
                Mark reviewed: {activeAlert.merchantName ?? activeAlert.name}
              </p>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                Saves context for your Coach so this charge stays off the radar.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setActiveDismissId(null);
                setNote("");
              }}
              className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-[var(--card-solid)] hover:text-[var(--ink)]"
            >
              <X size={16} />
            </button>
          </div>

          <div className="mb-3 grid gap-2 sm:grid-cols-2">
            {DISPOSITION_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                disabled={dismissingId === activeAlert.id}
                onClick={() => reviewAlert(activeAlert, option.value, note)}
                className="rounded-xl bg-[var(--card-solid)] px-3 py-3 text-left ring-1 ring-[var(--card-border)] transition-colors hover:bg-[var(--accent-soft)] hover:ring-[color-mix(in_srgb,var(--accent)_35%,transparent)] disabled:opacity-60"
              >
                <p className="text-sm font-semibold text-[var(--ink)]">{option.label}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-[var(--muted)]">{option.description}</p>
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

      <div className="p-3 sm:overflow-x-auto sm:p-4">
        <div className="grid gap-3 sm:flex sm:min-w-min sm:pb-1">
          {alerts.map((alert) => {
            const label = alert.merchantName ?? alert.name;
            const isDismissing = dismissingId === alert.id;

            return (
              <div
                key={alert.id}
                className={`relative w-full rounded-2xl p-4 ring-1 sm:w-72 sm:shrink-0 ${alertAccent(alert.reason)}`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setActiveDismissId(alert.id);
                    setNote("");
                  }}
                  disabled={isDismissing}
                  className="absolute top-3 right-3 z-10 inline-flex items-center gap-1 rounded-full bg-[var(--card-solid)] px-2.5 py-1 text-[11px] font-semibold text-[var(--muted)] ring-1 ring-[var(--card-border)] transition-colors hover:text-[var(--accent-bright)] hover:brightness-110 disabled:opacity-50"
                  title="More review choices"
                >
                  {isDismissing ? (
                    <span className="block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
                  ) : (
                    <>
                      <Check size={12} />
                      More
                    </>
                  )}
                </button>

                <div className="pr-16">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="inline-flex rounded-full bg-[var(--card-solid)] px-2.5 py-1 text-[10px] font-semibold tracking-wide text-[var(--ink-soft)] uppercase ring-1 ring-[var(--card-border)]">
                      {alert.reasonLabel}
                    </span>
                  </div>
                  <p className="truncate pr-2 font-semibold text-[var(--ink)]">{label}</p>
                  <p className="mt-1 text-xl font-bold tabular-nums text-[var(--ink)]">
                    {formatCurrency(alert.amount)}
                  </p>
                  <p className="mt-1 text-xs text-[var(--muted)]">{alert.date}</p>
                  <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-[var(--ink-soft)]">
                    {alert.savingsHint}
                  </p>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={isDismissing}
                    onClick={() => reviewAlert(alert, "expected")}
                    className="min-h-11 rounded-xl bg-teal-500/15 px-3 py-2 text-sm font-bold text-teal-700 ring-1 ring-teal-400/35 transition hover:brightness-110 disabled:opacity-60 dark:text-teal-200"
                  >
                    {isDismissing ? "Saving..." : "Approve"}
                  </button>
                  <button
                    type="button"
                    disabled={isDismissing}
                    onClick={() => reviewAlert(alert, "will_cancel")}
                    className="min-h-11 rounded-xl bg-rose-500/15 px-3 py-2 text-sm font-bold text-rose-700 ring-1 ring-rose-400/35 transition hover:brightness-110 disabled:opacity-60 dark:text-rose-200"
                  >
                    Decline
                  </button>
                  <button
                    type="button"
                    onClick={() => onAskAbout(alert)}
                    className="col-span-2 inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-[var(--card-solid)] px-3 py-2 text-sm font-semibold text-[var(--accent-strong)] ring-1 ring-[var(--card-border)] transition hover:brightness-110 dark:text-[var(--accent-bright)]"
                  >
                    <HelpCircle size={13} />
                    Ask the Coach
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
