import { formatCurrency } from "@/lib/format";
import { AlertTriangle, Sparkles, Tag } from "lucide-react";

export type TransactionSpotlight = {
  transactionId?: string;
  merchant: string;
  amount?: number;
  date?: string;
  headline: string;
  categoryGuess?: string;
  savingsTip?: string;
  severity?: "review" | "watch" | "ok";
};

type Props = {
  spotlight: TransactionSpotlight;
};

export function TransactionSpotlightCard({ spotlight }: Props) {
  const severity = spotlight.severity ?? "review";
  const tone =
    severity === "ok"
      ? {
          shell: "bg-emerald-500/15 ring-emerald-400/35",
          badge: "bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 ring-emerald-400/35",
          icon: "text-emerald-600 dark:text-emerald-300",
        }
      : severity === "watch"
        ? {
            shell: "bg-amber-500/15 ring-amber-400/35",
            badge: "bg-amber-500/20 text-amber-900 dark:text-amber-100 ring-amber-400/35",
            icon: "text-amber-600 dark:text-amber-300",
          }
        : {
            shell: "bg-rose-500/15 ring-rose-400/35",
            badge: "bg-rose-500/20 text-rose-800 dark:text-rose-200 ring-rose-400/35",
            icon: "text-rose-600 dark:text-rose-300",
          };

  return (
    <div className={`mt-3 rounded-2xl ${tone.shell} p-4 ring-1`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={14} className={tone.icon} />
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ring-1 ${tone.badge}`}
            >
              {severity === "ok" ? "Identified" : severity === "watch" ? "Worth watching" : "Review this charge"}
            </span>
          </div>
          <p className="font-semibold text-[var(--ink)] truncate">{spotlight.merchant}</p>
          {spotlight.amount != null ? (
            <p className="text-sm font-bold text-[var(--ink)] tabular-nums mt-0.5">
              {formatCurrency(spotlight.amount)}
              {spotlight.date ? <span className="font-medium text-[var(--muted)]"> · {spotlight.date}</span> : null}
            </p>
          ) : null}
        </div>
        {severity !== "ok" ? <AlertTriangle size={18} className={`${tone.icon} shrink-0`} /> : null}
      </div>

      <p className="text-sm text-[var(--ink-soft)] leading-relaxed mt-3">{spotlight.headline}</p>

      {spotlight.categoryGuess ? (
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[var(--card-solid)] px-3 py-1 text-xs font-medium text-[var(--ink-soft)] ring-1 ring-[var(--card-border)]">
          <Tag size={12} className="text-[var(--accent)]" />
          Likely: {spotlight.categoryGuess}
        </div>
      ) : null}

      {spotlight.savingsTip ? (
        <p className="mt-3 text-xs text-[var(--muted)] leading-relaxed border-t border-[var(--card-border)] pt-3">
          {spotlight.savingsTip}
        </p>
      ) : null}
    </div>
  );
}
