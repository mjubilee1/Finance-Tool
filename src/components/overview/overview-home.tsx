"use client";

import { useState } from "react";
import { formatCurrency } from "@/lib/format";
import { getStatusStyle } from "@/lib/cash-flow";
import type { TodayCashFlow, WeeklyCashFlow } from "@/lib/cash-flow";
import { TodayCashFlowMeter } from "./today-cash-flow-meter";
import { WeeklyCashFlowStrip } from "./weekly-cash-flow-strip";
import { BillCalendar } from "./bill-calendar";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";

type CfoBrief = {
  status?: string;
  cashSafety?: string;
  upcomingBills?: string[];
  incomeExpected?: string[];
  safeSpendToday?: number;
  safeSpendTodayReason?: string;
  debtMove?: string;
  spendingWarning?: string;
  todaysMove?: string;
  systemImpact?: string;
};

type RecommendedAction = {
  title: string;
  reason: string;
};

type RecurringReview = {
  merchant: string;
  averageAmount: number;
  frequency: string;
  recommendation: string;
};

type Props = {
  aiInsight: {
    cfoBrief?: CfoBrief;
    dailySummary?: string;
    financialHealthScore?: number;
    recommendedActions?: RecommendedAction[];
    recurringTransactionsToReview?: RecurringReview[];
  };
  cashFlow: {
    today: TodayCashFlow;
    weekly: WeeklyCashFlow;
  };
  safeSpendToday: number;
  protectedCashBuffer: number;
  monthlySafeSpend: number;
  sixMonthSafeSpend: number;
  safeSpendRaiseFactors: string[];
  safeSpendHurtFactors: string[];
  briefUpdatedLabel: string | null;
  nextBriefLabel: string | null;
  refreshHours?: number;
  snapshots: Array<Record<string, unknown>>;
  onOpenChat: () => void;
  onOpenRecurring?: () => void;
  priorityGoal?: {
    name: string;
    paceMessage: string;
    onTrack: boolean;
  } | null;
  isBriefPending?: boolean;
};

export function OverviewHome({
  aiInsight,
  cashFlow,
  safeSpendToday,
  protectedCashBuffer,
  monthlySafeSpend,
  sixMonthSafeSpend,
  safeSpendRaiseFactors,
  safeSpendHurtFactors,
  briefUpdatedLabel,
  nextBriefLabel,
  refreshHours,
  snapshots,
  onOpenChat,
  onOpenRecurring,
  priorityGoal,
  isBriefPending = false,
}: Props) {
  const [showDetails, setShowDetails] = useState(false);
  const cfoBrief = aiInsight.cfoBrief;
  const primaryRecommendedAction = aiInsight.recommendedActions?.[0];
  const recurringReviews = aiInsight.recurringTransactionsToReview ?? [];
  const statusStyle = getStatusStyle(cfoBrief?.status);
  const statusLabel = cfoBrief?.status ?? `${aiInsight.financialHealthScore ?? "—"}/100`;

  return (
    <div className="space-y-5">
      {isBriefPending ? (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200/70">
          Cash flow is ready. Your full CFO brief is generating in the background — use Refresh if it does not appear soon.
        </div>
      ) : null}

      <div className="flex md:hidden items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">Today</h1>
        <span
          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold ring-1 ${statusStyle.bg} ${statusStyle.text} ${statusStyle.ring}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
          {statusLabel}
        </span>
      </div>

      <div className="hidden md:flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Good morning</h1>
          <p className="text-slate-500 mt-1">Your daily cash flow at a glance.</p>
        </div>
        <span
          className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-semibold ring-1 ${statusStyle.bg} ${statusStyle.text} ${statusStyle.ring}`}
        >
          <span className={`w-2 h-2 rounded-full ${statusStyle.dot}`} />
          {statusLabel}
        </span>
      </div>

      <TodayCashFlowMeter today={cashFlow.today} status={cfoBrief?.status} />

      {(cfoBrief?.todaysMove || primaryRecommendedAction) && (
        <div className="rounded-2xl bg-teal-600 p-5 text-white shadow-md shadow-teal-600/20">
          <p className="text-xs font-semibold uppercase tracking-wider text-teal-100 mb-1">Today&apos;s move</p>
          <p className="text-lg font-semibold leading-snug">
            {cfoBrief?.todaysMove ?? primaryRecommendedAction?.title}
          </p>
          {(cfoBrief?.debtMove ?? primaryRecommendedAction?.reason) && (
            <p className="text-sm text-teal-50/90 mt-1.5 leading-relaxed">
              {cfoBrief?.debtMove ?? primaryRecommendedAction?.reason}
            </p>
          )}
          {cfoBrief?.systemImpact ? (
            <p className="text-sm text-teal-100/90 mt-2 leading-relaxed border-t border-teal-500/30 pt-2">
              <span className="font-semibold text-teal-50">System impact:</span> {cfoBrief.systemImpact}
            </p>
          ) : null}
        </div>
      )}

      {priorityGoal && (
        <div
          className={`app-card p-4 ring-1 ${
            priorityGoal.onTrack ? "ring-teal-200/60 bg-teal-50/30" : "ring-amber-200/60 bg-amber-50/30"
          }`}
        >
          <p className="app-label mb-1">Focus goal</p>
          <p className="font-semibold text-slate-900">{priorityGoal.name}</p>
          <p className="text-sm text-slate-600 mt-1 leading-relaxed">{priorityGoal.paceMessage}</p>
        </div>
      )}

      <WeeklyCashFlowStrip weekly={cashFlow.weekly} />

      <BillCalendar
        upcomingBills={cfoBrief?.upcomingBills}
        incomeExpected={cfoBrief?.incomeExpected}
        onAskChat={onOpenChat}
      />

      <div className="app-card p-6">
        <div className="flex justify-between items-start mb-3 gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
              <Sparkles size={16} className="text-teal-600" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900">CFO brief</h2>
          </div>
          {refreshHours ? (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              {refreshHours}h refresh
            </span>
          ) : null}
        </div>
        <p className="text-sm sm:text-[15px] leading-relaxed text-slate-600 mb-4">
          {cfoBrief?.cashSafety ?? aiInsight.dailySummary}
        </p>
        {cfoBrief?.spendingWarning && (
          <p className="text-sm text-amber-900 bg-amber-50 rounded-xl p-3 ring-1 ring-amber-200/60 leading-relaxed">
            {cfoBrief.spendingWarning}
          </p>
        )}
        {briefUpdatedLabel && (
          <p className="mt-3 text-xs text-slate-400">
            Last brief: {briefUpdatedLabel}
            {nextBriefLabel ? ` · Next refresh around ${nextBriefLabel}` : ""}
          </p>
        )}
        <button
          type="button"
          onClick={onOpenChat}
          className="mt-4 text-sm font-semibold text-teal-700 hover:text-teal-800 transition"
        >
          Ask your CFO →
        </button>
      </div>

      <button
        type="button"
        onClick={() => setShowDetails(!showDetails)}
        className="w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold text-slate-600 hover:text-slate-900 app-card hover:bg-slate-50 transition"
      >
        {showDetails ? "Hide details" : "Show full plan details"}
        {showDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {showDetails && (
        <>
          <div className="app-card p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="app-label mb-2">Why this daily number</p>
                <h2 className="text-lg font-semibold text-slate-900 leading-snug">
                  {formatCurrency(safeSpendToday)}/day connects micro decisions to your macro plan.
                </h2>
                <p className="text-sm text-slate-600 mt-2 max-w-2xl leading-relaxed">
                  {cfoBrief?.safeSpendTodayReason ??
                    "Available checking cash, minus a protected buffer, minus what's already spent today."}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-right shrink-0">
                <div className="rounded-xl bg-teal-50/80 p-3 ring-1 ring-teal-200/50">
                  <p className="app-label text-teal-700">Monthly pace</p>
                  <p className="text-lg font-bold text-slate-900 tabular-nums">{formatCurrency(monthlySafeSpend)}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200/50">
                  <p className="app-label">Cash buffer</p>
                  <p className="text-lg font-bold text-slate-900 tabular-nums">{formatCurrency(protectedCashBuffer)}</p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3 mt-5">
              <div className="rounded-xl bg-slate-50/80 p-4 ring-1 ring-slate-200/50">
                <p className="app-label mb-1">6-month spend</p>
                <p className="text-2xl font-bold text-slate-900 tabular-nums">{formatCurrency(sixMonthSafeSpend)}</p>
              </div>
              <div className="rounded-xl bg-teal-50/50 p-4 ring-1 ring-teal-200/50">
                <p className="app-label text-teal-700 mb-2">What raises it</p>
                <ul className="space-y-2 text-sm text-slate-700 leading-relaxed">
                  {safeSpendRaiseFactors.map((factor) => (
                    <li key={factor}>{factor}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl bg-amber-50/50 p-4 ring-1 ring-amber-200/50">
                <p className="app-label text-amber-700 mb-2">What lowers it</p>
                <ul className="space-y-2 text-sm text-slate-700 leading-relaxed">
                  {safeSpendHurtFactors.map((factor) => (
                    <li key={factor}>{factor}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {recurringReviews.length > 0 && (
            <div className="app-card p-6">
              <div className="flex items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-3">
                  <div className="bg-rose-50 p-2.5 rounded-xl ring-1 ring-rose-200/50">
                    <span className="text-lg">✂️</span>
                  </div>
                  <div>
                    <h2 className="font-semibold text-slate-900 text-lg">Recurring to review</h2>
                    <p className="text-sm text-slate-500">
                      {recurringReviews.length} repeating charge{recurringReviews.length === 1 ? "" : "s"} flagged by your CFO.
                    </p>
                  </div>
                </div>
                {onOpenRecurring ? (
                  <button
                    type="button"
                    onClick={onOpenRecurring}
                    className="text-sm font-semibold text-teal-700 hover:text-teal-800 transition shrink-0"
                  >
                    Open recurring →
                  </button>
                ) : null}
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                {recurringReviews.slice(0, 2).map((sub) => (
                  <div
                    key={sub.merchant}
                    className="rounded-xl bg-rose-50/40 p-5 ring-1 ring-rose-200/50"
                  >
                    <div className="flex justify-between items-start mb-2 gap-2">
                      <p className="font-semibold text-slate-900 truncate">{sub.merchant}</p>
                      <p className="font-bold text-rose-700 tabular-nums shrink-0">
                        {formatCurrency(sub.averageAmount)}
                      </p>
                    </div>
                    <p className="app-label text-rose-500 mb-2">{sub.frequency}</p>
                    <p className="text-sm text-slate-600 leading-relaxed line-clamp-3">{sub.recommendation}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {snapshots.length > 0 && (
            <div className="app-card p-6">
              <h2 className="font-semibold text-slate-900 mb-6">Daily spending (last 30 days)</h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={snapshots}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 12, fill: "#64748b" }} tickMargin={10} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 12, fill: "#64748b" }} tickFormatter={(val) => `$${val}`} axisLine={false} tickLine={false} />
                    <Tooltip
                      formatter={(value) => formatCurrency(Number(value))}
                      contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 4px 12px rgba(15,23,42,0.08)" }}
                    />
                    <Line type="monotone" dataKey="totalSpent" stroke="#0d9488" strokeWidth={2.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
