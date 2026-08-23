"use client";

import { formatCurrency } from "@/lib/format";
import { getStatusStyle } from "@/lib/cash-flow";
import type {
  DailySpendPoint,
  MonthlyCashFlowByChecking,
  MonthlyCashFlowPoint,
  TodayCashFlow,
  WeeklyCashFlow,
} from "@/lib/cash-flow";
import { userNow } from "@/lib/user-timezone";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Flame, Sparkles, Target } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DAY_SHAPE_LABEL, type TodayOverviewResponse } from "@/components/today/planner-shared";
import { BillCalendar } from "./bill-calendar";
import { MonthlyCashFlowChart } from "./monthly-cash-flow-chart";
import { WeeklyCashFlowStrip } from "./weekly-cash-flow-strip";

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
      className="max-w-[240px] rounded-xl px-3 py-2.5 text-sm shadow-lg"
      style={{
        border: "1px solid var(--card-border)",
        background: "var(--card-solid)",
        color: "var(--ink)",
      }}
    >
      <p className="mb-1 font-semibold tabular-nums">{label}</p>
      <p className="mb-2 tabular-nums">
        Total: <span className="font-bold">{formatCurrency(point.totalSpent)}</span>
      </p>
      {!hasSpend ? (
        <p className="text-xs text-[var(--muted)]">No spending counted this day.</p>
      ) : (
        <>
          {breakdown.length > 0 ? (
            <div className="mb-2 space-y-1">
              <p className="app-label text-[10px]">By type</p>
              {breakdown.map((item) => (
                <div key={item.label} className="flex justify-between gap-3 text-xs">
                  <span className="truncate text-[var(--ink-soft)]">{item.label}</span>
                  <span className="shrink-0 tabular-nums">{formatCurrency(item.amount)}</span>
                </div>
              ))}
            </div>
          ) : null}
          {topMerchants.length > 0 ? (
            <div className="space-y-1 border-t border-[var(--card-border)] pt-2">
              <p className="app-label text-[10px]">Top places</p>
              {topMerchants.map((item) => (
                <div key={item.label} className="flex justify-between gap-3 text-xs">
                  <span className="truncate text-[var(--ink-soft)]">{item.label}</span>
                  <span className="shrink-0 tabular-nums">{formatCurrency(item.amount)}</span>
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
    recurringTransactionsToReview?: RecurringReview[];
  };
  cashFlow: {
    today: TodayCashFlow;
    weekly: WeeklyCashFlow;
    primaryCash?: number;
  };
  briefUpdatedLabel: string | null;
  nextBriefLabel: string | null;
  refreshHours?: number;
  dailySpendSeries: DailySpendPoint[];
  monthlyCashFlowSeries?: MonthlyCashFlowPoint[];
  monthlyCashFlowByChecking?: MonthlyCashFlowByChecking | null;
  onOpenChat: () => void;
  onOpenRecurring?: () => void;
  onOpenToday?: () => void;
  onOpenGrowth?: () => void;
  onOpenGoals?: () => void;
  isBriefPending?: boolean;
};

export function OverviewHome({
  aiInsight,
  cashFlow,
  briefUpdatedLabel,
  nextBriefLabel,
  refreshHours,
  dailySpendSeries,
  monthlyCashFlowSeries = [],
  monthlyCashFlowByChecking = null,
  onOpenChat,
  onOpenRecurring,
  onOpenToday,
  onOpenGrowth,
  onOpenGoals,
  isBriefPending = false,
}: Props) {
  const cfoBrief = aiInsight.cfoBrief;
  const recurringReviews = aiInsight.recurringTransactionsToReview ?? [];
  const statusStyle = getStatusStyle(cfoBrief?.status);
  const statusLabel = cfoBrief?.status ?? `${aiInsight.financialHealthScore ?? "—"}/100`;
  const checkingCash = cashFlow.primaryCash ?? null;
  const todayLabel = userNow().toFormat("EEE, MMM d");

  const { data: todayOverview } = useQuery({
    queryKey: ["overview-today"],
    queryFn: async () => {
      const res = await fetch("/api/today");
      if (!res.ok) throw new Error("Failed to load today");
      return res.json() as Promise<TodayOverviewResponse>;
    },
    staleTime: 60_000,
    retry: false,
  });

  const brief = todayOverview?.brief;
  const todayEvents = todayOverview?.calendar?.events?.length ?? 0;
  const gtmDone = todayOverview?.entrepreneurship?.weekDoneCount ?? 0;

  return (
    <div className="mx-auto max-w-lg space-y-3">
      {isBriefPending ? (
        <div className="rounded-xl bg-amber-500/15 px-3 py-2.5 text-sm text-amber-950 ring-1 ring-amber-400/35 dark:text-amber-100">
          Cash is ready. Brief still generating.
        </div>
      ) : null}

      <header className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
            {brief ? `${DAY_SHAPE_LABEL[brief.dayShape]} · ${todayLabel}` : todayLabel}
          </p>
          <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-[var(--ink)]">Overview</h1>
        </div>
        <span
          className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${statusStyle.bg} ${statusStyle.text} ${statusStyle.ring}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${statusStyle.dot}`} />
          {statusLabel}
        </span>
      </header>

      {brief?.plan.summary ? (
        <p className="text-sm leading-snug text-[var(--ink-soft)]">{brief.plan.summary}</p>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        {onOpenToday ? (
          <button
            type="button"
            onClick={onOpenToday}
            className="rounded-2xl bg-[var(--card-solid)] p-3 text-left ring-1 ring-[var(--card-border)]"
          >
            <p className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
              <CalendarDays size={12} />
              Today
            </p>
            <p className="mt-1 text-sm font-semibold text-[var(--ink)]">
              {todayEvents > 0 ? `${todayEvents} on calendar` : "Open the day"}
            </p>
          </button>
        ) : null}
        {onOpenGrowth ? (
          <button
            type="button"
            onClick={onOpenGrowth}
            className="rounded-2xl bg-[var(--card-solid)] p-3 text-left ring-1 ring-[var(--card-border)]"
          >
            <p className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
              <Flame size={12} />
              Growth
            </p>
            <p className="mt-1 text-sm font-semibold text-[var(--ink)]">GTM · {gtmDone} done this week</p>
          </button>
        ) : null}
        {onOpenGoals ? (
          <button
            type="button"
            onClick={onOpenGoals}
            className="col-span-2 rounded-2xl bg-[var(--card-solid)] p-3 text-left ring-1 ring-[var(--card-border)]"
          >
            <p className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
              <Target size={12} />
              Goals
            </p>
            <p className="mt-1 text-sm font-semibold text-[var(--ink)]">Long-term targets</p>
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-[var(--card-solid)] p-3 ring-1 ring-[var(--card-border)]">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Checking</p>
          <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-[var(--ink)]">
            {checkingCash != null ? formatCurrency(checkingCash) : "—"}
          </p>
        </div>
        <div className="rounded-2xl bg-[var(--card-solid)] p-3 ring-1 ring-[var(--card-border)]">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Food/fun left</p>
          <p
            className={`mt-1 text-2xl font-bold tabular-nums tracking-tight ${
              cashFlow.today.remainingToday < 0 ? "text-rose-500" : "text-[var(--ink)]"
            }`}
          >
            {formatCurrency(Math.max(0, cashFlow.today.remainingToday))}
          </p>
          <p className="mt-0.5 text-[10px] tabular-nums text-[var(--muted)]">
            of {formatCurrency(cashFlow.today.dailyAllowance)}
          </p>
        </div>
      </div>

      {cfoBrief?.todaysMove ? (
        <p className="text-sm leading-snug text-[var(--ink-soft)]">{cfoBrief.todaysMove}</p>
      ) : null}

      {monthlyCashFlowSeries.length > 0 ? (
        <MonthlyCashFlowChart months={monthlyCashFlowSeries} byChecking={monthlyCashFlowByChecking} />
      ) : null}

      <WeeklyCashFlowStrip weekly={cashFlow.weekly} />
      <BillCalendar
        upcomingBills={cfoBrief?.upcomingBills}
        incomeExpected={cfoBrief?.incomeExpected}
        onAskChat={onOpenChat}
      />

      <div className="app-card p-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-[var(--accent-strong)]" />
            <h2 className="text-base font-semibold text-[var(--ink)]">Brief</h2>
          </div>
          {refreshHours ? (
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
              {refreshHours}h
            </span>
          ) : null}
        </div>
        <p className="text-sm leading-relaxed text-[var(--ink-soft)]">
          {cfoBrief?.cashSafety ?? aiInsight.dailySummary}
        </p>
        {briefUpdatedLabel ? (
          <p className="mt-2 text-[11px] text-[var(--muted)]">
            {briefUpdatedLabel}
            {nextBriefLabel ? ` · next ${nextBriefLabel}` : ""}
          </p>
        ) : null}
      </div>

      {recurringReviews.length > 0 && onOpenRecurring ? (
        <button
          type="button"
          onClick={onOpenRecurring}
          className="w-full rounded-2xl bg-[var(--card-solid)] p-3 text-left ring-1 ring-[var(--card-border)]"
        >
          <p className="font-semibold text-[var(--ink)]">
            {recurringReviews.length} recurring to review
          </p>
          <p className="mt-0.5 text-sm text-[var(--muted)]">Open Recurring</p>
        </button>
      ) : null}

      {dailySpendSeries.some((d) => d.totalSpent > 0) ? (
        <div className="app-card p-4">
          <h2 className="mb-4 font-semibold text-[var(--ink)]">Spend · 30 days</h2>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailySpendSeries}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.25)" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "var(--muted)" }}
                  tickMargin={8}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "var(--muted)" }}
                  tickFormatter={(val) => `$${val}`}
                  axisLine={false}
                  tickLine={false}
                  width={36}
                />
                <Tooltip content={<DailySpendTooltip />} />
                <Line type="monotone" dataKey="totalSpent" stroke="var(--accent)" strokeWidth={2.5} dot={false} name="Spent" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}
    </div>
  );
}
