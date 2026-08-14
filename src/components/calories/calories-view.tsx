"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Flame,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import {
  DEFAULT_DURATION_WEEKS,
  DEFAULT_MON_WED_TARGET,
  DEFAULT_THU_SUN_TARGET,
  experimentEndDate,
  formatCals,
  type CalorieDayLogLike,
  type CalorieExperimentLike,
  type CalorieWeekSummary,
} from "@/lib/calories";

type ExperimentResponse = CalorieExperimentLike & { endDate: string };

type CaloriesBundle = {
  experiment: ExperimentResponse | null;
  logs: (CalorieDayLogLike & {
    experimentId: string;
    createdAt: string;
    updatedAt: string;
  })[];
  weeks: CalorieWeekSummary[];
  today: string;
};

const paceStyles = {
  under:
    "bg-[var(--accent-soft)] text-[var(--accent-strong)] dark:text-[var(--accent-bright)] ring-[color-mix(in_srgb,var(--accent)_30%,transparent)]",
  on_track:
    "bg-[color-mix(in_srgb,var(--ink)_6%,transparent)] text-[var(--ink-soft)] ring-[var(--card-border)]",
  over: "bg-rose-500/15 text-rose-800 dark:text-rose-300 ring-rose-400/35",
  empty:
    "bg-[color-mix(in_srgb,var(--ink)_5%,transparent)] text-[var(--muted)] ring-[var(--card-border)]",
};

async function fetchCalories(): Promise<CaloriesBundle> {
  const res = await fetch("/api/calories");
  if (!res.ok) throw new Error("Failed to load calories");
  return res.json();
}

function WeekStrip({
  week,
  selectedDate,
  onSelectDay,
}: {
  week: CalorieWeekSummary;
  selectedDate: string;
  onSelectDay: (date: string) => void;
}) {
  const usedPct = Math.min(
    100,
    Math.round((week.loggedCalories / Math.max(week.weeklyBudget, 1)) * 100)
  );

  return (
    <div className="app-card p-5 sm:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <p className="app-label mb-1">{week.label}</p>
          <h2 className="text-lg font-semibold text-[var(--ink)] tracking-tight">
            Weekly calorie budget
          </h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {week.weekStart} → {week.weekEnd} · Tap a day to log or edit. Judge the week, not one day.
          </p>
        </div>
        <div className={`rounded-xl px-3 py-2 text-sm font-medium ring-1 ${paceStyles[week.paceStatus]}`}>
          {week.paceMessage}
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {week.days.map((day) => {
          const over = day.delta != null && day.delta > 0;
          const under = day.delta != null && day.delta < 0;
          const isSelected = day.date === selectedDate;
          const canSelect = !day.isFuture;
          const missing = !day.isFuture && day.calories == null;
          const baseClass = day.isToday
            ? "bg-[var(--accent)] text-white ring-[var(--accent)] shadow-sm"
            : day.isFuture
              ? "bg-[color-mix(in_srgb,var(--ink)_5%,transparent)] ring-[var(--card-border)] text-[var(--muted)]"
              : missing
                ? "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-dashed border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--ink-soft)] ring-0"
                : "bg-[var(--card-solid)] ring-[var(--card-border)] text-[var(--ink-soft)]";
          const selectedRing = isSelected
            ? day.isToday
              ? "outline outline-2 outline-offset-2 outline-white/80"
              : "outline outline-2 outline-offset-2 outline-[var(--accent)]"
            : "";

          return (
            <button
              key={day.date}
              type="button"
              disabled={!canSelect}
              onClick={() => onSelectDay(day.date)}
              aria-label={
                missing
                  ? `Add calories for ${day.date}`
                  : day.calories != null
                    ? `Edit ${day.date}, ${day.calories} calories`
                    : day.date
              }
              aria-pressed={isSelected}
              className={`rounded-xl p-2 sm:p-3 text-center transition-colors ${
                missing ? "" : "ring-1"
              } ${baseClass} ${selectedRing} ${
                canSelect
                  ? "cursor-pointer hover:brightness-105 active:scale-[0.98]"
                  : "cursor-default opacity-70"
              }`}
            >
              <p className="text-[10px] sm:text-xs font-medium uppercase opacity-80">{day.label}</p>
              <p className="text-sm sm:text-base font-bold mt-0.5 tabular-nums">
                {new Date(`${day.date}T12:00:00`).getDate()}
              </p>
              <p
                className={`text-[10px] sm:text-xs mt-1 font-semibold tabular-nums ${
                  day.isToday
                    ? "text-white"
                    : day.calories == null
                      ? "text-[var(--muted)]"
                      : over
                        ? "text-rose-500"
                        : under
                          ? "text-[var(--accent-strong)] dark:text-[var(--accent-bright)]"
                          : "text-[var(--ink)]"
                }`}
              >
                {day.calories != null ? day.calories.toLocaleString("en-US") : missing ? "Add" : "—"}
              </p>
              <p
                className={`text-[9px] sm:text-[10px] mt-0.5 tabular-nums ${
                  day.isToday ? "text-white/75" : "text-[var(--muted)]"
                }`}
              >
                {day.band === "mon_wed" ? "M–W" : "T–S"} {day.target.toLocaleString("en-US")}
              </p>
            </button>
          );
        })}
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-2 mb-2">
          <p className="text-sm font-medium text-[var(--ink)]">
            {formatCals(week.loggedCalories)}{" "}
            <span className="text-[var(--muted)] font-normal">of {formatCals(week.weeklyBudget)}</span>
          </p>
          <p className="text-xs font-semibold tabular-nums text-[var(--muted)]">{usedPct}%</p>
        </div>
        <div className="h-2.5 rounded-full bg-[color-mix(in_srgb,var(--ink)_8%,transparent)] overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              week.loggedCalories > week.weeklyBudget
                ? "bg-rose-500"
                : "bg-[var(--accent)]"
            }`}
            style={{ width: `${usedPct}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: "Remaining",
            value: formatCals(week.remainingBudget),
            className:
              week.remainingBudget >= 0
                ? "text-[var(--accent-strong)] dark:text-[var(--accent-bright)]"
                : "text-rose-500",
          },
          {
            label: "Logged days",
            value: `${week.loggedDays}/7`,
            className: "text-[var(--ink)]",
          },
          {
            label: "Avg logged",
            value: week.avgLogged != null ? formatCals(week.avgLogged) : "—",
            className: "text-[var(--ink)]",
          },
          {
            label: "Week avg target",
            value: formatCals(Math.round(week.weeklyBudget / 7)),
            className: "text-[var(--ink)]",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl bg-[color-mix(in_srgb,var(--ink)_5%,transparent)] p-3 ring-1 ring-[var(--card-border)]"
          >
            <p className="app-label">{stat.label}</p>
            <p className={`mt-1 text-base font-semibold tabular-nums ${stat.className}`}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function StartExperimentForm({
  today,
  onStarted,
}: {
  today: string;
  onStarted: () => void;
}) {
  const [durationWeeks, setDurationWeeks] = useState(DEFAULT_DURATION_WEEKS);
  const [monWedTarget, setMonWedTarget] = useState(String(DEFAULT_MON_WED_TARGET));
  const [thuSunTarget, setThuSunTarget] = useState(String(DEFAULT_THU_SUN_TARGET));
  const [error, setError] = useState<string | null>(null);

  const weeklyBudget =
    (Number(monWedTarget) || 0) * 3 + (Number(thuSunTarget) || 0) * 4;

  const startMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/calories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: today,
          durationWeeks,
          monWedTarget: Number(monWedTarget),
          thuSunTarget: Number(thuSunTarget),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Failed to start");
      return data;
    },
    onSuccess: () => onStarted(),
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="app-card p-5 sm:p-6 space-y-5 max-w-xl">
      <div>
        <p className="app-label mb-1">New experiment</p>
        <h2 className="text-lg font-semibold text-[var(--ink)]">Start 3–4 weeks</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Mon–Wed stay tighter (easier to stick). Thu–Sun get more room. You judge the week
          budget, not every single day.
        </p>
      </div>

      <div className="flex gap-2">
        {[3, 4].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setDurationWeeks(n)}
            className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold ring-1 transition-colors ${
              durationWeeks === n
                ? "bg-[var(--accent)] text-white ring-[var(--accent)]"
                : "bg-[color-mix(in_srgb,var(--ink)_4%,transparent)] text-[var(--ink)] ring-[var(--card-border)]"
            }`}
          >
            {n} weeks
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="app-label block mb-1.5">Mon–Wed / day</span>
          <input
            type="number"
            inputMode="numeric"
            value={monWedTarget}
            onChange={(e) => setMonWedTarget(e.target.value)}
            className="w-full rounded-xl bg-[var(--card-solid)] px-3 py-2.5 text-sm text-[var(--ink)] ring-1 ring-[var(--card-border)] outline-none focus:ring-2 focus:ring-[var(--ring)]"
          />
        </label>
        <label className="block">
          <span className="app-label block mb-1.5">Thu–Sun / day</span>
          <input
            type="number"
            inputMode="numeric"
            value={thuSunTarget}
            onChange={(e) => setThuSunTarget(e.target.value)}
            className="w-full rounded-xl bg-[var(--card-solid)] px-3 py-2.5 text-sm text-[var(--ink)] ring-1 ring-[var(--card-border)] outline-none focus:ring-2 focus:ring-[var(--ring)]"
          />
        </label>
      </div>

      <p className="text-sm text-[var(--ink-soft)]">
        Weekly budget:{" "}
        <span className="font-semibold tabular-nums">{formatCals(weeklyBudget)}</span>
        <span className="text-[var(--muted)]">
          {" "}
          (~{Math.round(weeklyBudget / 7).toLocaleString("en-US")}/day avg)
        </span>
      </p>

      {error ? (
        <p className="text-sm text-rose-600 dark:text-rose-300">{error}</p>
      ) : null}

      <button
        type="button"
        disabled={startMutation.isPending}
        onClick={() => {
          setError(null);
          startMutation.mutate();
        }}
        className="app-btn-primary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
      >
        {startMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Flame size={16} />}
        Start experiment
      </button>
    </div>
  );
}

export function CaloriesView() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["calories"],
    queryFn: fetchCalories,
    staleTime: 30_000,
  });

  const experiment = data?.experiment ?? null;
  const weeks = useMemo(() => data?.weeks ?? [], [data?.weeks]);
  const today = data?.today ?? "";
  const logs = useMemo(() => data?.logs ?? [], [data?.logs]);
  const logFormRef = useRef<HTMLDivElement>(null);

  const experimentDateBounds = useMemo(() => {
    if (!experiment) return { min: "", max: today };
    const end = experimentEndDate(experiment.startDate, experiment.durationWeeks);
    const max = today && end ? (today < end ? today : end) : today || end;
    return { min: experiment.startDate, max };
  }, [experiment, today]);

  const currentWeekIndex = useMemo(() => {
    const idx = weeks.findIndex((w) => w.isCurrent);
    return idx >= 0 ? idx : 0;
  }, [weeks]);

  const [weekOverride, setWeekOverride] = useState<number | null>(null);
  const weekIndex = weekOverride ?? currentWeekIndex;
  const week = weeks[weekIndex] ?? null;

  const [logDateOverride, setLogDateOverride] = useState<string | null>(null);
  const logDate = logDateOverride ?? today;

  const selectedLog = useMemo(
    () => (logDate ? logs.find((l) => l.date === logDate) : undefined),
    [logs, logDate]
  );

  const [draft, setDraft] = useState<{
    date: string;
    calories: string;
    notes: string;
  } | null>(null);

  const caloriesInput =
    draft && draft.date === logDate
      ? draft.calories
      : selectedLog
        ? String(selectedLog.calories)
        : "";
  const notesInput =
    draft && draft.date === logDate ? draft.notes : (selectedLog?.notes ?? "");

  const selectLogDate = (date: string, opts?: { focusForm?: boolean }) => {
    setLogDateOverride(date);
    const existing = logs.find((l) => l.date === date);
    setDraft({
      date,
      calories: existing ? String(existing.calories) : "",
      notes: existing?.notes ?? "",
    });
    const weekIdxForDate = weeks.findIndex((w) => w.days.some((d) => d.date === date));
    if (weekIdxForDate >= 0) setWeekOverride(weekIdxForDate);
    if (opts?.focusForm !== false) {
      window.requestAnimationFrame(() => {
        logFormRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    }
  };

  const recentDayRows = useMemo(() => {
    const logsByDate = new Map(logs.map((l) => [l.date, l]));
    const days = weeks
      .flatMap((w) => w.days)
      .filter((d) => !d.isFuture)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

    return days.slice(0, 21).map((day) => ({
      date: day.date,
      log: logsByDate.get(day.date),
      target: day.target,
      delta: day.delta,
      isToday: day.isToday,
    }));
  }, [logs, weeks]);

  const missingDayCount = useMemo(
    () => recentDayRows.filter((r) => !r.log).length,
    [recentDayRows]
  );

  const firstMissingDate = useMemo(
    () => recentDayRows.find((r) => !r.log)?.date ?? null,
    [recentDayRows]
  );

  const logHeading =
    logDate === today ? "Log today" : selectedLog ? "Edit day" : "Add day";

  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/calories/logs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: logDate,
          calories: Number(caloriesInput),
          notes: notesInput.trim() || null,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "Failed to save");
      return body;
    },
    onSuccess: async () => {
      setSaveMsg("Saved.");
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: ["calories"] });
      window.setTimeout(() => setSaveMsg(null), 2000);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (date: string) => {
      const res = await fetch(`/api/calories/logs?date=${encodeURIComponent(date)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Failed to delete");
      }
    },
    onSuccess: async () => {
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: ["calories"] });
    },
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/calories", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Failed to complete");
      }
    },
    onSuccess: async () => {
      setWeekOverride(null);
      setLogDateOverride(null);
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: ["calories"] });
    },
  });

  if (isLoading) {
    return (
      <div className="app-card p-8 text-center text-sm text-[var(--muted)]">
        Loading calorie experiment…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl bg-amber-500/15 px-4 py-3 text-sm text-amber-950 dark:text-amber-100 ring-1 ring-amber-400/35">
        Couldn&apos;t load calories.{" "}
        <button type="button" className="underline font-semibold" onClick={() => void refetch()}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center ring-1 ring-[color-mix(in_srgb,var(--accent)_28%,transparent)] shrink-0">
            <Flame size={20} className="text-[var(--accent-strong)] dark:text-[var(--accent-bright)]" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--accent-strong)] dark:text-[var(--accent-bright)]">
              Body experiment
            </p>
            <h1 className="text-xl md:text-2xl app-display text-[var(--ink)] tracking-tight mt-1">
              Calories
            </h1>
            <p className="text-sm text-[var(--muted)] mt-1 max-w-lg">
              Log a daily number. Score the week against your budget — Mon–Wed tighter, Thu–Sun
              looser.
            </p>
          </div>
        </div>
      </div>

      {!experiment ? (
        <StartExperimentForm
          today={today}
          onStarted={() => {
            setWeekOverride(null);
            setLogDateOverride(null);
            setDraft(null);
            void queryClient.invalidateQueries({ queryKey: ["calories"] });
          }}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
            <span className="rounded-lg bg-[color-mix(in_srgb,var(--ink)_5%,transparent)] px-2.5 py-1 ring-1 ring-[var(--card-border)] font-medium text-[var(--ink-soft)]">
              {experiment.durationWeeks} weeks · {experiment.startDate} → {experiment.endDate}
            </span>
            <span className="rounded-lg bg-[color-mix(in_srgb,var(--ink)_5%,transparent)] px-2.5 py-1 ring-1 ring-[var(--card-border)]">
              M–W {experiment.monWedTarget.toLocaleString("en-US")}
            </span>
            <span className="rounded-lg bg-[color-mix(in_srgb,var(--ink)_5%,transparent)] px-2.5 py-1 ring-1 ring-[var(--card-border)]">
              T–S {experiment.thuSunTarget.toLocaleString("en-US")}
            </span>
            <span className="rounded-lg bg-[color-mix(in_srgb,var(--ink)_5%,transparent)] px-2.5 py-1 ring-1 ring-[var(--card-border)]">
              Week {formatCals(experiment.weeklyBudget)}
            </span>
            <button
              type="button"
              onClick={() => void refetch()}
              disabled={isFetching}
              className="ml-auto text-[var(--accent-strong)] dark:text-[var(--accent-bright)] font-semibold disabled:opacity-60"
            >
              {isFetching ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          {week ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  disabled={weekIndex <= 0}
                  onClick={() => setWeekOverride(Math.max(0, weekIndex - 1))}
                  className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold text-[var(--ink)] ring-1 ring-[var(--card-border)] disabled:opacity-40"
                >
                  <ChevronLeft size={16} /> Prev
                </button>
                <p className="text-sm font-semibold text-[var(--ink)]">
                  {week.label}
                  {week.isCurrent ? (
                    <span className="ml-2 text-xs font-medium text-[var(--accent-strong)] dark:text-[var(--accent-bright)]">
                      current
                    </span>
                  ) : null}
                </p>
                <button
                  type="button"
                  disabled={weekIndex >= weeks.length - 1}
                  onClick={() => setWeekOverride(Math.min(weeks.length - 1, weekIndex + 1))}
                  className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold text-[var(--ink)] ring-1 ring-[var(--card-border)] disabled:opacity-40"
                >
                  Next <ChevronRight size={16} />
                </button>
              </div>
              <WeekStrip
                week={week}
                selectedDate={logDate}
                onSelectDay={(date) => selectLogDate(date)}
              />
            </>
          ) : null}

          <div ref={logFormRef} className="app-card p-5 sm:p-6 space-y-4">
            <div>
              <p className="app-label mb-1">Daily log</p>
              <h2 className="text-lg font-semibold text-[var(--ink)]">{logHeading}</h2>
              <p className="mt-1 text-xs text-[var(--muted)]">
                One total for any day in the experiment. Missed a day? Pick the date and save —
                weekly remaining adjusts automatically.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.2fr] gap-3">
              <label className="block">
                <span className="app-label block mb-1.5">Date</span>
                <input
                  type="date"
                  value={logDate}
                  min={experimentDateBounds.min || undefined}
                  max={experimentDateBounds.max || undefined}
                  onChange={(e) => selectLogDate(e.target.value, { focusForm: false })}
                  className="w-full rounded-xl bg-[var(--card-solid)] px-3 py-2.5 text-sm text-[var(--ink)] ring-1 ring-[var(--card-border)] outline-none focus:ring-2 focus:ring-[var(--ring)]"
                />
              </label>
              <label className="block">
                <span className="app-label block mb-1.5">Calories</span>
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="e.g. 2300"
                  value={caloriesInput}
                  onChange={(e) =>
                    setDraft({
                      date: logDate,
                      calories: e.target.value,
                      notes: notesInput,
                    })
                  }
                  className="w-full rounded-xl bg-[var(--card-solid)] px-3 py-2.5 text-sm text-[var(--ink)] ring-1 ring-[var(--card-border)] outline-none focus:ring-2 focus:ring-[var(--ring)]"
                />
              </label>
            </div>

            <label className="block">
              <span className="app-label block mb-1.5">Note (optional)</span>
              <input
                type="text"
                value={notesInput}
                onChange={(e) =>
                  setDraft({
                    date: logDate,
                    calories: caloriesInput,
                    notes: e.target.value,
                  })
                }
                placeholder="Protein shake day, dinner out…"
                className="w-full rounded-xl bg-[var(--card-solid)] px-3 py-2.5 text-sm text-[var(--ink)] ring-1 ring-[var(--card-border)] outline-none focus:ring-2 focus:ring-[var(--ring)]"
              />
            </label>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={saveMutation.isPending || !caloriesInput || !logDate}
                onClick={() => saveMutation.mutate()}
                className="app-btn-primary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
              >
                {saveMutation.isPending ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Check size={16} />
                )}
                {selectedLog ? "Save day" : "Add day"}
              </button>
              {logs.some((l) => l.date === logDate) ? (
                <button
                  type="button"
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate(logDate)}
                  className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-rose-700 dark:text-rose-300 ring-1 ring-rose-400/35 disabled:opacity-60"
                >
                  <Trash2 size={14} /> Clear
                </button>
              ) : null}
              {saveMsg ? (
                <span className="text-sm text-[var(--accent-strong)] dark:text-[var(--accent-bright)] font-medium">
                  {saveMsg}
                </span>
              ) : null}
              {saveMutation.isError ? (
                <span className="text-sm text-rose-600 dark:text-rose-300">
                  {(saveMutation.error as Error).message}
                </span>
              ) : null}
            </div>
          </div>

          {recentDayRows.length > 0 ? (
            <div className="app-card p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div>
                  <p className="app-label">Recent days</p>
                  {missingDayCount > 0 ? (
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {missingDayCount === 1
                        ? "1 day still needs a log."
                        : `${missingDayCount} days still need a log.`}
                    </p>
                  ) : null}
                </div>
                {firstMissingDate ? (
                  <button
                    type="button"
                    onClick={() => selectLogDate(firstMissingDate)}
                    className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-[var(--accent-strong)] dark:text-[var(--accent-bright)] ring-1 ring-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[var(--accent-soft)]"
                  >
                    <Plus size={14} /> Add missing day
                  </button>
                ) : null}
              </div>
              <ul className="divide-y divide-[var(--card-border)]">
                {recentDayRows.map((row) => {
                  const isMissing = !row.log;
                  return (
                    <li
                      key={row.date}
                      className={`flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0 ${
                        isMissing
                          ? "bg-[color-mix(in_srgb,var(--accent)_6%,transparent)] -mx-2 px-2 rounded-lg"
                          : ""
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[var(--ink)] tabular-nums">
                          {row.date}
                          {row.isToday ? (
                            <span className="ml-2 text-xs font-medium text-[var(--accent-strong)] dark:text-[var(--accent-bright)]">
                              today
                            </span>
                          ) : null}
                          {row.target != null ? (
                            <span className="ml-2 text-xs font-medium text-[var(--muted)]">
                              target {row.target.toLocaleString("en-US")}
                            </span>
                          ) : null}
                        </p>
                        {isMissing ? (
                          <p className="text-xs text-[var(--muted)] mt-0.5">Not logged yet</p>
                        ) : row.log?.notes ? (
                          <p className="text-xs text-[var(--muted)] truncate mt-0.5">
                            {row.log.notes}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isMissing ? (
                          <button
                            type="button"
                            onClick={() => selectLogDate(row.date)}
                            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[var(--accent-strong)] dark:text-[var(--accent-bright)] ring-1 ring-[color-mix(in_srgb,var(--accent)_35%,transparent)] hover:bg-[var(--accent-soft)]"
                          >
                            <Plus size={12} /> Add
                          </button>
                        ) : (
                          <>
                            <span
                              className={`text-sm font-semibold tabular-nums ${
                                row.delta != null && row.delta > 0
                                  ? "text-rose-500"
                                  : "text-[var(--ink)]"
                              }`}
                            >
                              {row.log!.calories.toLocaleString("en-US")}
                            </span>
                            <button
                              type="button"
                              onClick={() => selectLogDate(row.date)}
                              className="p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[color-mix(in_srgb,var(--ink)_6%,transparent)]"
                              aria-label="Edit day"
                            >
                              <Pencil size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={completeMutation.isPending}
              onClick={() => completeMutation.mutate()}
              className="rounded-xl px-3 py-2 text-xs font-semibold text-[var(--muted)] ring-1 ring-[var(--card-border)] hover:text-[var(--ink)] disabled:opacity-60"
            >
              Mark experiment complete
            </button>
          </div>
        </>
      )}
    </div>
  );
}
