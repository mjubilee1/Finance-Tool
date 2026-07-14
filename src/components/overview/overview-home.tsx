"use client";

import { useEffect, useState, type ReactNode } from "react";
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
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Flame,
  MessageSquare,
  Pencil,
  Plus,
  Quote,
  RefreshCw,
  SkipForward,
  Sparkles,
  Trash2,
  X,
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
    date?: string;
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
    plannerLayout?: {
      order: string[];
      overrides: Record<string, unknown>;
    };
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
      ref?: string;
      status?: "planned" | "done" | "skipped" | "hidden";
      activityId?: string;
      domain?: string;
      calendarEventId?: string;
      location?: string | null;
      htmlLink?: string | null;
    }>;
  }>;
};

type PlanBlock = TodayOverviewResponse["brief"]["plan"]["blocks"][number];
type UserPlanBlock = TodayOverviewResponse["brief"]["userPlanBlocks"][number];
type CalendarEvent = GoogleCalendarOverview["events"][number];
type TimelineItem =
  | { type: "plan"; block: PlanBlock; blockIndex: number; sortKey: number; ref: string }
  | { type: "calendar"; event: CalendarEvent; sortKey: number; ref: string }
  | { type: "user"; block: UserPlanBlock; blockIndex: number; sortKey: number; ref: string };

type PlannerFormState = {
  title: string;
  timeLabel: string;
  notes: string;
  domain: string;
  date: string;
};

const PLANNER_DOMAINS = ["personal", "career", "fitness", "financial", "social", "startup"] as const;

async function plannerRequest(method: string, body?: Record<string, unknown>, id?: string) {
  const url = id ? `/api/planner?id=${encodeURIComponent(id)}` : "/api/planner";
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error || "Planner request failed");
  }
  return res.json();
}

function PlannerActionButton({
  label,
  onClick,
  disabled,
  children,
  tone = "neutral",
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
  tone?: "neutral" | "success" | "danger" | "accent";
}) {
  const toneClass =
    tone === "success"
      ? "bg-teal-500/25 text-teal-100 ring-teal-300/55"
      : tone === "danger"
        ? "bg-rose-500/25 text-rose-100 ring-rose-300/55"
        : tone === "accent"
          ? "bg-[var(--accent-soft)] text-[var(--accent-bright)] ring-[color-mix(in_srgb,var(--accent)_45%,transparent)]"
          : "bg-[color-mix(in_srgb,var(--ink)_14%,transparent)] text-[var(--ink)] ring-[color-mix(in_srgb,var(--ink)_32%,transparent)]";

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-9 min-w-9 touch-manipulation items-center justify-center gap-1 rounded-full px-2.5 text-[11px] font-semibold ring-1 hover:brightness-110 disabled:opacity-40 ${toneClass}`}
    >
      {children}
    </button>
  );
}

function SkipReasonForm({
  label,
  reason,
  onReasonChange,
  onSave,
  onCancel,
  busy,
}: {
  label: string;
  reason: string;
  onReasonChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <div className="mt-2 space-y-2 rounded-xl bg-[color-mix(in_srgb,var(--ink)_5%,transparent)] p-3 ring-1 ring-rose-400/35">
      <p className="text-xs font-semibold text-[var(--ink)]">Didn&apos;t do: {label}</p>
      <p className="text-[11px] leading-snug text-[var(--muted)]">
        Optional — why not? Coach uses this to give better schedule advice next time.
      </p>
      <textarea
        value={reason}
        onChange={(e) => onReasonChange(e.target.value)}
        placeholder="Ex: too tired after work, client call ran late, cash was covered already"
        rows={2}
        className="w-full rounded-lg bg-[var(--card-solid)] px-3 py-2 text-sm text-[var(--ink)] ring-1 ring-[var(--card-border)] outline-none focus:ring-[var(--accent)]"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={busy}
          className="rounded-full bg-rose-500/90 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
        >
          Save skipped
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-full bg-[color-mix(in_srgb,var(--ink)_8%,transparent)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] ring-1 ring-[var(--card-border)]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function PlannerItemForm({
  form,
  onChange,
  onSave,
  onCancel,
  busy,
  saveLabel,
}: {
  form: PlannerFormState;
  onChange: (next: PlannerFormState) => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
  saveLabel: string;
}) {
  return (
    <div className="mt-2 space-y-2 rounded-xl bg-[color-mix(in_srgb,var(--ink)_3%,transparent)] p-3 ring-1 ring-[var(--card-border)]">
      <input
        value={form.title}
        onChange={(e) => onChange({ ...form, title: e.target.value })}
        placeholder="What to protect or do"
        className="w-full rounded-lg bg-[var(--card-solid)] px-3 py-2 text-sm text-[var(--ink)] ring-1 ring-[var(--card-border)] outline-none focus:ring-[var(--accent)]"
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          value={form.timeLabel}
          onChange={(e) => onChange({ ...form, timeLabel: e.target.value })}
          placeholder="Time (optional)"
          className="rounded-lg bg-[var(--card-solid)] px-3 py-2 text-sm text-[var(--ink)] ring-1 ring-[var(--card-border)] outline-none focus:ring-[var(--accent)]"
        />
        <select
          value={form.domain}
          onChange={(e) => onChange({ ...form, domain: e.target.value })}
          className="rounded-lg bg-[var(--card-solid)] px-3 py-2 text-sm text-[var(--ink)] ring-1 ring-[var(--card-border)] outline-none focus:ring-[var(--accent)]"
        >
          {PLANNER_DOMAINS.map((domain) => (
            <option key={domain} value={domain}>
              {domain}
            </option>
          ))}
        </select>
      </div>
      <input
        type="date"
        value={form.date}
        onChange={(e) => onChange({ ...form, date: e.target.value })}
        className="w-full rounded-lg bg-[var(--card-solid)] px-3 py-2 text-sm text-[var(--ink)] ring-1 ring-[var(--card-border)] outline-none focus:ring-[var(--accent)]"
      />
      <textarea
        value={form.notes}
        onChange={(e) => onChange({ ...form, notes: e.target.value })}
        placeholder="Notes (optional)"
        rows={2}
        className="w-full rounded-lg bg-[var(--card-solid)] px-3 py-2 text-sm text-[var(--ink)] ring-1 ring-[var(--card-border)] outline-none focus:ring-[var(--accent)]"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={busy || !form.title.trim()}
          className="rounded-full app-btn-primary px-3 py-1.5 text-xs disabled:opacity-60"
        >
          {saveLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-full bg-[color-mix(in_srgb,var(--ink)_5%,transparent)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] ring-1 ring-[var(--card-border)]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function formatCalendarEventTime(event: GoogleCalendarOverview["events"][number]) {
  if (event.allDay) return "All day";

  const start = DateTime.fromISO(event.start);
  const end = event.end ? DateTime.fromISO(event.end) : null;
  if (!start.isValid) return "Time TBD";

  const startLabel = start.toLocaleString(DateTime.TIME_SIMPLE);
  const endLabel = end?.isValid ? end.toLocaleString(DateTime.TIME_SIMPLE) : null;
  return endLabel ? `${startLabel}-${endLabel}` : startLabel;
}

function calendarEventSortKey(event: CalendarEvent) {
  if (event.allDay) return 0.5;

  const start = DateTime.fromISO(event.start);
  if (!start.isValid) return 23.9;

  return start.hour + start.minute / 60;
}

function formatPlanRole(role: string) {
  if (role === "focus") return "Focus block";
  return `${role.charAt(0).toUpperCase()}${role.slice(1)} block`;
}

function planBlockSortKey(block: PlanBlock, dayShape: TodayOverviewResponse["brief"]["dayShape"] | undefined) {
  if (block.key === "lyft") return dayShape === "office" ? 7.5 : 16;
  if (block.key === "gym") return dayShape === "weekend" ? 11 : 17.5;
  if (block.key === "leverage") return dayShape === "office" ? 13 : 10;
  if (block.key === "joy") return dayShape === "weekend" ? 16 : 20;
  return 23;
}

function buildTimelineItems(
  systemBlocks: PlanBlock[],
  userBlocks: UserPlanBlock[],
  calendarEvents: CalendarEvent[],
  dayShape: TodayOverviewResponse["brief"]["dayShape"] | undefined,
  customOrder: string[] = [],
): TimelineItem[] {
  const base: TimelineItem[] = [
    ...systemBlocks.map((block, blockIndex) => ({
      type: "plan" as const,
      block,
      blockIndex,
      sortKey: planBlockSortKey(block, dayShape),
      ref: `system:${block.key}`,
    })),
    ...calendarEvents.map((event) => ({
      type: "calendar" as const,
      event,
      sortKey: calendarEventSortKey(event),
      ref: `calendar:${event.id}`,
    })),
    ...userBlocks.map((block, blockIndex) => ({
      type: "user" as const,
      block,
      blockIndex,
      sortKey: 24 + blockIndex / 10,
      ref: block.ref || `user:${block.id}`,
    })),
  ];

  if (!customOrder.length) {
    return base.sort((a, b) => a.sortKey - b.sortKey);
  }

  const byRef = new Map(base.map((item) => [item.ref, item]));
  const used = new Set<string>();
  const ordered: TimelineItem[] = [];
  for (const ref of customOrder) {
    const item = byRef.get(ref);
    if (!item || used.has(ref)) continue;
    ordered.push(item);
    used.add(ref);
  }
  for (const item of base.sort((a, b) => a.sortKey - b.sortKey)) {
    if (used.has(item.ref)) continue;
    ordered.push(item);
  }
  return ordered;
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

function weeklyBlockTone(block: WeeklyOperatingPlanOverview["days"][number]["blocks"][number]) {
  if (block.source === "google_calendar") {
    return "bg-teal-500/10 text-teal-700 ring-teal-400/30 dark:text-teal-300";
  }
  if (block.source === "user_plan") {
    return "bg-[color-mix(in_srgb,var(--ember)_16%,transparent)] text-[var(--ember-strong)] ring-[color-mix(in_srgb,var(--ember)_30%,transparent)]";
  }
  if (block.priority === "protect") {
    return "bg-[var(--accent-soft)] text-[var(--accent-strong)] ring-[color-mix(in_srgb,var(--accent)_24%,transparent)] dark:text-[var(--accent-bright)]";
  }
  if (block.priority === "prep") {
    return "bg-[color-mix(in_srgb,var(--ember)_16%,transparent)] text-[var(--ember-strong)] ring-[color-mix(in_srgb,var(--ember)_30%,transparent)]";
  }
  if (block.priority === "locked") {
    return "bg-[color-mix(in_srgb,var(--ink)_7%,transparent)] text-[var(--ink-soft)] ring-[var(--card-border)]";
  }
  return "bg-[color-mix(in_srgb,var(--ink)_4%,transparent)] text-[var(--muted)] ring-[var(--card-border)]";
}

function WeekAhead({
  weekPlan,
  onChanged,
}: {
  weekPlan: WeeklyOperatingPlanOverview | null | undefined;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [addingDate, setAddingDate] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [skipTarget, setSkipTarget] = useState<{
    date: string;
    blockKey: string;
    activityId?: string;
    label: string;
  } | null>(null);
  const [skipReason, setSkipReason] = useState("");
  const [form, setForm] = useState<PlannerFormState>({
    title: "",
    timeLabel: "",
    notes: "",
    domain: "personal",
    date: "",
  });
  const [error, setError] = useState<string | null>(null);

  if (!weekPlan?.days.length) return null;

  const run = async (key: string, work: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await work();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-2xl bg-[var(--card-solid)] p-4 sm:p-5 ring-1 ring-[var(--card-border)]">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--accent-strong)] dark:text-[var(--accent-bright)]">
            Week ahead
          </p>
          <h2 className="mt-1 text-lg font-semibold text-[var(--ink)]">Your operating script</h2>
          <p className="mt-0.5 text-sm text-[var(--muted)]">
            Check off what landed, skip what didn&apos;t, and leave a quick why so Coach gets sharper.
          </p>
        </div>
        <span className="w-fit shrink-0 rounded-full bg-[var(--accent-soft)] px-3 py-1 text-[11px] font-semibold text-[var(--accent-strong)] ring-1 ring-[color-mix(in_srgb,var(--accent)_24%,transparent)] dark:text-[var(--accent-bright)]">
          {weekPlan.startDate} → {weekPlan.endDate}
        </span>
      </div>

      {error ? (
        <p className="mb-3 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-400/30 dark:text-rose-300">
          {error}
        </p>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        {weekPlan.days.map((day) => {
          const visibleBlocks = day.blocks
            .filter((block) =>
              block.source === "google_calendar" ||
              block.source === "user_plan" ||
              block.priority === "protect" ||
              block.priority === "prep" ||
              block.type === "cash" ||
              block.type === "work",
            )
            .slice(0, 6);
          const refs = visibleBlocks.map((block) => block.ref || `week:${block.id}`);

          return (
            <div key={day.date} className="rounded-xl bg-[color-mix(in_srgb,var(--ink)_3%,transparent)] p-3 ring-1 ring-[var(--card-border)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--ink)]">
                    {day.weekdayLabel} · {day.dateLabel}
                  </p>
                  <p className="text-xs text-[var(--muted)] mt-0.5">{DAY_SHAPE_LABEL[day.dayShape]}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="rounded-full bg-[color-mix(in_srgb,var(--ink)_6%,transparent)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
                    {day.blocks.some((block) => block.source === "google_calendar")
                      ? "Booked"
                      : day.blocks.some((block) => block.source === "user_plan")
                        ? "Custom"
                        : "Rails"}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setAddingDate(day.date);
                      setEditingId(null);
                      setForm({
                        title: "",
                        timeLabel: "",
                        notes: "",
                        domain: "personal",
                        date: day.date,
                      });
                    }}
                    className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--ink)_6%,transparent)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] hover:brightness-110"
                  >
                    <Plus size={10} />
                    Add
                  </button>
                </div>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-[var(--ink-soft)]">{day.valueFocus}</p>

              <div className="mt-3 space-y-2">
                {visibleBlocks.map((block, index) => {
                  const isDone = block.status === "done";
                  const isSkipped = block.status === "skipped";
                  const ref = block.ref || `week:${block.id}`;
                  const isUser = block.source === "user_plan" && block.activityId;
                  const skipKey = `${day.date}:${block.id}`;
                  const isSkipping =
                    skipTarget?.date === day.date &&
                    skipTarget.blockKey === block.id;
                  return (
                    <div key={block.id} className={`rounded-lg px-2.5 py-2 ring-1 ${weeklyBlockTone(block)}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          {block.htmlLink ? (
                            <a
                              href={block.htmlLink}
                              target="_blank"
                              rel="noreferrer"
                              className={`block text-xs font-semibold leading-snug hover:brightness-110 ${isDone ? "line-through opacity-70" : ""} ${isSkipped ? "opacity-70" : ""}`}
                            >
                              {block.label}
                            </a>
                          ) : (
                            <p className={`text-xs font-semibold leading-snug ${isDone ? "line-through opacity-70" : ""} ${isSkipped ? "opacity-70" : ""}`}>
                              {block.label}
                            </p>
                          )}
                        </div>
                        <p className="shrink-0 text-[10px] font-medium tabular-nums opacity-80">{block.time}</p>
                      </div>
                      <p className="mt-0.5 line-clamp-3 text-[11px] leading-snug opacity-80">{block.why}</p>
                      {isDone ? (
                        <p className="mt-1 text-[11px] font-semibold text-teal-300">Done</p>
                      ) : isSkipped ? (
                        <p className="mt-1 text-[11px] font-semibold text-rose-300">Skipped</p>
                      ) : null}

                      {block.source !== "google_calendar" ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <PlannerActionButton
                            label="Move up"
                            disabled={index === 0 || busy !== null}
                            onClick={() =>
                              void run(`week-up-${ref}`, async () => {
                                const order = [...refs];
                                const i = order.indexOf(ref);
                                if (i <= 0) return;
                                [order[i - 1], order[i]] = [order[i], order[i - 1]];
                                await plannerRequest("PATCH", { action: "reorder", date: day.date, order });
                              })
                            }
                          >
                            <ArrowUp size={14} />
                          </PlannerActionButton>
                          <PlannerActionButton
                            label="Move down"
                            disabled={index === visibleBlocks.length - 1 || busy !== null}
                            onClick={() =>
                              void run(`week-down-${ref}`, async () => {
                                const order = [...refs];
                                const i = order.indexOf(ref);
                                if (i < 0 || i >= order.length - 1) return;
                                [order[i], order[i + 1]] = [order[i + 1], order[i]];
                                await plannerRequest("PATCH", { action: "reorder", date: day.date, order });
                              })
                            }
                          >
                            <ArrowDown size={14} />
                          </PlannerActionButton>
                          <PlannerActionButton
                            label={isDone ? "Undo done" : "Mark done"}
                            tone="success"
                            disabled={busy !== null}
                            onClick={() =>
                              void run(`week-done-${ref}`, async () => {
                                if (isUser) {
                                  await plannerRequest("PATCH", {
                                    id: block.activityId,
                                    status: isDone ? "planned" : "done",
                                  });
                                } else {
                                  await plannerRequest("PATCH", {
                                    action: "system",
                                    date: day.date,
                                    blockKey: block.id,
                                    status: isDone ? "planned" : "done",
                                  });
                                }
                              })
                            }
                          >
                            <Check size={14} />
                            <span className="hidden sm:inline">Done</span>
                          </PlannerActionButton>
                          <PlannerActionButton
                            label={isSkipped ? "Undo skipped" : "Didn't do"}
                            tone="danger"
                            disabled={busy !== null}
                            onClick={() => {
                              if (isSkipped) {
                                void run(`week-unskip-${skipKey}`, async () => {
                                  if (isUser) {
                                    await plannerRequest("PATCH", {
                                      id: block.activityId,
                                      status: "planned",
                                    });
                                  } else {
                                    await plannerRequest("PATCH", {
                                      action: "system",
                                      date: day.date,
                                      blockKey: block.id,
                                      status: "planned",
                                    });
                                  }
                                });
                                return;
                              }
                              setEditingId(null);
                              setAddingDate(null);
                              setSkipTarget({
                                date: day.date,
                                blockKey: block.id,
                                activityId: block.activityId,
                                label: block.label,
                              });
                              setSkipReason("");
                            }}
                          >
                            <X size={14} />
                            <span className="hidden sm:inline">Skip</span>
                          </PlannerActionButton>
                          {isUser ? (
                            <>
                              <PlannerActionButton
                                label="Edit"
                                tone="accent"
                                disabled={busy !== null}
                                onClick={() => {
                                  setSkipTarget(null);
                                  setEditingId(block.activityId!);
                                  setAddingDate(null);
                                  setForm({
                                    title: block.label,
                                    timeLabel: block.time === "Your block" ? "" : block.time,
                                    notes: block.why.includes(" · added to your plan") ? "" : block.why,
                                    domain: block.domain || "personal",
                                    date: day.date,
                                  });
                                }}
                              >
                                <Pencil size={14} />
                              </PlannerActionButton>
                              <PlannerActionButton
                                label="Remove"
                                disabled={busy !== null}
                                onClick={() =>
                                  void run(`week-del-${block.activityId}`, async () => {
                                    await plannerRequest("DELETE", undefined, block.activityId);
                                  })
                                }
                              >
                                <Trash2 size={14} />
                              </PlannerActionButton>
                            </>
                          ) : null}
                        </div>
                      ) : null}

                      {isSkipping ? (
                        <SkipReasonForm
                          label={block.label}
                          reason={skipReason}
                          onReasonChange={setSkipReason}
                          busy={busy !== null}
                          onCancel={() => {
                            setSkipTarget(null);
                            setSkipReason("");
                          }}
                          onSave={() =>
                            void run(`week-skip-${skipKey}`, async () => {
                              const notes = skipReason.trim() || "Skipped from week planner.";
                              if (skipTarget?.activityId) {
                                await plannerRequest("PATCH", {
                                  id: skipTarget.activityId,
                                  status: "skipped",
                                  notes,
                                });
                              } else {
                                await plannerRequest("PATCH", {
                                  action: "system",
                                  date: day.date,
                                  blockKey: block.id,
                                  status: "skipped",
                                  notes,
                                });
                              }
                              setSkipTarget(null);
                              setSkipReason("");
                            })
                          }
                        />
                      ) : null}

                      {editingId && block.activityId === editingId ? (
                        <PlannerItemForm
                          form={form}
                          onChange={setForm}
                          busy={busy !== null}
                          saveLabel="Save"
                          onCancel={() => setEditingId(null)}
                          onSave={() =>
                            void run(`week-edit-${block.activityId}`, async () => {
                              await plannerRequest("PATCH", {
                                id: block.activityId,
                                title: form.title,
                                domain: form.domain,
                                notes: form.notes || null,
                                timeLabel: form.timeLabel || null,
                                date: form.date,
                              });
                              setEditingId(null);
                            })
                          }
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>

              {addingDate === day.date ? (
                <PlannerItemForm
                  form={form}
                  onChange={setForm}
                  busy={busy !== null}
                  saveLabel="Add to day"
                  onCancel={() => setAddingDate(null)}
                  onSave={() =>
                    void run("week-create", async () => {
                      await plannerRequest("POST", {
                        date: form.date || day.date,
                        title: form.title,
                        domain: form.domain,
                        notes: form.notes || null,
                        timeLabel: form.timeLabel || null,
                      });
                      setAddingDate(null);
                    })
                  }
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
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
  const [plannerBusy, setPlannerBusy] = useState<string | null>(null);
  const [plannerError, setPlannerError] = useState<string | null>(null);
  const [addingItem, setAddingItem] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [todaySkipTarget, setTodaySkipTarget] = useState<{
    kind: "system" | "user";
    key: string;
    label: string;
  } | null>(null);
  const [todaySkipReason, setTodaySkipReason] = useState("");
  const [plannerForm, setPlannerForm] = useState<PlannerFormState>({
    title: "",
    timeLabel: "",
    notes: "",
    domain: "personal",
    date: DateTime.local().toISODate()!,
  });
  const cfoBrief = aiInsight.cfoBrief;
  const recurringReviews = aiInsight.recurringTransactionsToReview ?? [];
  const statusStyle = getStatusStyle(cfoBrief?.status);
  const statusLabel = cfoBrief?.status ?? `${aiInsight.financialHealthScore ?? "—"}/100`;
  const now = DateTime.local();
  const todayLabel = now.toFormat("EEEE, MMMM d");
  const greeting = getPersonalizedGreeting(userName);
  const quote = getDailyAffirmation();
  const checkingCash = cashFlow.primaryCash ?? null;

  const { data: todayOverview, isLoading: todayLoading, isError: todayError } = useQuery({
    queryKey: ["overview-today"],
    queryFn: async () => {
      const res = await fetch("/api/today");
      if (!res.ok) {
        throw new Error("Failed to load today's plan");
      }
      return res.json() as Promise<TodayOverviewResponse>;
    },
    staleTime: 60_000,
    retry: false,
  });

  const brief = todayOverview?.brief;
  const completed = new Set(brief?.completedBlockKeys ?? []);
  const skipped = new Set(brief?.skippedBlockKeys ?? []);
  const systemBlocks = brief?.plan.blocks ?? [];
  const userBlocks = brief?.userPlanBlocks ?? [];
  const leverageBlock = systemBlocks.find((block) => block.key === "leverage");
  const calendar = todayOverview?.calendar ?? null;
  const calendarEvents = calendar?.connected ? calendar.events : [];
  const plannerOrder = brief?.plannerLayout?.order ?? [];
  const todayDate = brief?.date ?? now.toISODate()!;
  const timelineItems = buildTimelineItems(
    systemBlocks,
    userBlocks,
    calendarEvents,
    brief?.dayShape,
    plannerOrder,
  );
  const refreshPlanner = () => {
    void queryClient.invalidateQueries({ queryKey: ["overview-today"] });
    void queryClient.invalidateQueries({ queryKey: ["growth-dashboard"] });
  };

  const runPlanner = async (key: string, work: () => Promise<void>) => {
    setPlannerBusy(key);
    setPlannerError(null);
    try {
      await work();
      refreshPlanner();
    } catch (err) {
      setPlannerError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPlannerBusy(null);
    }
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
        ) : todayError && !brief ? (
          <p className="text-sm text-rose-700 dark:text-rose-300 py-6 text-center">
            Couldn&apos;t load today&apos;s plan. Try Reload — if this keeps happening, the planner
            database migration may still need to run.
          </p>
        ) : (
          <>
            <GoogleCalendarAgenda calendar={calendar} />

            {plannerError ? (
              <p className="mb-3 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-400/30 dark:text-rose-300">
                {plannerError}
              </p>
            ) : null}

            <ol className="space-y-0">
              {timelineItems.map((item, index) => {
                const showConnector = index < timelineItems.length - 1;
                const canMoveUp = index > 0;
                const canMoveDown = index < timelineItems.length - 1;
                const moveItem = (direction: -1 | 1) =>
                  void runPlanner(`move-${item.ref}`, async () => {
                    const refs = timelineItems.map((row) => row.ref);
                    const i = refs.indexOf(item.ref);
                    const next = i + direction;
                    if (i < 0 || next < 0 || next >= refs.length) return;
                    const order = [...refs];
                    const [removed] = order.splice(i, 1);
                    order.splice(next, 0, removed);
                    await plannerRequest("PATCH", { action: "reorder", date: todayDate, order });
                  });

                if (item.type === "calendar") {
                  return (
                    <li key={`calendar-${item.event.id}`} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 bg-teal-500/10 text-teal-700 ring-1 ring-teal-400/35 dark:text-teal-300">
                          <CalendarDays size={14} />
                        </div>
                        {showConnector ? (
                          <div className="w-px flex-1 min-h-[1.25rem] bg-[var(--card-border)] my-1" />
                        ) : null}
                      </div>
                      <div className="flex-1 pb-4">
                        <div className="rounded-xl bg-[color-mix(in_srgb,var(--ink)_3%,transparent)] px-3 py-2 -mt-1 ring-1 ring-[var(--card-border)]">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            {item.event.htmlLink ? (
                              <a
                                href={item.event.htmlLink}
                                target="_blank"
                                rel="noreferrer"
                                className="font-semibold text-[var(--ink)] hover:text-[var(--accent)]"
                              >
                                {item.event.title}
                              </a>
                            ) : (
                              <p className="font-semibold text-[var(--ink)]">{item.event.title}</p>
                            )}
                            <p className="text-xs font-medium tabular-nums text-[var(--muted)]">
                              {formatCalendarEventTime(item.event)}
                            </p>
                          </div>
                          <p className="text-xs text-[var(--muted)] mt-1 leading-snug">
                            Google Calendar{item.event.location ? ` · ${item.event.location}` : ""}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <PlannerActionButton label="Move up" disabled={!canMoveUp || plannerBusy !== null} onClick={() => moveItem(-1)}>
                              <ArrowUp size={14} />
                            </PlannerActionButton>
                            <PlannerActionButton label="Move down" disabled={!canMoveDown || plannerBusy !== null} onClick={() => moveItem(1)}>
                              <ArrowDown size={14} />
                            </PlannerActionButton>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                }

                if (item.type === "user") {
                  const block = item.block;
                  const isDone = block.status === "done";
                  const isEditing = editingItemId === block.id;

                  return (
                    <li key={`user-${block.id}`} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <button
                          type="button"
                          aria-label={isDone ? "Mark not done" : "Mark done"}
                          disabled={plannerBusy !== null}
                          onClick={() =>
                            void runPlanner(`user-done-${block.id}`, async () => {
                              await plannerRequest("PATCH", {
                                id: block.id,
                                status: isDone ? "planned" : "done",
                              });
                            })
                          }
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ring-1 ${
                            isDone
                              ? "bg-teal-500/20 text-teal-700 ring-teal-400/40"
                              : "bg-[color-mix(in_srgb,var(--ember)_18%,transparent)] text-[var(--ember-strong)] ring-[color-mix(in_srgb,var(--ember)_35%,transparent)]"
                          }`}
                        >
                          {isDone ? <Check size={14} /> : "+"}
                        </button>
                        {showConnector ? (
                          <div className="w-px flex-1 min-h-[1.25rem] bg-[var(--card-border)] my-1" />
                        ) : null}
                      </div>
                      <div className={`flex-1 pb-2 ${isDone ? "opacity-70" : ""}`}>
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className={`font-semibold text-[var(--ink)] ${isDone ? "line-through" : ""}`}>{block.title}</p>
                          <p className="text-xs font-medium tabular-nums text-[var(--muted)]">
                            {block.timeLabel || (block.minutesSpent != null ? `${block.minutesSpent} min` : "")}
                          </p>
                        </div>
                        <p className="text-xs text-[var(--muted)] mt-0.5 capitalize">
                          {block.domain} · your block
                          {isDone ? " · done" : block.status === "skipped" ? " · skipped" : ""}
                        </p>
                        {block.notes ? (
                          <p className="text-sm text-[var(--ink-soft)] mt-0.5 leading-relaxed">{block.notes}</p>
                        ) : null}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <PlannerActionButton label="Move up" disabled={!canMoveUp || plannerBusy !== null} onClick={() => moveItem(-1)}>
                            <ArrowUp size={14} />
                          </PlannerActionButton>
                          <PlannerActionButton label="Move down" disabled={!canMoveDown || plannerBusy !== null} onClick={() => moveItem(1)}>
                            <ArrowDown size={14} />
                          </PlannerActionButton>
                          <PlannerActionButton
                            label={isDone ? "Undo done" : "Mark done"}
                            tone="success"
                            disabled={plannerBusy !== null}
                            onClick={() =>
                              void runPlanner(`user-done-${block.id}`, async () => {
                                await plannerRequest("PATCH", {
                                  id: block.id,
                                  status: isDone ? "planned" : "done",
                                });
                              })
                            }
                          >
                            <Check size={14} />
                            <span className="sm:inline">Done</span>
                          </PlannerActionButton>
                          <PlannerActionButton
                            label={block.status === "skipped" ? "Undo skipped" : "Didn't do"}
                            tone="danger"
                            disabled={plannerBusy !== null}
                            onClick={() => {
                              if (block.status === "skipped") {
                                void runPlanner(`user-unskip-${block.id}`, async () => {
                                  await plannerRequest("PATCH", { id: block.id, status: "planned" });
                                });
                                return;
                              }
                              setEditingItemId(null);
                              setAddingItem(false);
                              setTodaySkipTarget({ kind: "user", key: block.id, label: block.title });
                              setTodaySkipReason("");
                            }}
                          >
                            <X size={14} />
                            <span className="sm:inline">Skip</span>
                          </PlannerActionButton>
                          <PlannerActionButton
                            label="Edit"
                            tone="accent"
                            disabled={plannerBusy !== null}
                            onClick={() => {
                              setTodaySkipTarget(null);
                              setEditingItemId(block.id);
                              setAddingItem(false);
                              setPlannerForm({
                                title: block.title,
                                timeLabel: block.timeLabel ?? "",
                                notes: block.notes ?? "",
                                domain: block.domain,
                                date: block.date || todayDate,
                              });
                            }}
                          >
                            <Pencil size={14} />
                          </PlannerActionButton>
                          <PlannerActionButton
                            label="Remove"
                            disabled={plannerBusy !== null}
                            onClick={() =>
                              void runPlanner(`user-del-${block.id}`, async () => {
                                await plannerRequest("DELETE", undefined, block.id);
                                if (editingItemId === block.id) setEditingItemId(null);
                              })
                            }
                          >
                            <Trash2 size={14} />
                          </PlannerActionButton>
                        </div>
                        {todaySkipTarget?.kind === "user" && todaySkipTarget.key === block.id ? (
                          <SkipReasonForm
                            label={block.title}
                            reason={todaySkipReason}
                            onReasonChange={setTodaySkipReason}
                            busy={plannerBusy !== null}
                            onCancel={() => {
                              setTodaySkipTarget(null);
                              setTodaySkipReason("");
                            }}
                            onSave={() =>
                              void runPlanner(`user-skip-${block.id}`, async () => {
                                await plannerRequest("PATCH", {
                                  id: block.id,
                                  status: "skipped",
                                  notes: todaySkipReason.trim() || block.notes || "Skipped from today planner.",
                                });
                                setTodaySkipTarget(null);
                                setTodaySkipReason("");
                              })
                            }
                          />
                        ) : null}
                        {isEditing ? (
                          <PlannerItemForm
                            form={plannerForm}
                            onChange={setPlannerForm}
                            busy={plannerBusy !== null}
                            saveLabel="Save"
                            onCancel={() => setEditingItemId(null)}
                            onSave={() =>
                              void runPlanner(`user-edit-${block.id}`, async () => {
                                await plannerRequest("PATCH", {
                                  id: block.id,
                                  title: plannerForm.title,
                                  domain: plannerForm.domain,
                                  notes: plannerForm.notes || null,
                                  timeLabel: plannerForm.timeLabel || null,
                                  date: plannerForm.date || todayDate,
                                });
                                setEditingItemId(null);
                              })
                            }
                          />
                        ) : null}
                      </div>
                    </li>
                  );
                }

                const block = item.block;
                const isDone = completed.has(block.key);
                const isSkipped = skipped.has(block.key);
                const isFocus = block.key === "leverage";

                return (
                  <li key={block.key} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <button
                        type="button"
                        aria-label={isDone ? "Mark not done" : "Mark done"}
                        disabled={plannerBusy !== null}
                        onClick={() =>
                          void runPlanner(`sys-done-${block.key}`, async () => {
                            await plannerRequest("PATCH", {
                              action: "system",
                              date: todayDate,
                              blockKey: block.key,
                              status: isDone ? "planned" : "done",
                            });
                          })
                        }
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ring-1 ${
                          isDone
                            ? "bg-teal-500/20 text-teal-700 ring-teal-400/40"
                            : isSkipped
                              ? "bg-[color-mix(in_srgb,var(--ink)_8%,transparent)] text-[var(--muted)] ring-[var(--card-border)]"
                              : isFocus
                                ? "bg-[var(--accent)] text-white ring-[var(--accent)]"
                                : "bg-[var(--accent-soft)] text-[var(--accent-strong)] ring-[color-mix(in_srgb,var(--accent)_28%,transparent)]"
                        }`}
                      >
                        {isDone ? <Check size={14} /> : item.blockIndex + 1}
                      </button>
                      {showConnector ? (
                        <div className="w-px flex-1 min-h-[1.25rem] bg-[var(--card-border)] my-1" />
                      ) : null}
                    </div>
                    <div
                      className={`flex-1 pb-4 ${
                        isSkipped ? "opacity-50" : ""
                      } ${isFocus && !isDone && !isSkipped ? "rounded-xl bg-[var(--accent-soft)] px-3 py-2 -mt-1 ring-1 ring-[color-mix(in_srgb,var(--accent)_22%,transparent)]" : ""}`}
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className={`font-semibold text-[var(--ink)] ${isDone ? "line-through" : ""}`}>
                          {block.label}
                          {isFocus && !isDone ? (
                            <span className="ml-2 text-[10px] uppercase tracking-wider font-bold text-[var(--accent-strong)]">
                              Protect
                            </span>
                          ) : null}
                        </p>
                        <p className="text-xs font-medium tabular-nums text-[var(--muted)]">{block.time}</p>
                      </div>
                      <p className="text-sm text-[var(--ink-soft)] mt-0.5 leading-relaxed">{block.why}</p>
                      <p className="text-xs text-[var(--muted)] mt-1 leading-snug">
                        {block.priority} · {block.fit}
                      </p>
                      {isSkipped ? (
                        <p className="text-xs text-[var(--muted)] mt-1">Skipped</p>
                      ) : isDone ? (
                        <p className="text-xs text-teal-700 dark:text-teal-300 mt-1">Done</p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <PlannerActionButton label="Move up" disabled={!canMoveUp || plannerBusy !== null} onClick={() => moveItem(-1)}>
                          <ArrowUp size={14} />
                        </PlannerActionButton>
                        <PlannerActionButton label="Move down" disabled={!canMoveDown || plannerBusy !== null} onClick={() => moveItem(1)}>
                          <ArrowDown size={14} />
                        </PlannerActionButton>
                        <PlannerActionButton
                          label={isDone ? "Undo done" : "Mark done"}
                          tone="success"
                          disabled={plannerBusy !== null}
                          onClick={() =>
                            void runPlanner(`sys-done-${block.key}`, async () => {
                              await plannerRequest("PATCH", {
                                action: "system",
                                date: todayDate,
                                blockKey: block.key,
                                status: isDone ? "planned" : "done",
                              });
                            })
                          }
                        >
                          <Check size={14} />
                          <span className="sm:inline">Done</span>
                        </PlannerActionButton>
                        <PlannerActionButton
                          label={isSkipped ? "Undo skipped" : "Didn't do"}
                          tone="danger"
                          disabled={plannerBusy !== null}
                          onClick={() => {
                            if (isSkipped) {
                              void runPlanner(`sys-unskip-${block.key}`, async () => {
                                await plannerRequest("PATCH", {
                                  action: "system",
                                  date: todayDate,
                                  blockKey: block.key,
                                  status: "planned",
                                });
                              });
                              return;
                            }
                            setEditingItemId(null);
                            setAddingItem(false);
                            setTodaySkipTarget({ kind: "system", key: block.key, label: block.label });
                            setTodaySkipReason("");
                          }}
                        >
                          <X size={14} />
                          <span className="sm:inline">Skip</span>
                        </PlannerActionButton>
                      </div>
                      {todaySkipTarget?.kind === "system" && todaySkipTarget.key === block.key ? (
                        <SkipReasonForm
                          label={block.label}
                          reason={todaySkipReason}
                          onReasonChange={setTodaySkipReason}
                          busy={plannerBusy !== null}
                          onCancel={() => {
                            setTodaySkipTarget(null);
                            setTodaySkipReason("");
                          }}
                          onSave={() =>
                            void runPlanner(`sys-skip-${block.key}`, async () => {
                              await plannerRequest("PATCH", {
                                action: "system",
                                date: todayDate,
                                blockKey: block.key,
                                status: "skipped",
                                notes: todaySkipReason.trim() || "Skipped from today planner.",
                              });
                              setTodaySkipTarget(null);
                              setTodaySkipReason("");
                            })
                          }
                        />
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>

            {addingItem ? (
              <PlannerItemForm
                form={plannerForm}
                onChange={setPlannerForm}
                busy={plannerBusy !== null}
                saveLabel="Add to plan"
                onCancel={() => setAddingItem(false)}
                onSave={() =>
                  void runPlanner("create", async () => {
                    await plannerRequest("POST", {
                      date: plannerForm.date || todayDate,
                      title: plannerForm.title,
                      domain: plannerForm.domain,
                      notes: plannerForm.notes || null,
                      timeLabel: plannerForm.timeLabel || null,
                    });
                    setAddingItem(false);
                    setPlannerForm({
                      title: "",
                      timeLabel: "",
                      notes: "",
                      domain: "personal",
                      date: todayDate,
                    });
                  })
                }
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  setAddingItem(true);
                  setEditingItemId(null);
                  setPlannerForm({
                    title: "",
                    timeLabel: "",
                    notes: "",
                    domain: "personal",
                    date: todayDate,
                  });
                }}
                className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--ink)_5%,transparent)] px-3.5 py-2 text-xs font-semibold text-[var(--ink)] ring-1 ring-[var(--card-border)] hover:brightness-110"
              >
                <Plus size={14} />
                Add item
              </button>
            )}
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

      <WeekAhead weekPlan={todayOverview?.weekPlan} onChanged={refreshPlanner} />

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
