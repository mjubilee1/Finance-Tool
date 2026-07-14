"use client";

import { useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Check,
  CheckCircle2,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";

export type PlannerItemStatus = "planned" | "done" | "skipped" | "hidden";

export type PlannerUserBlock = {
  id: string;
  title: string;
  domain: string;
  minutesSpent: number | null;
  notes: string | null;
  status: Exclude<PlannerItemStatus, "hidden">;
  sortOrder: number;
  timeLabel: string | null;
  date: string;
  ref: string;
};

export type PlannerSystemBlock = {
  key: string;
  label: string;
  time: string;
  fit: string;
  why: string;
  role: string;
  priority: string;
  evidence: string | null;
  status: PlannerItemStatus;
  ref: string;
  hidden?: boolean;
};

export type PlannerCalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string | null;
  allDay: boolean;
  location: string | null;
  htmlLink: string | null;
};

export type WeekPlanBlock = {
  id: string;
  label: string;
  time: string;
  why: string;
  source: "weekly_template" | "google_calendar" | "user_plan";
  ref: string;
  status?: PlannerItemStatus;
  activityId?: string;
  domain?: string;
  htmlLink?: string | null;
  editable?: boolean;
  priority: string;
  type: string;
};

type BusyKey = string | null;

type PlannerItemForm = {
  title: string;
  timeLabel: string;
  notes: string;
  domain: string;
  date: string;
};

const DOMAINS = ["personal", "career", "fitness", "financial", "social", "startup"] as const;

function emptyForm(date: string): PlannerItemForm {
  return {
    title: "",
    timeLabel: "",
    notes: "",
    domain: "personal",
    date,
  };
}

async function plannerFetch(method: string, body?: Record<string, unknown>, id?: string) {
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

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--ink)_5%,transparent)] text-[var(--ink-soft)] ring-1 ring-[var(--card-border)] hover:brightness-110 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function PlannerItemEditor({
  form,
  onChange,
  onSave,
  onCancel,
  busy,
  saveLabel,
}: {
  form: PlannerItemForm;
  onChange: (next: PlannerItemForm) => void;
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
          {DOMAINS.map((domain) => (
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

export function TodayPlannerList({
  date,
  dayShape,
  systemBlocks,
  userBlocks,
  calendarEvents,
  plannerOrder,
  formatCalendarEventTime,
  onChanged,
}: {
  date: string;
  dayShape: "office" | "wfh" | "weekend" | undefined;
  systemBlocks: PlannerSystemBlock[];
  userBlocks: PlannerUserBlock[];
  calendarEvents: PlannerCalendarEvent[];
  plannerOrder: string[];
  formatCalendarEventTime: (event: PlannerCalendarEvent) => string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<BusyKey>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PlannerItemForm>(() => emptyForm(date));
  const [error, setError] = useState<string | null>(null);

  type TimelineItem =
    | { type: "plan"; block: PlannerSystemBlock; ref: string; sortKey: number }
    | { type: "user"; block: PlannerUserBlock; ref: string; sortKey: number }
    | { type: "calendar"; event: PlannerCalendarEvent; ref: string; sortKey: number };

  const planSortKey = (block: PlannerSystemBlock) => {
    if (block.key === "lyft") return dayShape === "office" ? 7.5 : 16;
    if (block.key === "gym") return dayShape === "weekend" ? 11 : 17.5;
    if (block.key === "leverage") return dayShape === "office" ? 13 : 10;
    if (block.key === "joy") return dayShape === "weekend" ? 16 : 20;
    return 23;
  };

  const calendarSortKey = (event: PlannerCalendarEvent) => {
    if (event.allDay) return 0.5;
    const start = new Date(event.start);
    if (Number.isNaN(start.getTime())) return 23.9;
    return start.getHours() + start.getMinutes() / 60;
  };

  const baseItems: TimelineItem[] = [
    ...systemBlocks.map((block) => ({
      type: "plan" as const,
      block,
      ref: block.ref,
      sortKey: planSortKey(block),
    })),
    ...userBlocks.map((block, index) => ({
      type: "user" as const,
      block,
      ref: block.ref,
      sortKey: 24 + index / 10,
    })),
    ...calendarEvents.map((event) => ({
      type: "calendar" as const,
      event,
      ref: `calendar:${event.id}`,
      sortKey: calendarSortKey(event),
    })),
  ];

  const byRef = new Map(baseItems.map((item) => [item.ref, item]));
  const used = new Set<string>();
  const timeline: TimelineItem[] = [];
  for (const ref of plannerOrder) {
    const item = byRef.get(ref);
    if (!item || used.has(ref)) continue;
    timeline.push(item);
    used.add(ref);
  }
  for (const item of baseItems.sort((a, b) => a.sortKey - b.sortKey)) {
    if (used.has(item.ref)) continue;
    timeline.push(item);
  }

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

  const moveItem = async (ref: string, direction: -1 | 1) => {
    const refs = timeline.map((item) => item.ref);
    const index = refs.indexOf(ref);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= refs.length) return;
    const order = [...refs];
    const [removed] = order.splice(index, 1);
    order.splice(next, 0, removed);
    await run(`move-${ref}`, async () => {
      await plannerFetch("PATCH", { action: "reorder", date, order });
    });
  };

  const toggleUserStatus = async (block: PlannerUserBlock) => {
    const status = block.status === "done" ? "planned" : "done";
    await run(`status-${block.id}`, async () => {
      await plannerFetch("PATCH", { id: block.id, status });
    });
  };

  const toggleSystemStatus = async (block: PlannerSystemBlock) => {
    const status = block.status === "done" ? "planned" : "done";
    await run(`sys-${block.key}`, async () => {
      await plannerFetch("PATCH", {
        action: "system",
        date,
        blockKey: block.key,
        status,
      });
    });
  };

  const removeUser = async (id: string) => {
    await run(`delete-${id}`, async () => {
      await plannerFetch("DELETE", undefined, id);
      if (editingId === id) setEditingId(null);
    });
  };

  const hideSystem = async (block: PlannerSystemBlock) => {
    await run(`hide-${block.key}`, async () => {
      await plannerFetch("PATCH", {
        action: "system",
        date,
        blockKey: block.key,
        status: "hidden",
      });
    });
  };

  const saveNew = async () => {
    await run("create", async () => {
      await plannerFetch("POST", {
        date: form.date || date,
        title: form.title,
        domain: form.domain,
        notes: form.notes || null,
        timeLabel: form.timeLabel || null,
      });
      setAdding(false);
      setForm(emptyForm(date));
    });
  };

  const saveEdit = async (id: string) => {
    await run(`edit-${id}`, async () => {
      await plannerFetch("PATCH", {
        id,
        title: form.title,
        domain: form.domain,
        notes: form.notes || null,
        timeLabel: form.timeLabel || null,
        date: form.date || date,
      });
      setEditingId(null);
      setForm(emptyForm(date));
    });
  };

  return (
    <div>
      {error ? (
        <p className="mb-3 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-400/30 dark:text-rose-300">
          {error}
        </p>
      ) : null}

      <ol className="space-y-0">
        {timeline.map((item, index) => {
          const showConnector = index < timeline.length - 1;
          const canMoveUp = index > 0;
          const canMoveDown = index < timeline.length - 1;

          if (item.type === "calendar") {
            return (
              <li key={item.ref} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-500/10 text-teal-700 ring-1 ring-teal-400/35 dark:text-teal-300">
                    <CalendarDays size={14} />
                  </div>
                  {showConnector ? (
                    <div className="my-1 min-h-[1.25rem] w-px flex-1 bg-[var(--card-border)]" />
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
                    <p className="mt-1 text-xs leading-snug text-[var(--muted)]">
                      Google Calendar{item.event.location ? ` · ${item.event.location}` : ""}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <IconButton
                        label="Move up"
                        disabled={!canMoveUp || busy !== null}
                        onClick={() => void moveItem(item.ref, -1)}
                      >
                        <ArrowUp size={12} />
                      </IconButton>
                      <IconButton
                        label="Move down"
                        disabled={!canMoveDown || busy !== null}
                        onClick={() => void moveItem(item.ref, 1)}
                      >
                        <ArrowDown size={12} />
                      </IconButton>
                    </div>
                  </div>
                </div>
              </li>
            );
          }

          if (item.type === "user") {
            const block = item.block;
            const isDone = block.status === "done";
            const isEditing = editingId === block.id;

            return (
              <li key={item.ref} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <button
                    type="button"
                    aria-label={isDone ? "Mark not done" : "Mark done"}
                    onClick={() => void toggleUserStatus(block)}
                    disabled={busy !== null}
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ring-1 ${
                      isDone
                        ? "bg-teal-500/20 text-teal-700 ring-teal-400/40"
                        : "bg-[color-mix(in_srgb,var(--ember)_18%,transparent)] text-[var(--ember-strong)] ring-[color-mix(in_srgb,var(--ember)_35%,transparent)]"
                    }`}
                  >
                    {isDone ? <Check size={14} /> : "+"}
                  </button>
                  {showConnector ? (
                    <div className="my-1 min-h-[1.25rem] w-px flex-1 bg-[var(--card-border)]" />
                  ) : null}
                </div>
                <div className={`flex-1 pb-4 ${isDone ? "opacity-70" : ""}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className={`font-semibold text-[var(--ink)] ${isDone ? "line-through" : ""}`}>
                      {block.title}
                    </p>
                    <p className="text-xs font-medium tabular-nums text-[var(--muted)]">
                      {block.timeLabel || (block.minutesSpent != null ? `${block.minutesSpent} min` : "")}
                    </p>
                  </div>
                  <p className="mt-0.5 text-xs capitalize text-[var(--muted)]">
                    {block.domain} · your block{isDone ? " · done" : ""}
                  </p>
                  {block.notes ? (
                    <p className="mt-0.5 text-sm leading-relaxed text-[var(--ink-soft)]">{block.notes}</p>
                  ) : null}

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <IconButton
                      label="Move up"
                      disabled={!canMoveUp || busy !== null}
                      onClick={() => void moveItem(item.ref, -1)}
                    >
                      <ArrowUp size={12} />
                    </IconButton>
                    <IconButton
                      label="Move down"
                      disabled={!canMoveDown || busy !== null}
                      onClick={() => void moveItem(item.ref, 1)}
                    >
                      <ArrowDown size={12} />
                    </IconButton>
                    <IconButton
                      label="Edit"
                      disabled={busy !== null}
                      onClick={() => {
                        setEditingId(block.id);
                        setAdding(false);
                        setForm({
                          title: block.title,
                          timeLabel: block.timeLabel ?? "",
                          notes: block.notes ?? "",
                          domain: block.domain,
                          date: block.date || date,
                        });
                      }}
                    >
                      <Pencil size={12} />
                    </IconButton>
                    <IconButton
                      label="Remove"
                      disabled={busy !== null}
                      onClick={() => void removeUser(block.id)}
                    >
                      <Trash2 size={12} />
                    </IconButton>
                  </div>

                  {isEditing ? (
                    <PlannerItemEditor
                      form={form}
                      onChange={setForm}
                      onSave={() => void saveEdit(block.id)}
                      onCancel={() => {
                        setEditingId(null);
                        setForm(emptyForm(date));
                      }}
                      busy={busy !== null}
                      saveLabel="Save"
                    />
                  ) : null}
                </div>
              </li>
            );
          }

          const block = item.block;
          const isDone = block.status === "done";
          const isSkipped = block.status === "skipped";
          const isFocus = block.key === "leverage";

          return (
            <li key={item.ref} className="flex gap-3">
              <div className="flex flex-col items-center">
                <button
                  type="button"
                  aria-label={isDone ? "Mark not done" : "Mark done"}
                  onClick={() => void toggleSystemStatus(block)}
                  disabled={busy !== null}
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ring-1 ${
                    isDone
                      ? "bg-teal-500/20 text-teal-700 ring-teal-400/40"
                      : isSkipped
                        ? "bg-[color-mix(in_srgb,var(--ink)_8%,transparent)] text-[var(--muted)] ring-[var(--card-border)]"
                        : isFocus
                          ? "bg-[var(--accent)] text-white ring-[var(--accent)]"
                          : "bg-[var(--accent-soft)] text-[var(--accent-strong)] ring-[color-mix(in_srgb,var(--accent)_28%,transparent)]"
                  }`}
                >
                  {isDone ? <Check size={14} /> : index + 1}
                </button>
                {showConnector ? (
                  <div className="my-1 min-h-[1.25rem] w-px flex-1 bg-[var(--card-border)]" />
                ) : null}
              </div>
              <div
                className={`flex-1 pb-4 ${isSkipped ? "opacity-50" : ""} ${
                  isFocus && !isDone && !isSkipped
                    ? "rounded-xl bg-[var(--accent-soft)] px-3 py-2 -mt-1 ring-1 ring-[color-mix(in_srgb,var(--accent)_22%,transparent)]"
                    : ""
                }`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className={`font-semibold text-[var(--ink)] ${isDone ? "line-through" : ""}`}>
                    {block.label}
                    {isFocus && !isDone ? (
                      <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-[var(--accent-strong)]">
                        Protect
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs font-medium tabular-nums text-[var(--muted)]">{block.time}</p>
                </div>
                <p className="mt-0.5 text-sm leading-relaxed text-[var(--ink-soft)]">{block.why}</p>
                <p className="mt-1 text-xs leading-snug text-[var(--muted)]">
                  {block.priority} · {block.fit}
                </p>
                {isSkipped ? (
                  <p className="mt-1 text-xs text-[var(--muted)]">Skipped</p>
                ) : isDone ? (
                  <p className="mt-1 text-xs text-teal-700 dark:text-teal-300">Done</p>
                ) : null}

                <div className="mt-2 flex flex-wrap gap-1.5">
                  <IconButton
                    label="Move up"
                    disabled={!canMoveUp || busy !== null}
                    onClick={() => void moveItem(item.ref, -1)}
                  >
                    <ArrowUp size={12} />
                  </IconButton>
                  <IconButton
                    label="Move down"
                    disabled={!canMoveDown || busy !== null}
                    onClick={() => void moveItem(item.ref, 1)}
                  >
                    <ArrowDown size={12} />
                  </IconButton>
                  <IconButton
                    label="Mark done"
                    disabled={busy !== null}
                    onClick={() => void toggleSystemStatus(block)}
                  >
                    <CheckCircle2 size={12} />
                  </IconButton>
                  <IconButton
                    label="Remove from today"
                    disabled={busy !== null}
                    onClick={() => void hideSystem(block)}
                  >
                    <X size={12} />
                  </IconButton>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {adding ? (
        <PlannerItemEditor
          form={form}
          onChange={setForm}
          onSave={() => void saveNew()}
          onCancel={() => {
            setAdding(false);
            setForm(emptyForm(date));
          }}
          busy={busy !== null}
          saveLabel="Add to plan"
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setAdding(true);
            setEditingId(null);
            setForm(emptyForm(date));
          }}
          className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--ink)_5%,transparent)] px-3.5 py-2 text-xs font-semibold text-[var(--ink)] ring-1 ring-[var(--card-border)] hover:brightness-110"
        >
          <Plus size={14} />
          Add item
        </button>
      )}
    </div>
  );
}

function weeklyTone(block: WeekPlanBlock) {
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

export function WeekAheadPlanner({
  weekPlan,
  onChanged,
}: {
  weekPlan: {
    startDate: string;
    endDate: string;
    days: Array<{
      date: string;
      dateLabel: string;
      weekdayLabel: string;
      dayShape: "office" | "wfh" | "weekend";
      valueFocus: string;
      blocks: WeekPlanBlock[];
    }>;
  } | null | undefined;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<BusyKey>(null);
  const [addingDate, setAddingDate] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PlannerItemForm>(() => emptyForm(""));
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

  const moveInDay = async (date: string, refs: string[], ref: string, direction: -1 | 1) => {
    const index = refs.indexOf(ref);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= refs.length) return;
    const order = [...refs];
    const [removed] = order.splice(index, 1);
    order.splice(next, 0, removed);
    await run(`week-move-${ref}`, async () => {
      await plannerFetch("PATCH", { action: "reorder", date, order });
    });
  };

  const toggleUser = async (block: WeekPlanBlock) => {
    if (!block.activityId) return;
    const status = block.status === "done" ? "planned" : "done";
    await run(`week-status-${block.activityId}`, async () => {
      await plannerFetch("PATCH", { id: block.activityId, status });
    });
  };

  const toggleWeekTemplate = async (date: string, block: WeekPlanBlock) => {
    const status = block.status === "done" ? "planned" : "done";
    await run(`week-sys-${block.id}`, async () => {
      await plannerFetch("PATCH", {
        action: "system",
        date,
        blockKey: block.id,
        status,
      });
    });
  };

  const removeUser = async (id: string) => {
    await run(`week-del-${id}`, async () => {
      await plannerFetch("DELETE", undefined, id);
      if (editingId === id) setEditingId(null);
    });
  };

  const hideTemplate = async (date: string, block: WeekPlanBlock) => {
    await run(`week-hide-${block.id}`, async () => {
      await plannerFetch("PATCH", {
        action: "system",
        date,
        blockKey: block.id,
        status: "hidden",
      });
    });
  };

  const saveNew = async () => {
    if (!addingDate) return;
    await run("week-create", async () => {
      await plannerFetch("POST", {
        date: form.date || addingDate,
        title: form.title,
        domain: form.domain,
        notes: form.notes || null,
        timeLabel: form.timeLabel || null,
      });
      setAddingDate(null);
      setForm(emptyForm(""));
    });
  };

  const saveEdit = async (id: string) => {
    await run(`week-edit-${id}`, async () => {
      await plannerFetch("PATCH", {
        id,
        title: form.title,
        domain: form.domain,
        notes: form.notes || null,
        timeLabel: form.timeLabel || null,
        date: form.date,
      });
      setEditingId(null);
      setForm(emptyForm(""));
    });
  };

  const shapeLabel = {
    office: "Office day",
    wfh: "WFH day",
    weekend: "Weekend",
  } as const;

  return (
    <div className="rounded-2xl bg-[var(--card-solid)] p-5 ring-1 ring-[var(--card-border)]">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--accent-strong)] dark:text-[var(--accent-bright)]">
            Week ahead
          </p>
          <h2 className="mt-1 text-lg font-semibold text-[var(--ink)]">Your operating script</h2>
          <p className="mt-0.5 text-sm text-[var(--muted)]">
            Shuffle blocks, add real schedule items, and check things off as the week moves.
          </p>
        </div>
        <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1 text-[11px] font-semibold text-[var(--accent-strong)] ring-1 ring-[color-mix(in_srgb,var(--accent)_24%,transparent)] dark:text-[var(--accent-bright)]">
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
          const refs = day.blocks.map((block) => block.ref);
          return (
            <div
              key={day.date}
              className="rounded-xl bg-[color-mix(in_srgb,var(--ink)_3%,transparent)] p-3 ring-1 ring-[var(--card-border)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--ink)]">
                    {day.weekdayLabel} · {day.dateLabel}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">{shapeLabel[day.dayShape]}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAddingDate(day.date);
                    setEditingId(null);
                    setForm(emptyForm(day.date));
                  }}
                  className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--ink)_6%,transparent)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] hover:brightness-110"
                >
                  <Plus size={10} />
                  Add
                </button>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-[var(--ink-soft)]">{day.valueFocus}</p>

              <div className="mt-3 space-y-2">
                {day.blocks.map((block, index) => {
                  const isDone = block.status === "done";
                  const isUser = block.source === "user_plan" && block.activityId;
                  return (
                    <div key={block.ref} className={`rounded-lg px-2.5 py-2 ring-1 ${weeklyTone(block)}`}>
                      <div className="flex items-baseline justify-between gap-2">
                        {block.htmlLink ? (
                          <a
                            href={block.htmlLink}
                            target="_blank"
                            rel="noreferrer"
                            className={`truncate text-xs font-semibold hover:brightness-110 ${isDone ? "line-through opacity-70" : ""}`}
                          >
                            {block.label}
                          </a>
                        ) : (
                          <p
                            className={`truncate text-xs font-semibold ${isDone ? "line-through opacity-70" : ""}`}
                          >
                            {block.label}
                          </p>
                        )}
                        <p className="shrink-0 text-[10px] font-medium tabular-nums opacity-80">
                          {block.time}
                        </p>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug opacity-80">{block.why}</p>

                      {block.source !== "google_calendar" ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          <IconButton
                            label="Move up"
                            disabled={index === 0 || busy !== null}
                            onClick={() => void moveInDay(day.date, refs, block.ref, -1)}
                          >
                            <ArrowUp size={11} />
                          </IconButton>
                          <IconButton
                            label="Move down"
                            disabled={index === day.blocks.length - 1 || busy !== null}
                            onClick={() => void moveInDay(day.date, refs, block.ref, 1)}
                          >
                            <ArrowDown size={11} />
                          </IconButton>
                          <IconButton
                            label={isDone ? "Mark not done" : "Mark done"}
                            disabled={busy !== null}
                            onClick={() =>
                              void (isUser ? toggleUser(block) : toggleWeekTemplate(day.date, block))
                            }
                          >
                            <Check size={11} />
                          </IconButton>
                          {isUser ? (
                            <>
                              <IconButton
                                label="Edit"
                                disabled={busy !== null}
                                onClick={() => {
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
                                <Pencil size={11} />
                              </IconButton>
                              <IconButton
                                label="Remove"
                                disabled={busy !== null}
                                onClick={() => void removeUser(block.activityId!)}
                              >
                                <Trash2 size={11} />
                              </IconButton>
                            </>
                          ) : block.source === "weekly_template" ? (
                            <IconButton
                              label="Remove from day"
                              disabled={busy !== null}
                              onClick={() => void hideTemplate(day.date, block)}
                            >
                              <X size={11} />
                            </IconButton>
                          ) : null}
                        </div>
                      ) : null}

                      {editingId && block.activityId === editingId ? (
                        <PlannerItemEditor
                          form={form}
                          onChange={setForm}
                          onSave={() => void saveEdit(block.activityId!)}
                          onCancel={() => {
                            setEditingId(null);
                            setForm(emptyForm(""));
                          }}
                          busy={busy !== null}
                          saveLabel="Save"
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>

              {addingDate === day.date ? (
                <PlannerItemEditor
                  form={form}
                  onChange={setForm}
                  onSave={() => void saveNew()}
                  onCancel={() => {
                    setAddingDate(null);
                    setForm(emptyForm(""));
                  }}
                  busy={busy !== null}
                  saveLabel="Add to day"
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
