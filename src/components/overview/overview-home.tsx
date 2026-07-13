"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DateTime } from "luxon";
import { formatCurrency } from "@/lib/format";
import { getDailyAffirmation, getPersonalizedGreeting } from "@/lib/daily-affirmation";
import { getStatusStyle } from "@/lib/cash-flow";
import type { TodayCashFlow, WeeklyCashFlow, DailySpendPoint } from "@/lib/cash-flow";
import { QuickCashGlance } from "./quick-cash-glance";
import { TodayCashFlowMeter } from "./today-cash-flow-meter";
import { WeeklyCashFlowStrip } from "./weekly-cash-flow-strip";
import { BillCalendar } from "./bill-calendar";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  ChevronDown,
  ChevronUp,
  Cpu,
  Flame,
  MapPin,
  MessageSquare,
  Quote,
  Repeat,
  Sparkles,
  Target,
} from "lucide-react";

function DailySpendTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ payload?: DailySpendPoint }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  const hasSpend = point.totalSpent > 0;
  const breakdown = point.breakdown ?? [];
  const topMerchants = point.topMerchants ?? [];

  return (
    <div
      className="rounded-xl px-3 py-2.5 text-sm shadow-lg max-w-[240px]"
      style={{
        border: "1px solid var(--card-border)",
        background: "var(--card-solid)",
        color: "var(--ink)",
      }}
    >
      <p className="font-semibold tabular-nums mb-1">{label}</p>
      <p className="tabular-nums mb-2">
        Total: <span className="font-bold">{formatCurrency(point.totalSpent)}</span>
      </p>
      {!hasSpend ? (
        <p className="text-xs text-[var(--muted)]">No spending counted this day.</p>
      ) : (
        <>
          {breakdown.length > 0 ? (
            <div className="space-y-1 mb-2">
              <p className="app-label text-[10px]">By type</p>
              {breakdown.map((item) => (
                <div key={item.label} className="flex justify-between gap-3 text-xs">
                  <span className="text-[var(--ink-soft)] truncate">{item.label}</span>
                  <span className="tabular-nums shrink-0">{formatCurrency(item.amount)}</span>
                </div>
              ))}
            </div>
          ) : null}
          {topMerchants.length > 0 ? (
            <div className="space-y-1 border-t border-[var(--card-border)] pt-2">
              <p className="app-label text-[10px]">Top places</p>
              {topMerchants.map((item) => (
                <div key={item.label} className="flex justify-between gap-3 text-xs">
                  <span className="text-[var(--ink-soft)] truncate">{item.label}</span>
                  <span className="tabular-nums shrink-0">{formatCurrency(item.amount)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

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

type TodayOverviewResponse = {
  brief: {
    dayShape: "office" | "wfh" | "weekend";
    dayLabel: string;
    dateLabel: string;
    plan: {
      summary: string;
      blocks: Array<{ key: string; label: string; time: string; why: string }>;
    };
    recommendation: {
      action: string;
      whyItMatters: string;
      status: string;
      timeRequiredMinutes: number;
    } | null;
    moneyHeadline: {
      status: string | null;
      spendingWarning: string | null;
      todaysMove: string | null;
      systemImpact: string | null;
    };
    completedBlockKeys: string[];
    skippedBlockKeys: string[];
  };
  trendTldr: {
    tech: { title: string; why: string; oneAction: string };
    dmv: { title: string; why: string; oneAction: string };
    focusGuardrail: string;
    topTechItem: { title: string; summary: string; whyItMatters: string } | null;
  } | null;
};

const DAY_SHAPE_LABEL: Record<TodayOverviewResponse["brief"]["dayShape"], string> = {
  office: "Office day",
  wfh: "WFH day",
  weekend: "Weekend",
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
  dailySpendSeries: DailySpendPoint[];
  onOpenChat: () => void;
  onOpenRecurring?: () => void;
  onOpenGrowth?: () => void;
  onOpenGoals?: () => void;
  onOpenTrends?: () => void;
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
  onOpenTrends,
  priorityGoal,
  isBriefPending = false,
  userName,
}: Props) {
  const [showCashDetails, setShowCashDetails] = useState(false);
  const cfoBrief = aiInsight.cfoBrief;
  const primaryRecommendedAction = aiInsight.recommendedActions?.[0];
  const recurringReviews = aiInsight.recurringTransactionsToReview ?? [];
  const statusStyle = getStatusStyle(cfoBrief?.status);
  const statusLabel = cfoBrief?.status ?? `${aiInsight.financialHealthScore ?? "—"}/100`;
  const now = DateTime.local();
  const todayLabel = now.toFormat("EEEE, MMMM d");
  const greeting = getPersonalizedGreeting(userName);
  const quote = getDailyAffirmation();

  const { data: todayOverview, isLoading: todayLoading } = useQuery({
    queryKey: ["overview-today"],
    queryFn: async () => {
      const res = await fetch("/api/today");
      if (!res.ok) return null;
      return res.json() as Promise<TodayOverviewResponse>;
    },
    staleTime: 60_000,
    retry: false,
  });

  const brief = todayOverview?.brief;
  const trendTldr = todayOverview?.trendTldr;
  const focusAction =
    brief?.recommendation?.action ??
    cfoBrief?.todaysMove ??
    primaryRecommendedAction?.title ??
    null;
  const focusWhy =
    brief?.recommendation?.whyItMatters ??
    cfoBrief?.systemImpact ??
    primaryRecommendedAction?.reason ??
    brief?.plan.summary ??
    null;
  const leverageBlock = brief?.plan.blocks.find((block) => block.key === "leverage");

  return (
    <div className="space-y-5">
      {isBriefPending ? (
        <div className="rounded-xl bg-amber-500/15 px-4 py-3 text-sm text-amber-950 dark:text-amber-100 ring-1 ring-amber-400/35">
          Cash flow is ready. Your money brief is still generating in the background — use Refresh if
          it does not appear soon.
        </div>
      ) : null}

      {/* Date + greeting */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--accent-strong)] dark:text-[var(--accent-bright)]">
            {todayLabel}
          </p>
          <h1 className="text-xl md:text-2xl app-display text-[var(--ink)] tracking-tight mt-1">
            {greeting}
          </h1>
          <p className="text-[var(--muted)] text-sm mt-1">
            {brief
              ? `${DAY_SHAPE_LABEL[brief.dayShape]} — focus first, cash check second.`
              : "Your daily focus board — cash stays in the background."}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          {brief ? (
            <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold bg-[var(--accent-soft)] text-[var(--accent-strong)] dark:text-[var(--accent-bright)] ring-1 ring-[color-mix(in_srgb,var(--accent)_28%,transparent)]">
              {DAY_SHAPE_LABEL[brief.dayShape]}
            </span>
          ) : null}
          <span
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold ring-1 ${statusStyle.bg} ${statusStyle.text} ${statusStyle.ring}`}
            title="Money status"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
            {statusLabel}
          </span>
        </div>
      </div>

      {/* Quote of the day */}
      <div className="rounded-2xl bg-[var(--card-solid)] p-4 md:p-5 ring-1 ring-[var(--card-border)]">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center shrink-0 ring-1 ring-[color-mix(in_srgb,var(--accent)_28%,transparent)]">
            <Quote size={16} className="text-[var(--accent-strong)] dark:text-[var(--accent-bright)]" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--accent-strong)] dark:text-[var(--accent-bright)]">
              {quote.toneLabel}
            </p>
            <p className="text-sm md:text-[15px] text-[var(--ink)] mt-1 leading-relaxed italic">
              &ldquo;{quote.message}&rdquo;
            </p>
            {quote.attribution ? (
              <p className="text-xs text-[var(--muted)] mt-2">— {quote.attribution}</p>
            ) : null}
          </div>
        </div>
      </div>

      {/* Focus for today */}
      <div className="rounded-2xl bg-[var(--accent)] p-5 text-white shadow-md shadow-blue-600/20">
        <p className="text-xs font-semibold uppercase tracking-wider text-white/90 mb-1">
          Focus for today
        </p>
        {todayLoading && !brief ? (
          <p className="text-sm text-white/85">Loading today&apos;s focus…</p>
        ) : focusAction ? (
          <>
            <p className="text-lg font-semibold leading-snug text-white">{focusAction}</p>
            {focusWhy ? (
              <p className="text-sm text-white/90 mt-1.5 leading-relaxed">{focusWhy}</p>
            ) : null}
            {leverageBlock ? (
              <p className="text-xs text-white/80 mt-3 border-t border-white/25 pt-2">
                Protect: {leverageBlock.label} · {leverageBlock.time}
              </p>
            ) : null}
            {brief?.recommendation?.status && brief.recommendation.status !== "pending" ? (
              <p className="text-xs text-white/80 mt-2 capitalize">
                Move status: {brief.recommendation.status}
              </p>
            ) : null}
          </>
        ) : (
          <>
            <p className="text-lg font-semibold leading-snug text-white">
              {brief?.plan.summary ?? "Open Growth to lock today's highest-leverage move."}
            </p>
            <p className="text-sm text-white/90 mt-1.5 leading-relaxed">
              Body, career leverage, and intentional joy beat staring at cash once the floor is set.
            </p>
          </>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {onOpenGrowth ? (
            <button
              type="button"
              onClick={onOpenGrowth}
              className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/30 hover:bg-white/25 transition"
            >
              <Flame size={14} />
              Open Growth
            </button>
          ) : null}
          <button
            type="button"
            onClick={onOpenChat}
            className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/30 hover:bg-white/25 transition"
          >
            <MessageSquare size={14} />
            Ask Coach
          </button>
        </div>
      </div>

      {/* News / trend TLDR */}
      <div className="rounded-2xl bg-[var(--card-solid)] p-4 md:p-5 ring-1 ring-[var(--card-border)]">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-[color-mix(in_srgb,var(--ember)_18%,transparent)] flex items-center justify-center ring-1 ring-[color-mix(in_srgb,var(--ember)_35%,transparent)]">
              <Sparkles size={16} className="text-[var(--ember)]" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ember-strong)] dark:text-[var(--ember)]">
                Trend TLDR
              </p>
              <p className="text-xs text-[var(--muted)]">What&apos;s worth noticing — not a new project.</p>
            </div>
          </div>
          {onOpenTrends ? (
            <button
              type="button"
              onClick={onOpenTrends}
              className="text-xs font-semibold text-[var(--accent-bright)] hover:brightness-110 transition shrink-0"
            >
              Full Trends →
            </button>
          ) : null}
        </div>

        {trendTldr ? (
          <div className="space-y-3">
            <div className="rounded-xl bg-[color-mix(in_srgb,var(--ink)_4%,transparent)] p-3.5 ring-1 ring-[var(--card-border)]">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Cpu size={14} className="text-[var(--accent)]" />
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-soft)]">
                  Tech signal
                </p>
              </div>
              <p className="font-semibold text-[var(--ink)] leading-snug">{trendTldr.tech.title}</p>
              <p className="text-sm text-[var(--ink-soft)] mt-1 leading-relaxed">
                {trendTldr.topTechItem?.summary ?? trendTldr.tech.why}
              </p>
              <p className="text-sm text-[var(--ink)] mt-2 leading-relaxed">
                <span className="font-medium">Do:</span> {trendTldr.tech.oneAction}
              </p>
            </div>
            <div className="rounded-xl bg-[color-mix(in_srgb,var(--ink)_4%,transparent)] p-3.5 ring-1 ring-[var(--card-border)]">
              <div className="flex items-center gap-1.5 mb-1.5">
                <MapPin size={14} className="text-[var(--ember)]" />
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-soft)]">
                  DMV / money pulse
                </p>
              </div>
              <p className="font-semibold text-[var(--ink)] leading-snug">{trendTldr.dmv.title}</p>
              <p className="text-sm text-[var(--ink-soft)] mt-1 leading-relaxed">{trendTldr.dmv.why}</p>
            </div>
            {trendTldr.focusGuardrail ? (
              <p className="text-xs text-[var(--muted)] leading-relaxed">{trendTldr.focusGuardrail}</p>
            ) : null}
          </div>
        ) : (
          <div className="rounded-xl bg-[color-mix(in_srgb,var(--ink)_4%,transparent)] p-3.5 ring-1 ring-[var(--card-border)]">
            <p className="text-sm text-[var(--ink-soft)] leading-relaxed">
              No digest yet for today. Open Trends once to generate a skim — Overview will surface the
              TLDR here without reinventing your day.
            </p>
            {onOpenTrends ? (
              <button
                type="button"
                onClick={onOpenTrends}
                className="mt-3 text-sm font-semibold text-[var(--accent-bright)] hover:brightness-110 transition"
              >
                Generate today&apos;s Trends →
              </button>
            ) : null}
          </div>
        )}
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
        {onOpenTrends ? (
          <button
            type="button"
            onClick={onOpenTrends}
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--card-solid)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] ring-1 ring-[var(--card-border)] hover:brightness-110 transition-colors"
          >
            <Cpu size={14} className="text-[var(--accent)]" />
            Trends
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

      {/* Quick cash — secondary */}
      <QuickCashGlance
        today={cashFlow.today}
        status={cfoBrief?.status}
        warning={cfoBrief?.spendingWarning}
        onExpand={() => setShowCashDetails(true)}
      />

      {priorityGoal ? (
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
      ) : null}

      <button
        type="button"
        onClick={() => setShowCashDetails(!showCashDetails)}
        className="w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold text-[var(--ink-soft)] hover:text-[var(--ink)] app-card hover:brightness-110 transition"
      >
        {showCashDetails ? "Hide cash details" : "Show cash, bills & spend"}
        {showCashDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {showCashDetails ? (
        <>
          <TodayCashFlowMeter today={cashFlow.today} status={cfoBrief?.status} />
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
                <h2 className="text-lg font-semibold text-[var(--ink)]">Money brief</h2>
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
            {briefUpdatedLabel ? (
              <p className="mt-3 text-xs text-[var(--muted)]">
                Last brief: {briefUpdatedLabel}
                {nextBriefLabel ? ` · Next refresh around ${nextBriefLabel}` : ""}
              </p>
            ) : null}
          </div>

          <div className="app-card p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="app-label mb-2">Why this daily number</p>
                <h2 className="text-lg font-semibold text-[var(--ink)] leading-snug">
                  {formatCurrency(safeSpendToday)}/day is the food/fun target — gas and bills sit outside
                  it.
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
                  food/fun if most days stay near $40 — not money saved.
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

          {recurringReviews.length > 0 ? (
            <div className="app-card p-6">
              <div className="flex items-center justify-between gap-4 mb-4">
                <div>
                  <h2 className="font-semibold text-[var(--ink)] text-lg">Recurring to review</h2>
                  <p className="text-sm text-[var(--muted)]">
                    {recurringReviews.length} repeating charge
                    {recurringReviews.length === 1 ? "" : "s"} flagged by your Coach.
                  </p>
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
          ) : null}

          {dailySpendSeries.some((d) => d.totalSpent > 0) ? (
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
                    <Tooltip content={<DailySpendTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="totalSpent"
                      stroke="var(--accent)"
                      strokeWidth={2.5}
                      dot={false}
                      name="Spent"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
