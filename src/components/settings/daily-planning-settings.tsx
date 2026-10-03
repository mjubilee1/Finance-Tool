"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Clock3, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

type ScheduleItem = {
  id: string;
  title: string;
  weekdays: number[];
  startTime: string;
  endTime: string | null;
  notes: string | null;
};

type DailyPlanningResponse = {
  emailEnabled: boolean;
  emailConfigured: boolean;
  items: ScheduleItem[];
};

type ScheduleForm = {
  title: string;
  weekdays: number[];
  startTime: string;
  endTime: string;
  notes: string;
};

const DAYS = [
  { value: 1, label: "M" },
  { value: 2, label: "T" },
  { value: 3, label: "W" },
  { value: 4, label: "T" },
  { value: 5, label: "F" },
  { value: 6, label: "S" },
  { value: 7, label: "S" },
] as const;

const EMPTY_FORM: ScheduleForm = {
  title: "",
  weekdays: [1, 2, 3, 4, 5],
  startTime: "09:00",
  endTime: "17:00",
  notes: "",
};

async function requestDailyPlanning(method: string, body?: Record<string, unknown>, id?: string) {
  const url = id ? `/api/daily-planning?id=${encodeURIComponent(id)}` : "/api/daily-planning";
  const response = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) throw new Error(data?.error || "Could not save daily planning.");
  return data;
}

function daysLabel(weekdays: number[]) {
  if (weekdays.length === 7) return "Every day";
  if ([1, 2, 3, 4, 5].every((day) => weekdays.includes(day)) && weekdays.length === 5) {
    return "Weekdays";
  }
  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return weekdays.map((day) => labels[day - 1]).filter(Boolean).join(", ");
}

export function DailyPlanningSettings() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ScheduleForm>(EMPTY_FORM);
  const [feedback, setFeedback] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["daily-planning-settings"],
    queryFn: async () => {
      const response = await fetch("/api/daily-planning");
      if (!response.ok) throw new Error("Could not load daily planning.");
      return response.json() as Promise<DailyPlanningResponse>;
    },
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["daily-planning-settings"] });
    await queryClient.invalidateQueries({ queryKey: ["overview-today"] });
  };

  const emailMutation = useMutation({
    mutationFn: (emailEnabled: boolean) =>
      requestDailyPlanning("PATCH", { action: "email", emailEnabled }),
    onSuccess: async () => {
      setFeedback(query.data?.emailEnabled ? "Morning email turned off." : "Morning email turned on.");
      await refresh();
    },
    onError: (error) => setFeedback(error instanceof Error ? error.message : "Could not save."),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      requestDailyPlanning(editingId ? "PATCH" : "POST", {
        ...(editingId ? { id: editingId } : {}),
        ...form,
        endTime: form.endTime || null,
        notes: form.notes || null,
      }),
    onSuccess: async () => {
      setFeedback(editingId ? "Schedule updated." : "Schedule item added.");
      setEditingId(null);
      setShowForm(false);
      setForm(EMPTY_FORM);
      await refresh();
    },
    onError: (error) => setFeedback(error instanceof Error ? error.message : "Could not save."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => requestDailyPlanning("DELETE", undefined, id),
    onSuccess: async () => {
      setFeedback("Schedule item removed.");
      await refresh();
    },
    onError: (error) => setFeedback(error instanceof Error ? error.message : "Could not remove."),
  });

  const startEditing = (item: ScheduleItem) => {
    setEditingId(item.id);
    setForm({
      title: item.title,
      weekdays: item.weekdays,
      startTime: item.startTime,
      endTime: item.endTime ?? "",
      notes: item.notes ?? "",
    });
    setShowForm(true);
  };

  return (
    <section className="app-card space-y-4 p-4">
      <div className="flex items-center gap-2">
        <Clock3 size={18} className="text-[var(--accent-strong)]" />
        <h2 className="text-sm font-semibold text-[var(--ink)]">Daily schedule</h2>
      </div>
      <p className="text-xs leading-relaxed text-[var(--muted)]">
        Add real-life commitments that repeat. They appear in Today beside your calendar and tasks.
      </p>

      {query.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-[var(--muted)]">
          <Loader2 size={14} className="animate-spin" />
          Loading schedule…
        </p>
      ) : query.isError ? (
        <p className="text-sm text-rose-700 dark:text-rose-300">Couldn&apos;t load daily schedule.</p>
      ) : (
        <>
          <div className="rounded-xl bg-[var(--accent-soft)] p-3 ring-1 ring-[color-mix(in_srgb,var(--accent)_25%,transparent)]">
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
                  <BellRing size={16} className="text-[var(--accent-strong)]" />
                  Morning plan email
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-[var(--muted)]">
                  Main thing, fixed schedule, and saved tasks once each morning.
                </span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={query.data?.emailEnabled ?? false}
                disabled={emailMutation.isPending || !query.data?.emailConfigured}
                onClick={() => emailMutation.mutate(!(query.data?.emailEnabled ?? false))}
                className={`relative h-11 w-16 shrink-0 rounded-full ring-1 transition ${
                  query.data?.emailEnabled
                    ? "bg-[var(--accent)] ring-[var(--accent)]"
                    : "bg-[var(--card-solid)] ring-[var(--card-border)]"
                } disabled:opacity-50`}
              >
                <span
                  className={`absolute top-1.5 h-8 w-8 rounded-full bg-white shadow transition ${
                    query.data?.emailEnabled ? "left-7" : "left-1.5"
                  }`}
                />
              </button>
            </div>
            {!query.data?.emailConfigured ? (
              <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                Add RESEND_API_KEY to enable email.
              </p>
            ) : null}
          </div>

          {query.data?.items.length ? (
            <ul className="divide-y divide-[var(--card-border)] rounded-xl ring-1 ring-[var(--card-border)]">
              {query.data.items.map((item) => (
                <li key={item.id} className="flex min-h-16 items-center gap-2 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-[var(--ink)]">
                      {item.title}
                    </span>
                    <span className="mt-0.5 block text-xs text-[var(--muted)]">
                      {daysLabel(item.weekdays)} · {item.startTime}
                      {item.endTime ? `–${item.endTime}` : ""}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => startEditing(item)}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--accent-strong)] ring-1 ring-[var(--card-border)]"
                    aria-label={`Edit ${item.title}`}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    disabled={deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate(item.id)}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-full text-rose-700 ring-1 ring-rose-400/30 disabled:opacity-50 dark:text-rose-300"
                    aria-label={`Remove ${item.title}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl px-3 py-4 text-center text-sm text-[var(--muted)] ring-1 ring-[var(--card-border)]">
              No repeating commitments yet.
            </p>
          )}

          {showForm ? (
            <div className="space-y-3 rounded-xl p-3 ring-1 ring-[var(--card-border)]">
              <input
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder="Work, commute, church, gym…"
                className="min-h-11 w-full rounded-lg bg-[var(--card-solid)] px-3 text-sm text-[var(--ink)] ring-1 ring-[var(--card-border)] outline-none focus:ring-[var(--accent)]"
              />
              <div className="grid grid-cols-7 gap-1">
                {DAYS.map((day, index) => {
                  const selected = form.weekdays.includes(day.value);
                  return (
                    <button
                      key={`${day.value}-${index}`}
                      type="button"
                      aria-pressed={selected}
                      onClick={() =>
                        setForm({
                          ...form,
                          weekdays: selected
                            ? form.weekdays.filter((value) => value !== day.value)
                            : [...form.weekdays, day.value].sort(),
                        })
                      }
                      className={`min-h-11 rounded-lg text-xs font-semibold ring-1 ${
                        selected
                          ? "bg-[var(--accent)] text-white ring-[var(--accent)]"
                          : "text-[var(--muted)] ring-[var(--card-border)]"
                      }`}
                    >
                      {day.label}
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs font-medium text-[var(--muted)]">
                  Start
                  <input
                    type="time"
                    value={form.startTime}
                    onChange={(event) => setForm({ ...form, startTime: event.target.value })}
                    className="mt-1 min-h-11 w-full rounded-lg bg-[var(--card-solid)] px-3 text-sm text-[var(--ink)] ring-1 ring-[var(--card-border)]"
                  />
                </label>
                <label className="text-xs font-medium text-[var(--muted)]">
                  End
                  <input
                    type="time"
                    value={form.endTime}
                    onChange={(event) => setForm({ ...form, endTime: event.target.value })}
                    className="mt-1 min-h-11 w-full rounded-lg bg-[var(--card-solid)] px-3 text-sm text-[var(--ink)] ring-1 ring-[var(--card-border)]"
                  />
                </label>
              </div>
              <textarea
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
                placeholder="Notes (optional)"
                rows={2}
                className="w-full rounded-lg bg-[var(--card-solid)] px-3 py-2 text-sm text-[var(--ink)] ring-1 ring-[var(--card-border)] outline-none focus:ring-[var(--accent)]"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={
                    saveMutation.isPending || !form.title.trim() || form.weekdays.length === 0
                  }
                  onClick={() => saveMutation.mutate()}
                  className="app-btn-primary min-h-11 flex-1 rounded-lg px-3 text-sm disabled:opacity-50"
                >
                  {editingId ? "Save changes" : "Add to schedule"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingId(null);
                    setForm(EMPTY_FORM);
                  }}
                  className="min-h-11 rounded-lg px-3 text-sm font-semibold text-[var(--muted)] ring-1 ring-[var(--card-border)]"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-[var(--accent-strong)] ring-1 ring-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
            >
              <Plus size={16} />
              Add repeating commitment
            </button>
          )}
        </>
      )}

      {feedback ? <p className="text-xs text-[var(--muted)]">{feedback}</p> : null}
    </section>
  );
}
