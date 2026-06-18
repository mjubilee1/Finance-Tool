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
          shell: "from-emerald-50 to-teal-50 ring-emerald-200/70",
          badge: "bg-emerald-100 text-emerald-800 ring-emerald-200/70",
          icon: "text-emerald-600",
        }
      : severity === "watch"
        ? {
            shell: "from-amber-50 to-orange-50 ring-amber-200/70",
            badge: "bg-amber-100 text-amber-900 ring-amber-200/70",
            icon: "text-amber-600",
          }
        : {
            shell: "from-rose-50 to-orange-50 ring-rose-200/70",
            badge: "bg-rose-100 text-rose-800 ring-rose-200/70",
            icon: "text-rose-600",
          };

  return (
    <div
      className={`mt-3 rounded-2xl bg-gradient-to-br ${tone.shell} p-4 ring-1`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={14} className={tone.icon} />
            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ring-1 ${tone.badge}`}>
              {severity === "ok" ? "Identified" : severity === "watch" ? "Worth watching" : "Review this charge"}
            </span>
          </div>
          <p className="font-semibold text-slate-900 truncate">{spotlight.merchant}</p>
          {spotlight.amount != null ? (
            <p className="text-sm font-bold text-slate-800 tabular-nums mt-0.5">
              {formatCurrency(spotlight.amount)}
              {spotlight.date ? <span className="font-medium text-slate-500"> · {spotlight.date}</span> : null}
            </p>
          ) : null}
        </div>
        {severity !== "ok" ? <AlertTriangle size={18} className={`${tone.icon} shrink-0`} /> : null}
      </div>

      <p className="text-sm text-slate-700 leading-relaxed mt-3">{spotlight.headline}</p>

      {spotlight.categoryGuess ? (
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200/70">
          <Tag size={12} className="text-teal-600" />
          Likely: {spotlight.categoryGuess}
        </div>
      ) : null}

      {spotlight.savingsTip ? (
        <p className="mt-3 text-xs text-slate-600 leading-relaxed border-t border-white/70 pt-3">
          {spotlight.savingsTip}
        </p>
      ) : null}
    </div>
  );
}
