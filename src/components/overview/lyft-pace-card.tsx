"use client";

import { formatCurrency } from "@/lib/format";
import type { buildLyftPaceSnapshot } from "@/lib/lyft";

export type LyftPaceSnapshot = ReturnType<typeof buildLyftPaceSnapshot>;

type Props = {
  pace: LyftPaceSnapshot;
  onLogEarnings?: () => void;
  onAskCoach?: () => void;
};

const dayStatusStyles: Record<
  LyftPaceSnapshot["week"]["days"][number]["status"],
  string
> = {
  future: "bg-[color-mix(in_srgb,var(--ink)_5%,transparent)] ring-[var(--card-border)] text-[var(--muted)]",
  no_drive: "bg-[var(--card-solid)] ring-[var(--card-border)] text-[var(--ink-soft)]",
  under_target: "bg-rose-500/15 text-rose-800 dark:text-rose-300 ring-rose-400/35",
  hit_fee_pace: "bg-amber-500/15 text-amber-900 dark:text-amber-200 ring-amber-400/35",
  hit_profit: "bg-[var(--accent-soft)] text-[var(--accent-strong)] dark:text-[var(--accent-bright)] ring-[color-mix(in_srgb,var(--accent)_30%,transparent)]",
  ahead: "bg-teal-500/20 text-teal-800 dark:text-teal-200 ring-teal-400/40",
};

const stanceStyles: Record<LyftPaceSnapshot["advice"]["stance"], string> = {
  cover_fee: "bg-amber-500/15 text-amber-900 dark:text-amber-200 ring-amber-400/35",
  catch_up: "bg-rose-500/15 text-rose-800 dark:text-rose-300 ring-rose-400/35",
  on_track: "bg-[color-mix(in_srgb,var(--ink)_6%,transparent)] text-[var(--ink-soft)] ring-[var(--card-border)]",
  take_break: "bg-[var(--accent-soft)] text-[var(--accent-strong)] dark:text-[var(--accent-bright)] ring-[color-mix(in_srgb,var(--accent)_30%,transparent)]",
};

export function LyftPaceCard({ pace, onLogEarnings, onAskCoach }: Props) {
  const { week, month, advice, labels, today } = pace;
  const weeklyProgress = Math.min(
    100,
    Math.round((week.profitAfterFee / Math.max(1, week.weeklyProfitTarget)) * 100),
  );
  const monthlyProgress = Math.min(
    100,
    Math.round((month.profitAfterFee / Math.max(1, month.monthlyProfitTarget)) * 100),
  );

  return (
    <div className="app-card p-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
        <div>
          <p className="app-label mb-1">Lyft board</p>
          <h2 className="text-lg font-semibold text-[var(--ink)] tracking-tight">
            Weekly profit pace
          </h2>
          <p className="mt-1 text-xs text-[var(--muted)] max-w-xl">
            First {labels.weeklyFee} covers Hertz. Profit goal {labels.weeklyProfitBand} →{" "}
            {labels.monthlyProfitBand} to Capital One. Daily target ≈{" "}
            {formatCurrency(week.dailyGrossTarget)}.
          </p>
        </div>
        <div className={`rounded-xl px-3 py-2 text-sm font-medium ring-1 max-w-sm ${stanceStyles[advice.stance]}`}>
          <p className="font-semibold leading-snug">{advice.headline}</p>
          <p className="text-xs mt-1 opacity-90 leading-relaxed">{advice.detail}</p>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-5">
        {week.days.map((day) => (
          <div
            key={day.date}
            className={`rounded-xl p-2 sm:p-3 text-center transition-colors ring-1 ${
              day.isToday
                ? "bg-[var(--accent)] text-white ring-[var(--accent)] shadow-sm"
                : dayStatusStyles[day.status]
            }`}
            title={`${day.label} ${day.date}: ${day.statusLabel}`}
          >
            <p className="text-[10px] sm:text-xs font-medium uppercase opacity-80">{day.label}</p>
            <p className="text-sm sm:text-base font-bold mt-0.5 tabular-nums">{day.dayNum}</p>
            <p
              className={`text-[10px] sm:text-xs mt-1 font-medium tabular-nums ${
                day.isToday ? "text-white/85" : ""
              }`}
            >
              {day.isFuture ? "—" : formatCurrency(day.grossEarned)}
            </p>
            <p className={`text-[9px] mt-0.5 ${day.isToday ? "text-white/75" : "opacity-80"}`}>
              {day.statusLabel}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {[
          {
            label: "Fee left",
            value: formatCurrency(week.feeRemaining),
            sub: week.feeCovered ? "Covered" : labels.weeklyFee,
          },
          {
            label: "Week profit",
            value: formatCurrency(week.profitAfterFee),
            sub: `Goal ${formatCurrency(week.weeklyProfitTarget)}`,
          },
          {
            label: "Month profit",
            value: formatCurrency(month.profitAfterFee),
            sub: `Goal ${formatCurrency(month.monthlyProfitTarget)}`,
          },
          {
            label: "Today",
            value: today ? formatCurrency(today.grossEarned) : "—",
            sub: today?.statusLabel ?? "Log earnings",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl bg-[color-mix(in_srgb,var(--ink)_5%,transparent)] p-3 ring-1 ring-[var(--card-border)]"
          >
            <p className="app-label">{stat.label}</p>
            <p className="text-base font-bold tabular-nums text-[var(--ink)] mt-1">{stat.value}</p>
            <p className="text-[11px] text-[var(--muted)] mt-0.5">{stat.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 gap-3 mb-4">
        <ProgressBar
          label={`Weekly profit ${weeklyProgress}%`}
          percent={weeklyProgress}
          hint={`${formatCurrency(week.profitRemainingToGoal)} to weekly goal`}
        />
        <ProgressBar
          label={`Monthly profit ${monthlyProgress}%`}
          percent={monthlyProgress}
          hint={`${formatCurrency(month.profitRemainingToGoal)} to monthly goal`}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {onLogEarnings ? (
          <button
            type="button"
            onClick={onLogEarnings}
            className="inline-flex items-center rounded-full bg-[var(--accent)] px-3.5 py-2 text-xs font-semibold text-white hover:brightness-110 transition"
          >
            Log Lyft earnings
          </button>
        ) : null}
        {onAskCoach ? (
          <button
            type="button"
            onClick={onAskCoach}
            className="inline-flex items-center rounded-full bg-[color-mix(in_srgb,var(--ink)_5%,transparent)] px-3.5 py-2 text-xs font-semibold text-[var(--ink)] ring-1 ring-[var(--card-border)] hover:brightness-110 transition"
          >
            Ask coach: drive or break?
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ProgressBar({
  label,
  percent,
  hint,
}: {
  label: string;
  percent: number;
  hint: string;
}) {
  return (
    <div className="rounded-xl bg-[color-mix(in_srgb,var(--ink)_5%,transparent)] p-3 ring-1 ring-[var(--card-border)]">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-xs font-semibold text-[var(--ink-soft)]">{label}</p>
        <p className="text-[11px] text-[var(--muted)]">{hint}</p>
      </div>
      <div className="h-2 rounded-full bg-[color-mix(in_srgb,var(--ink)_10%,transparent)] overflow-hidden">
        <div
          className="h-full rounded-full bg-[var(--accent)] transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
