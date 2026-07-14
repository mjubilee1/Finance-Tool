"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DateTime } from "luxon";
import { formatCurrency } from "@/lib/format";
import { getDailyAffirmation, getPersonalizedGreeting } from "@/lib/daily-affirmation";
import { getStatusStyle } from "@/lib/cash-flow";
import type { TodayCashFlow, WeeklyCashFlow, DailySpendPoint } from "@/lib/cash-flow";
import { WeeklyCashFlowStrip } from "./weekly-cash-flow-strip";
import { BillCalendar } from "./bill-calendar";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Flame,
  MessageSquare,
  Quote,
  RefreshCw,
  SkipForward,
  Sparkles,
} from "lucide-react";
import { TodayPlannerList, WeekAheadPlanner } from "./planner-board";

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
    date: string;
    dayShape: "office" | "wfh" | "weekend";
    dayLabel: string;
    dateLabel: string;
    plan: {
      summary: string;
      blocks: Array<{
        key: string;
        label: string;
        time: string;
        fit: string;
        why: string;
        role: string;
        priority: string;
        evidence: string | null;
      }>;
    };
    recommendation: {
      id: string;
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
    userPlanBlocks: Array<{
      id: string;
      title: string;
      domain: string;
      minutesSpent: number | null;
      notes: string | null;
      status: "planned" | "done" | "skipped";
      sortOrder: number;
      timeLabel: string | null;
      date: string;
      ref: string;
    }>;
    completedBlockKeys: string[];
    skippedBlockKeys: string[];
    plannerLayout: {
      order: string[];
      overrides: Record<string, unknown>;
    };
    planBlocks: Array<{
      key: string;
      label: string;
      time: string;
      fit: string;
      why: string;
      role: string;
      priority: string;
      evidence: string | null;
      status: "planned" | "done" | "skipped" | "hidden";
      ref: string;
      hidden: boolean;
    }>;
  };
  calendar: GoogleCalendarOverview | null;
  weekPlan?: WeeklyOperatingPlanOverview | null;
};

const DAY_SHAPE_LABEL: Record<TodayOverviewResponse["brief"]["dayShape"], string> = {
  office: "Office day",
  wfh: "WFH day",
  weekend: "Weekend",
};

type GoogleCalendarOverview = {
  connected: boolean;
  connectAvailable: boolean;
  status: "active" | "needs_reconnect" | "not_connected";
  connectedAt: string | null;
  lastSyncAt: string | null;
  events: Array<{
    id: string;
    title: string;
    start: string;
    end: string | null;
    allDay: boolean;
    location: string | null;
    htmlLink: string | null;
  }>;
  error?: string;
};

type WeeklyOperatingPlanOverview = {
  generatedAt: string;
  startDate: string;
  endDate: string;
  days: Array<{
    date: string;
    dateLabel: string;
    weekdayLabel: string;
    dayShape: "office" | "wfh" | "weekend";
    headline: string;
    valueFocus: string;
    blocks: Array<{
      id: string;
      type: "calendar" | "cash" | "focus" | "free" | "prep" | "recovery" | "review" | "training" | "work";
      priority: "locked" | "protect" | "optional" | "prep";
      label: string;
      time: string;
      why: string;
      source: "weekly_template" | "google_calendar" | "user_plan";
      sortKey: number;
      ref: string;
      status?: "planned" | "done" | "skipped" | "hidden";
      activityId?: string;
      domain?: string;
      calendarEventId?: string;
      location?: string | null;
      htmlLink?: string | null;
      editable?: boolean;
    }>;
  }>;
};

function formatCalendarEventTime(event: GoogleCalendarOverview["events"][number]) {
  if (event.allDay) return "All day";

  const start = DateTime.fromISO(event.start);
  const end = event.end ? DateTime.fromISO(event.end) : null;
  if (!start.isValid) return "Time TBD";

  const startLabel = start.toLocaleString(DateTime.TIME_SIMPLE);
  const endLabel = end?.isValid ? end.toLocaleString(DateTime.TIME_SIMPLE) : null;
  return endLabel ? `${startLabel}-${endLabel}` : startLabel;
}

function formatPlanRole(role: string) {
  if (role === "focus") return "Focus block";
  return `${role.charAt(0).toUpperCase()}${role.slice(1)} block`;
}

function GoogleCalendarAgenda({ calendar }: { calendar: GoogleCalendarOverview | null }) {
  if (!calendar) return null;

  const handleConnect = () => {
    window.location.assign("/api/integrations/google-calendar/connect");
  };
  const needsReconnect = calendar.status === "needs_reconnect" || Boolean(calendar.error);
  const showBanner = !calendar.connected || needsReconnect;

  if (showBanner) {
    return (
      <div className="mb-4 rounded-xl bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] p-3 ring-1 ring-[color-mix(in_srgb,var(--accent)_24%,transparent)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[var(--ink)]">
              {needsReconnect ? "Reconnect Google Calendar" : "Connect Google Calendar"}
            </p>
            <p className="text-xs text-[var(--muted)] mt-0.5 leading-relaxed">
              {calendar.error
                ? calendar.error
                : needsReconnect
                ? "Saved calendar credentials can’t be used anymore. Reconnect so Coach can create events again."
                : "Pull in appointments and let Coach create events from chat or voice."}
            </p>
          </div>
          <button
            type="button"
            onClick={handleConnect}
            disabled={!calendar.connectAvailable}
            className="rounded-full app-btn-primary px-3.5 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-60"
          >
            {needsReconnect ? "Reconnect" : "Connect"}
          </button>
        </div>
        {!calendar.connectAvailable ? (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
            Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable this.
          </p>
        ) : null}
      </div>
    );
  }

  return null;
}

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
    primaryCash?: number;
  };
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
  briefUpdatedLabel,
  nextBriefLabel,
  refreshHours,
  dailySpendSeries,
  onOpenChat,
  onOpenRecurring,
  onOpenGrowth,
  isBriefPending = false,
  userName,
}: Props) {
  const queryClient = useQueryClient();
  const [showCashDetails, setShowCashDetails] = useState(false);
  const [moveBusy, setMoveBusy] = useState<"done" | "skipped" | "recommend" | null>(null);
  const [calendarConnectMessage, setCalendarConnectMessage] = useState<string | null>(null);
  const cfoBrief = aiInsight.cfoBrief;
  const recurringReviews = aiInsight.recurringTransactionsToReview ?? [];
  const statusStyle = getStatusStyle(cfoBrief?.status);
  const statusLabel = cfoBrief?.status ?? `${aiInsight.financialHealthScore ?? "—"}/100`;
  const now = DateTime.local();
  const todayLabel = now.toFormat("EEEE, MMMM d");
  const greeting = getPersonalizedGreeting(userName);
  const quote = getDailyAffirmation();
  const checkingCash = cashFlow.primaryCash ?? null;

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
  const systemBlocks = brief?.planBlocks ?? brief?.plan.blocks.map((block) => ({
    ...block,
    status: (brief.completedBlockKeys.includes(block.key)
      ? "done"
      : brief.skippedBlockKeys.includes(block.key)
        ? "skipped"
        : "planned") as "planned" | "done" | "skipped" | "hidden",
    ref: `system:${block.key}`,
    hidden: false,
  })) ?? [];
  const userBlocks = brief?.userPlanBlocks ?? [];
  const leverageBlock = systemBlocks.find((block) => block.key === "leverage");
  const calendar = todayOverview?.calendar ?? null;
  const calendarEvents = calendar?.connected ? calendar.events : [];
  const plannerOrder = brief?.plannerLayout?.order ?? [];
  const todayDate = brief?.date ?? now.toISODate()!;
  const refreshPlanner = () => {
    void queryClient.invalidateQueries({ queryKey: ["overview-today"] });
    void queryClient.invalidateQueries({ queryKey: ["growth-dashboard"] });
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("google_calendar");
    if (!status) return;

    const reason = params.get("google_calendar_reason");
    if (status === "connected") {
      setCalendarConnectMessage("Google Calendar connected. Coach can create events now.");
      void queryClient.invalidateQueries({ queryKey: ["overview-today"] });
    } else {
      const reasonCopy =
        reason === "state"
          ? "OAuth session expired or cookies were blocked. Try Connect again."
          : reason === "denied"
            ? "Google access was denied."
            : reason === "exchange"
              ? "Google token exchange failed. Check GOOGLE_CLIENT_SECRET and redirect URI on Vercel."
              : "Google Calendar connection failed. Try Connect again.";
      setCalendarConnectMessage(reasonCopy);
    }

    params.delete("google_calendar");
    params.delete("google_calendar_reason");
    const next = params.toString();
    window.history.replaceState({}, "", next ? `${window.location.pathname}?${next}` : window.location.pathname);
  }, [queryClient]);

  const updateMoveStatus = async (id: string, status: "done" | "skipped") => {
    setMoveBusy(status);
    try {
      await fetch("/api/growth/recommend", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      void queryClient.invalidateQueries({ queryKey: ["overview-today"] });
      void queryClient.invalidateQueries({ queryKey: ["growth-dashboard"] });
    } finally {
      setMoveBusy(null);
    }
  };

  const generateMove = async (force = false) => {
    setMoveBusy("recommend");
    try {
      await fetch("/api/growth/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      void queryClient.invalidateQueries({ queryKey: ["overview-today"] });
      void queryClient.invalidateQueries({ queryKey: ["growth-dashboard"] });
    } finally {
      setMoveBusy(null);
    }
  };

  return (
    <div className="space-y-5 max-w-3xl">
      {isBriefPending ? (
        <div className="rounded-xl bg-amber-500/15 px-4 py-3 text-sm text-amber-950 dark:text-amber-100 ring-1 ring-amber-400/35">
          Cash is ready. Money brief still generating — Refresh if it doesn&apos;t show soon.
        </div>
      ) : null}

      {calendarConnectMessage ? (
        <div
          className={`rounded-xl px-4 py-3 text-sm ring-1 ${
            calendarConnectMessage.startsWith("Google Calendar connected")
              ? "bg-teal-500/15 text-teal-950 dark:text-teal-100 ring-teal-400/35"
              : "bg-amber-500/15 text-amber-950 dark:text-amber-100 ring-amber-400/35"
          }`}
        >
          {calendarConnectMessage}
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
              ? `${DAY_SHAPE_LABEL[brief.dayShape]} — here's your day.`
              : "Your day first. Cash stays quiet until you need it."}
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

      {/* Daily quote */}
      <div className="rounded-2xl bg-[var(--card-solid)] px-4 py-3 ring-1 ring-[var(--card-border)]">
        <div className="flex items-start gap-2.5">
          <Quote size={14} className="text-[var(--accent)] mt-0.5 shrink-0" />
          <p className="text-sm text-[var(--ink-soft)] leading-relaxed italic">
            &ldquo;{quote.message}&rdquo;
          </p>
        </div>
      </div>

      {/* Compact cash strip */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-[var(--card-solid)] p-4 ring-1 ring-[var(--card-border)]">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-[var(--muted)]">
            Checking
          </p>
          <p className="text-2xl font-bold tabular-nums text-[var(--ink)] mt-1 tracking-tight">
            {checkingCash != null ? formatCurrency(checkingCash) : "—"}
          </p>
        </div>
        <div className="rounded-2xl bg-[var(--card-solid)] p-4 ring-1 ring-[var(--card-border)]">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-[var(--muted)]">
            Food/fun left
          </p>
          <p
            className={`text-2xl font-bold tabular-nums mt-1 tracking-tight ${
              cashFlow.today.remainingToday < 0 ? "text-rose-500" : "text-[var(--ink)]"
            }`}
          >
            {formatCurrency(Math.max(0, cashFlow.today.remainingToday))}
          </p>
          <p className="text-[10px] text-[var(--muted)] mt-0.5 tabular-nums">
            of {formatCurrency(cashFlow.today.dailyAllowance)} today
          </p>
        </div>
      </div>

      {/* Today's schedule — main stage */}
      <div className="rounded-2xl bg-[var(--card-solid)] p-5 md:p-6 ring-1 ring-[var(--card-border)]">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center ring-1 ring-[color-mix(in_srgb,var(--accent)_28%,transparent)]">
              <CalendarDays size={18} className="text-[var(--accent-strong)] dark:text-[var(--accent-bright)]" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--accent-strong)] dark:text-[var(--accent-bright)]">
                Today&apos;s operating plan
              </p>
              <p className="text-sm text-[var(--muted)]">
                {brief?.plan.summary ?? "Protect the blocks that compound."}
              </p>
            </div>
          </div>
        </div>

        {todayLoading && !brief ? (
          <p className="text-sm text-[var(--muted)] py-6 text-center">Loading today&apos;s plan…</p>
        ) : (
          <>
            <GoogleCalendarAgenda calendar={calendar} />

            <TodayPlannerList
              date={todayDate}
              dayShape={brief?.dayShape}
              systemBlocks={systemBlocks}
              userBlocks={userBlocks}
              calendarEvents={calendarEvents}
              plannerOrder={plannerOrder}
              formatCalendarEventTime={formatCalendarEventTime}
              onChanged={refreshPlanner}
            />
          </>
        )}

        {brief?.recommendation?.action ? (
          <div className="mt-2 rounded-xl bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] p-3 ring-1 ring-[color-mix(in_srgb,var(--accent)_22%,transparent)]">
            <p className="text-[10px] uppercase tracking-wider font-bold text-[var(--accent-strong)] dark:text-[var(--accent-bright)] mb-1">
              Highest-leverage move
            </p>
            <p className="text-sm font-semibold text-[var(--ink)] leading-snug">
              {brief.recommendation.action}
            </p>
            {leverageBlock ? (
              <p className="text-xs text-[var(--muted)] mt-1">
                Fits in: {formatPlanRole(leverageBlock.role)} · {leverageBlock.time}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {brief.recommendation.status === "pending" ? (
                <>
                  <button
                    type="button"
                    onClick={() => updateMoveStatus(brief.recommendation!.id, "done")}
                    disabled={moveBusy !== null}
                    className="inline-flex items-center gap-1.5 rounded-full app-btn-primary px-3 py-1.5 text-xs disabled:opacity-60"
                  >
                    <CheckCircle2 size={14} />
                    Done
                  </button>
                  <button
                    type="button"
                    onClick={() => updateMoveStatus(brief.recommendation!.id, "skipped")}
                    disabled={moveBusy !== null}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--ink)_5%,transparent)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] ring-1 ring-[var(--card-border)] disabled:opacity-60"
                  >
                    <SkipForward size={14} />
                    Skip
                  </button>
                </>
              ) : (
                <>
                  <p className="text-xs font-semibold text-[var(--muted)] capitalize">
                    {brief.recommendation.status}
                  </p>
                  {brief.recommendation.status === "skipped" ? (
                    <button
                      type="button"
                      onClick={() => generateMove(true)}
                      disabled={moveBusy !== null}
                      className="inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-3 py-1.5 text-xs font-semibold text-[var(--accent-strong)] dark:text-[var(--accent-bright)] ring-1 ring-[color-mix(in_srgb,var(--accent)_24%,transparent)] disabled:opacity-60"
                    >
                      <RefreshCw size={14} />
                      Different move
                    </button>
                  ) : null}
                </>
              )}
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          {onOpenGrowth ? (
            <button
              type="button"
              onClick={onOpenGrowth}
              className="inline-flex items-center gap-1.5 rounded-full app-btn-primary px-3.5 py-2 text-xs"
            >
              <Flame size={14} />
              Open Growth
            </button>
          ) : null}
          <button
            type="button"
            onClick={onOpenChat}
            className="inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--ink)_5%,transparent)] px-3.5 py-2 text-xs font-semibold text-[var(--ink)] ring-1 ring-[var(--card-border)] hover:brightness-110 transition"
          >
            <MessageSquare size={14} />
            Ask Coach
          </button>
        </div>
      </div>

      <WeekAheadPlanner weekPlan={todayOverview?.weekPlan} onChanged={refreshPlanner} />

      <button
        type="button"
        onClick={() => setShowCashDetails(!showCashDetails)}
        className="w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold text-[var(--ink-soft)] hover:text-[var(--ink)] app-card hover:brightness-110 transition"
      >
        {showCashDetails ? "Hide cash details" : "Cash, bills & spend"}
        {showCashDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {showCashDetails ? (
        <>
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

          {recurringReviews.length > 0 && onOpenRecurring ? (
            <button
              type="button"
              onClick={onOpenRecurring}
              className="w-full app-card p-4 text-left hover:brightness-110 transition"
            >
              <p className="font-semibold text-[var(--ink)]">
                {recurringReviews.length} recurring charge
                {recurringReviews.length === 1 ? "" : "s"} to review
              </p>
              <p className="text-sm text-[var(--muted)] mt-0.5">Open Recurring →</p>
            </button>
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
