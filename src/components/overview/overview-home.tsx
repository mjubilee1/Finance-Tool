"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DateTime } from "luxon";
import { formatCurrency } from "@/lib/format";
import { getDailyAffirmation, getPersonalizedGreeting } from "@/lib/daily-affirmation";
import { getStatusStyle } from "@/lib/cash-flow";
import type { TodayCashFlow, WeeklyCashFlow } from "@/lib/cash-flow";
import { TodayCashFlowMeter } from "./today-cash-flow-meter";
import { WeeklyCashFlowStrip } from "./weekly-cash-flow-strip";
import { BillCalendar } from "./bill-calendar";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChevronDown, ChevronUp, Flame, Heart, MessageSquare, Repeat, Sparkles, Target } from "lucide-react";

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
  safeSpendTodayReason?: string;
  protectedCashBuffer: number;
  monthlySafeSpend: number;
  sixMonthSafeSpend: number;
  safeSpendRaiseFactors: string[];
  safeSpendHurtFactors: string[];
  briefUpdatedLabel: string | null;
  nextBriefLabel: string | null;
  refreshHours?: number;
  dailySpendSeries: Array<{ date: string; totalSpent: number }>;
  onOpenChat: () => void;
  onOpenRecurring?: () => void;
  onOpenGrowth?: () => void;
  onOpenGoals?: () => void;
  priorityGoal?: {
    name: string;
    paceMessage: string;
    onTrack: boolean;
  } | null;
  isBriefPending?: boolean;
  userName?: string | null;
};

export function OverviewHome({
  aiInsight,
  cashFlow,
  safeSpendToday,
  safeSpendTodayReason,
  protectedCashBuffer,
  monthlySafeSpend,
  sixMonthSafeSpend,
  safeSpendRaiseFactors,
  safeSpendHurtFactors,
  briefUpdatedLabel,
  nextBriefLabel,
  refreshHours,
  dailySpendSeries,
  onOpenChat,
  onOpenRecurring,
  onOpenGrowth,
  onOpenGoals,
  priorityGoal,
  isBriefPending = false,
  userName,
}: Props) {
  const [showDetails, setShowDetails] = useState(false);
  const cfoBrief = aiInsight.cfoBrief;
  const primaryRecommendedAction = aiInsight.recommendedActions?.[0];
  const recurringReviews = aiInsight.recurringTransactionsToReview ?? [];
  const statusStyle = getStatusStyle(cfoBrief?.status);
  const statusLabel = cfoBrief?.status ?? `${aiInsight.financialHealthScore ?? "—"}/100`;
  const todayLabel = DateTime.local().toFormat("EEEE, MMMM d");
  const greeting = getPersonalizedGreeting(userName);
  const dailyAffirmation = getDailyAffirmation();

  const { data: growthPreview } = useQuery({
    queryKey: ["growth-overview-preview"],
    queryFn: async () => {
      const res = await fetch("/api/growth");
      if (!res.ok) return null;
      return res.json() as Promise<{
        metrics: { compoundingScore: number; bottlenecks: string[]; improving: boolean };
        recommendation: { action: string; whyItMatters: string; timeRequiredMinutes: number } | null;
        opportunities: Array<{ title: string }>;
      }>;
    },
    staleTime: 60_000,
    retry: false,
  });

  return (
    <div className="space-y-5">
      {isBriefPending ? (
        <div className="rounded-xl bg-amber-500/15 px-4 py-3 text-sm text-amber-950 dark:text-amber-100 ring-1 ring-amber-400/35">
          Cash flow is ready. Your full daily brief is generating in the background — use Refresh if it does not appear soon.
        </div>
      ) : null}

      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--accent-strong)] dark:text-[var(--accent-bright)]">
            {todayLabel}
          </p>
          <h1 className="text-xl md:text-2xl app-display text-[var(--ink)] tracking-tight mt-1">{greeting}</h1>
          <p className="text-[var(--muted)] text-sm mt-1">Your daily cash flow at a glance.</p>
        </div>
        <span
          className={`inline-flex items-center gap-2 px-3 py-1.5 md:px-3.5 rounded-full text-xs md:text-sm font-semibold ring-1 shrink-0 ${statusStyle.bg} ${statusStyle.text} ${statusStyle.ring}`}
        >
          <span className={`w-1.5 h-1.5 md:w-2 md:h-2 rounded-full ${statusStyle.dot}`} />
          {statusLabel}
        </span>
      </div>

      <div className="rounded-2xl bg-[var(--card-solid)] p-4 md:p-5 ring-1 ring-[var(--card-border)]">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center shrink-0 ring-1 ring-[color-mix(in_srgb,var(--accent)_28%,transparent)]">
            <Heart size={16} className="text-[var(--accent-strong)] dark:text-[var(--accent-bright)]" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--accent-strong)] dark:text-[var(--accent-bright)]">
              {dailyAffirmation.toneLabel}
            </p>
            <p className="text-sm md:text-[15px] text-[var(--ink)] mt-1 leading-relaxed">
              {dailyAffirmation.message}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onOpenChat}
          className="inline-flex items-center gap-1.5 rounded-full bg-[var(--card-solid)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] ring-1 ring-[var(--card-border)] hover:brightness-110 transition-colors"
        >
          <MessageSquare size={14} className="text-[var(--accent)]" />
          Ask Coach
        </button>
        {onOpenGrowth ? (
          <button
            type="button"
            onClick={onOpenGrowth}
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--card-solid)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] ring-1 ring-[var(--card-border)] hover:brightness-110 transition-colors"
          >
            <Flame size={14} className="text-[var(--ember)]" />
            Growth
          </button>
        ) : null}
        {onOpenGoals ? (
          <button
            type="button"
            onClick={onOpenGoals}
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--card-solid)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] ring-1 ring-[var(--card-border)] hover:brightness-110 transition-colors"
          >
            <Target size={14} className="text-[var(--accent)]" />
            Goals
          </button>
        ) : null}
        {onOpenRecurring ? (
          <button
            type="button"
            onClick={onOpenRecurring}
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--card-solid)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] ring-1 ring-[var(--card-border)] hover:brightness-110 transition-colors"
          >
            <Repeat size={14} className="text-[var(--accent)]" />
            Recurring
          </button>
        ) : null}
      </div>

      <TodayCashFlowMeter today={cashFlow.today} status={cfoBrief?.status} />

      {(cfoBrief?.todaysMove || primaryRecommendedAction) && (
        <div className="rounded-2xl bg-[var(--accent)] p-5 text-white shadow-md shadow-blue-600/25">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/90 mb-1">
            Today&apos;s move
          </p>
          <p className="text-lg font-semibold leading-snug text-white">
            {cfoBrief?.todaysMove ?? primaryRecommendedAction?.title}
          </p>
          {(cfoBrief?.debtMove ?? primaryRecommendedAction?.reason) && (
            <p className="text-sm text-white/90 mt-1.5 leading-relaxed">
              {cfoBrief?.debtMove ?? primaryRecommendedAction?.reason}
            </p>
          )}
          {cfoBrief?.systemImpact ? (
            <p className="text-sm text-white/90 mt-2 leading-relaxed border-t border-white/25 pt-2">
              <span className="font-semibold text-white">System impact:</span> {cfoBrief.systemImpact}
            </p>
          ) : null}
        </div>
      )}

      {growthPreview?.metrics ? (
        <button
          type="button"
          onClick={() => onOpenGrowth?.()}
          className="w-full text-left app-card p-4 ring-1 ring-[color-mix(in_srgb,var(--ember)_35%,transparent)] bg-[color-mix(in_srgb,var(--ember)_10%,transparent)] hover:brightness-110 transition"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Flame size={16} className="text-[var(--ember)]" />
                <p className="app-label text-[var(--ember-strong)] dark:text-[var(--ember)]">Growth leverage</p>
              </div>
              <p className="font-semibold text-[var(--ink)]">
                Compounding score: {Math.round(growthPreview.metrics.compoundingScore)}
                {growthPreview.metrics.improving ? " · improving" : " · needs attention"}
              </p>
              <p className="text-sm text-[var(--ink-soft)] mt-1 leading-relaxed">
                {growthPreview.recommendation?.action ??
                  growthPreview.opportunities?.[0]?.title ??
                  "Open Growth to generate today’s highest-leverage action."}
              </p>
              {growthPreview.metrics.bottlenecks?.[0] ? (
                <p className="text-xs text-amber-900 dark:text-amber-200 mt-2">
                  Bottleneck: {growthPreview.metrics.bottlenecks[0]}
                </p>
              ) : null}
            </div>
            <span className="text-xs font-semibold text-[var(--ember-strong)] dark:text-[var(--ember)] shrink-0">
              Open →
            </span>
          </div>
        </button>
      ) : null}

      {priorityGoal && (
        <div
          className={`app-card p-4 ring-1 ${
            priorityGoal.onTrack
              ? "ring-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[var(--accent-soft)]"
              : "ring-amber-400/35 bg-amber-500/10"
          }`}
        >
          <p className="app-label mb-1">Focus goal</p>
          <p className="font-semibold text-[var(--ink)]">{priorityGoal.name}</p>
          <p className="text-sm text-[var(--ink-soft)] mt-1 leading-relaxed">{priorityGoal.paceMessage}</p>
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
            <div className="w-8 h-8 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center">
              <Sparkles size={16} className="text-[var(--accent-strong)] dark:text-[var(--accent-bright)]" />
            </div>
            <h2 className="text-lg font-semibold text-[var(--ink)]">Daily brief</h2>
          </div>
          {refreshHours ? (
            <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-medium text-[var(--ink-soft)]">
              {refreshHours}h refresh
            </span>
          ) : null}
        </div>
        <p className="text-sm sm:text-[15px] leading-relaxed text-[var(--ink-soft)] mb-4">
          {cfoBrief?.cashSafety ?? aiInsight.dailySummary}
        </p>
        {cfoBrief?.spendingWarning && (
          <p className="text-sm text-amber-950 dark:text-amber-100 bg-amber-400/20 dark:bg-amber-400/15 rounded-xl p-3 ring-1 ring-amber-500/30 leading-relaxed">
            {cfoBrief.spendingWarning}
          </p>
        )}
        {briefUpdatedLabel && (
          <p className="mt-3 text-xs text-[var(--muted)]">
            Last brief: {briefUpdatedLabel}
            {nextBriefLabel ? ` · Next refresh around ${nextBriefLabel}` : ""}
          </p>
        )}
        <button
          type="button"
          onClick={onOpenChat}
          className="mt-4 text-sm font-semibold text-[var(--accent-bright)] hover:brightness-110 transition"
        >
          Ask your Coach →
        </button>
      </div>

      <button
        type="button"
        onClick={() => setShowDetails(!showDetails)}
        className="w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold text-[var(--ink-soft)] hover:text-[var(--ink)] app-card hover:brightness-110 transition"
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
                <h2 className="text-lg font-semibold text-[var(--ink)] leading-snug">
                  {formatCurrency(safeSpendToday)}/day is the food/fun target — gas and bills sit outside it.
                </h2>
                <p className="text-sm text-[var(--ink-soft)] mt-2 max-w-2xl leading-relaxed">
                  {safeSpendTodayReason ??
                    cfoBrief?.safeSpendTodayReason ??
                    "About $40/day for food and fun. Cash buffer is the protected floor in checking. Gas/Lyft costs do not eat this number."}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-right shrink-0">
                <div className="rounded-xl bg-[var(--accent-soft)] p-3 ring-1 ring-[color-mix(in_srgb,var(--accent)_28%,transparent)]">
                  <p className="app-label text-[var(--accent-strong)] dark:text-[var(--accent-bright)]">
                    Food/fun per month
                  </p>
                  <p className="text-lg font-bold text-[var(--ink)] tabular-nums">
                    {formatCurrency(monthlySafeSpend)}
                  </p>
                  <p className="text-[10px] text-[var(--ink-soft)] mt-0.5">$40 × 30 days</p>
                </div>
                <div className="rounded-xl bg-[color-mix(in_srgb,var(--ink)_5%,transparent)] p-3 ring-1 ring-[var(--card-border)]">
                  <p className="app-label">Cash buffer</p>
                  <p className="text-lg font-bold text-[var(--ink)] tabular-nums">
                    {formatCurrency(protectedCashBuffer)}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3 mt-5">
              <div className="rounded-xl bg-[color-mix(in_srgb,var(--ink)_5%,transparent)] p-4 ring-1 ring-[var(--card-border)]">
                <p className="app-label mb-1">Food/fun spend over 6 months</p>
                <p className="text-2xl font-bold text-[var(--ink)] tabular-nums">
                  {formatCurrency(sixMonthSafeSpend)}
                </p>
                <p className="text-xs text-[var(--ink-soft)] mt-1 leading-relaxed">
                  Rough total you&apos;d <span className="font-medium text-[var(--ink)]">spend</span> on
                  food/fun if most days stay near $40 — not money saved. Some days over, some under
                  is fine; judge the week.
                </p>
              </div>
              <div className="rounded-xl bg-[var(--accent-soft)] p-4 ring-1 ring-[color-mix(in_srgb,var(--accent)_28%,transparent)]">
                <p className="app-label text-[var(--accent-strong)] dark:text-[var(--accent-bright)] mb-2">
                  What raises it
                </p>
                <ul className="space-y-2 text-sm text-[var(--ink-soft)] leading-relaxed">
                  {safeSpendRaiseFactors.map((factor) => (
                    <li key={factor}>{factor}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl bg-amber-500/10 p-4 ring-1 ring-amber-400/30">
                <p className="app-label text-amber-800 dark:text-amber-200 mb-2">What lowers it</p>
                <ul className="space-y-2 text-sm text-[var(--ink-soft)] leading-relaxed">
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
                  <div className="bg-rose-500/15 p-2.5 rounded-xl ring-1 ring-rose-400/30">
                    <span className="text-lg">✂️</span>
                  </div>
                  <div>
                    <h2 className="font-semibold text-[var(--ink)] text-lg">Recurring to review</h2>
                    <p className="text-sm text-[var(--muted)]">
                      {recurringReviews.length} repeating charge
                      {recurringReviews.length === 1 ? "" : "s"} flagged by your Coach.
                    </p>
                  </div>
                </div>
                {onOpenRecurring ? (
                  <button
                    type="button"
                    onClick={onOpenRecurring}
                    className="text-sm font-semibold text-[var(--accent-bright)] hover:brightness-110 transition shrink-0"
                  >
                    Open recurring →
                  </button>
                ) : null}
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                {recurringReviews.slice(0, 2).map((sub) => (
                  <div
                    key={sub.merchant}
                    className="rounded-xl bg-rose-500/10 p-5 ring-1 ring-rose-400/25"
                  >
                    <div className="flex justify-between items-start mb-2 gap-2">
                      <p className="font-semibold text-[var(--ink)] truncate">{sub.merchant}</p>
                      <p className="font-bold text-rose-600 dark:text-rose-400 tabular-nums shrink-0">
                        {formatCurrency(sub.averageAmount)}
                      </p>
                    </div>
                    <p className="app-label text-rose-600 dark:text-rose-300 mb-2">{sub.frequency}</p>
                    <p className="text-sm text-[var(--ink-soft)] leading-relaxed line-clamp-3">
                      {sub.recommendation}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {dailySpendSeries.some((d) => d.totalSpent > 0) && (
            <div className="app-card p-6">
              <h2 className="font-semibold text-[var(--ink)] mb-6">Daily spending (last 30 days)</h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dailySpendSeries}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.25)" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 12, fill: "var(--muted)" }}
                      tickMargin={10}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 12, fill: "var(--muted)" }}
                      tickFormatter={(val) => `$${val}`}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      formatter={(value) => formatCurrency(Number(value))}
                      contentStyle={{
                        borderRadius: 12,
                        border: "1px solid var(--card-border)",
                        background: "var(--card-solid)",
                        color: "var(--ink)",
                        boxShadow: "0 4px 12px rgba(15,23,42,0.2)",
                      }}
                    />
                    <Line type="monotone" dataKey="totalSpent" stroke="var(--accent)" strokeWidth={2.5} dot={false} />
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
