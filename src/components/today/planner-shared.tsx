"use client";

import { type ReactNode } from "react";
import { calendarDateTime } from "@/lib/user-timezone";

export type TodayOverviewResponse = {
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
  entrepreneurship?: {
    sectionLabel: string;
    weeklyTargets: string[];
    weekDoneCount: number;
    stage: string;
    upcomingInterviewTitle: string | null;
  } | null;
};

export const DAY_SHAPE_LABEL: Record<TodayOverviewResponse["brief"]["dayShape"], string> = {
  office: "Office",
  wfh: "WFH",
  weekend: "Weekend",
};

export type GoogleCalendarOverview = {
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

export type WeeklyOperatingPlanOverview = {
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

export type PlanBlock = TodayOverviewResponse["brief"]["plan"]["blocks"][number];
export type UserPlanBlock = TodayOverviewResponse["brief"]["userPlanBlocks"][number];
export type CalendarEvent = GoogleCalendarOverview["events"][number];
export type TimelineItem =
  | { type: "plan"; block: PlanBlock; blockIndex: number; sortKey: number; ref: string }
  | { type: "calendar"; event: CalendarEvent; sortKey: number; ref: string }
  | { type: "user"; block: UserPlanBlock; blockIndex: number; sortKey: number; ref: string };

export type PlannerFormState = {
  title: string;
  timeLabel: string;
  notes: string;
  domain: string;
  date: string;
};

export const PLANNER_DOMAINS = ["personal", "career", "fitness", "financial", "social", "startup"] as const;

export function isEntrepreneurshipBlock(block: { notes?: string | null }) {
  return Boolean(block.notes?.includes("entrepreneurship:"));
}

export function displayPlannerNotes(notes: string | null | undefined) {
  if (!notes) return null;
  const cleaned = notes.replace(/\n*\s*entrepreneurship:[a-z_]+\s*/gi, "\n").trim();
  return cleaned || null;
}

export function preserveEntrepreneurshipMarker(existingNotes: string | null | undefined, nextNotes: string) {
  const match = existingNotes?.match(/entrepreneurship:[a-z_]+/i);
  if (!match?.[0]) return nextNotes;
  if (nextNotes.includes(match[0])) return nextNotes;
  const base = nextNotes.trim();
  return base ? `${base}\n\n${match[0]}` : match[0];
}

export async function plannerRequest(method: string, body?: Record<string, unknown>, id?: string) {
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

export function PlannerActionButton({
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
      className={`inline-flex h-10 min-w-10 touch-manipulation items-center justify-center gap-1 rounded-full px-3 text-xs font-semibold ring-1 hover:brightness-110 disabled:opacity-40 ${toneClass}`}
    >
      {children}
    </button>
  );
}

export function SkipReasonForm({
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
      <textarea
        value={reason}
        onChange={(e) => onReasonChange(e.target.value)}
        placeholder="Why not? (optional)"
        rows={2}
        className="w-full rounded-lg bg-[var(--card-solid)] px-3 py-2 text-sm text-[var(--ink)] ring-1 ring-[var(--card-border)] outline-none focus:ring-[var(--accent)]"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={busy}
          className="min-h-10 rounded-full bg-rose-500/90 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
        >
          Save skipped
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="min-h-10 rounded-full bg-[color-mix(in_srgb,var(--ink)_8%,transparent)] px-3 py-2 text-xs font-semibold text-[var(--ink)] ring-1 ring-[var(--card-border)]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function PlannerItemForm({
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
        className="w-full rounded-lg bg-[var(--card-solid)] px-3 py-2.5 text-sm text-[var(--ink)] ring-1 ring-[var(--card-border)] outline-none focus:ring-[var(--accent)]"
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          value={form.timeLabel}
          onChange={(e) => onChange({ ...form, timeLabel: e.target.value })}
          placeholder="Time"
          className="rounded-lg bg-[var(--card-solid)] px-3 py-2.5 text-sm text-[var(--ink)] ring-1 ring-[var(--card-border)] outline-none focus:ring-[var(--accent)]"
        />
        <select
          value={form.domain}
          onChange={(e) => onChange({ ...form, domain: e.target.value })}
          className="rounded-lg bg-[var(--card-solid)] px-3 py-2.5 text-sm text-[var(--ink)] ring-1 ring-[var(--card-border)] outline-none focus:ring-[var(--accent)]"
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
        className="w-full rounded-lg bg-[var(--card-solid)] px-3 py-2.5 text-sm text-[var(--ink)] ring-1 ring-[var(--card-border)] outline-none focus:ring-[var(--accent)]"
      />
      <textarea
        value={form.notes}
        onChange={(e) => onChange({ ...form, notes: e.target.value })}
        placeholder="Notes (optional)"
        rows={2}
        className="w-full rounded-lg bg-[var(--card-solid)] px-3 py-2.5 text-sm text-[var(--ink)] ring-1 ring-[var(--card-border)] outline-none focus:ring-[var(--accent)]"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={busy || !form.title.trim()}
          className="min-h-10 rounded-full app-btn-primary px-4 py-2 text-xs disabled:opacity-60"
        >
          {saveLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="min-h-10 rounded-full bg-[color-mix(in_srgb,var(--ink)_5%,transparent)] px-4 py-2 text-xs font-semibold text-[var(--ink)] ring-1 ring-[var(--card-border)]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function formatCalendarEventTime(event: GoogleCalendarOverview["events"][number]) {
  if (event.allDay) return "All day";

  const start = calendarDateTime(event.start);
  const end = event.end ? calendarDateTime(event.end) : null;
  if (!start.isValid) return "TBD";

  const startLabel = start.toFormat("h:mm a").replace(":00", "");
  const endLabel = end?.isValid ? end.toFormat("h:mm a").replace(":00", "") : null;
  return endLabel ? `${startLabel}–${endLabel}` : startLabel;
}

export function shortTimeLabel(value: string | null | undefined) {
  if (!value) return "—";
  return value.replace(":00", "").replace(" ", "");
}

function calendarEventSortKey(event: CalendarEvent) {
  if (event.allDay) return 0.5;

  const start = calendarDateTime(event.start);
  if (!start.isValid) return 23.9;

  return start.hour + start.minute / 60;
}

export function formatPlanRole(role: string) {
  if (role === "focus") return "Focus";
  return `${role.charAt(0).toUpperCase()}${role.slice(1)}`;
}

function planBlockSortKey(block: PlanBlock, dayShape: TodayOverviewResponse["brief"]["dayShape"] | undefined) {
  if (block.key === "gym") return dayShape === "weekend" ? 11 : 17.5;
  if (block.key === "leverage") return dayShape === "office" ? 18 : 10;
  if (block.key === "joy") return dayShape === "weekend" ? 16 : 20;
  return 23;
}

/** Lower = higher on the list. Main thing first (Covey: protect leverage before optional). */
export function timelinePriorityRank(item: TimelineItem): number {
  if (item.type === "calendar") return 2;
  if (item.type === "plan") {
    if (item.block.key === "leverage" || item.block.priority === "protect") return 1;
    if (item.block.priority === "locked") return 2;
    if (item.block.key === "joy" || item.block.priority === "optional") return 8;
    return 5;
  }
  const domain = item.block.domain;
  if (domain === "startup" || domain === "career") return 3;
  if (domain === "financial" || domain === "fitness") return 4;
  return 6;
}

export function timelinePriorityLabel(item: TimelineItem): string {
  if (item.type === "calendar") return "Booked";
  if (item.type === "plan") {
    if (item.block.key === "leverage" || item.block.priority === "protect") return "Main";
    if (item.block.priority === "locked") return "Locked";
    if (item.block.key === "joy" || item.block.priority === "optional") return "Optional";
    return formatPlanRole(item.block.role);
  }
  if (item.block.domain === "startup" || item.block.domain === "career") return "Protect";
  return item.block.domain;
}

export function buildTimelineItems(
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

export function weeklyBlockTone(block: WeeklyOperatingPlanOverview["days"][number]["blocks"][number]) {
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
