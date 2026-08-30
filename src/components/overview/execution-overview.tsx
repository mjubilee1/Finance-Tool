"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Circle,
  Flame,
  Target,
} from "lucide-react";
import { isLifeGoalType } from "@/lib/goal-types";
import { calendarDateTime, userNow } from "@/lib/user-timezone";
import {
  buildTimelineItems,
  displayPlannerNotes,
  formatCalendarEventTime,
  isEntrepreneurshipBlock,
  pickTodayUserBlocks,
  shortTimeLabel,
  timelinePriorityLabel,
  timelinePriorityRank,
  type TimelineItem,
  type TodayOverviewResponse,
} from "@/components/today/planner-shared";

type Goal = {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate?: string | null;
  priority?: number;
  category?: string;
};

type Props = {
  goals: Goal[];
  financialActions?: {
    upcomingBills?: string[];
    spendingWarning?: string;
  };
  onOpenToday: () => void;
  onOpenGrowth?: () => void;
  onOpenGoals?: () => void;
  onOpenFinance?: () => void;
};

function itemStatus(
  item: TimelineItem,
  completed: Set<string>,
  skipped: Set<string>,
): "done" | "skipped" | "past" | "open" {
  if (item.type === "user") return item.block.status === "planned" ? "open" : item.block.status;
  if (item.type === "plan") {
    if (completed.has(item.block.key)) return "done";
    if (skipped.has(item.block.key)) return "skipped";
  }
  if (item.type === "calendar" && !item.event.allDay) {
    const cutoff = calendarDateTime(item.event.end ?? item.event.start);
    if (cutoff.isValid && cutoff < userNow()) return "past";
  }
  return "open";
}

function itemTitle(item: TimelineItem) {
  if (item.type === "calendar") return item.event.title;
  if (item.type === "user") return item.block.title;
  return item.block.label;
}

function itemTime(item: TimelineItem) {
  if (item.type === "calendar") return formatCalendarEventTime(item.event);
  if (item.type === "user") return shortTimeLabel(item.block.timeLabel);
  return shortTimeLabel(item.block.time);
}

function itemDetail(item: TimelineItem) {
  if (item.type === "calendar") return item.event.location;
  if (item.type === "user") return displayPlannerNotes(item.block.notes);
  return item.block.why;
}

function itemDomain(item: TimelineItem) {
  if (item.type === "calendar") return "Commitment";
  if (item.type === "user") return item.block.domain;
  return timelinePriorityLabel(item);
}

function cleanLabel(value: string) {
  return value.replace(/\bGTM\b/gi, "outreach");
}

export function OverviewHome({
  goals,
  financialActions,
  onOpenToday,
  onOpenGrowth,
  onOpenGoals,
  onOpenFinance,
}: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["overview-today"],
    queryFn: async () => {
      const response = await fetch("/api/today");
      if (!response.ok) throw new Error("Failed to load today");
      return response.json() as Promise<TodayOverviewResponse>;
    },
    staleTime: 60_000,
    retry: false,
  });

  const brief = data?.brief;
  const completed = new Set(brief?.completedBlockKeys ?? []);
  const skipped = new Set(brief?.skippedBlockKeys ?? []);
  const timeline = brief
    ? buildTimelineItems(
        brief.plan.blocks,
        pickTodayUserBlocks(brief.userPlanBlocks),
        data?.calendar?.connected ? data.calendar.events : [],
        brief.dayShape,
      ).sort((a, b) => {
        const statusDifference =
          (itemStatus(a, completed, skipped) === "open" ? 0 : 1) -
          (itemStatus(b, completed, skipped) === "open" ? 0 : 1);
        if (statusDifference) return statusDifference;
        return timelinePriorityRank(a) - timelinePriorityRank(b) || a.sortKey - b.sortKey;
      })
    : [];

  const openItems = timeline.filter((item) => itemStatus(item, completed, skipped) === "open");
  const doneCount = timeline.filter((item) => itemStatus(item, completed, skipped) === "done").length;
  const skippedItems = timeline.filter((item) => itemStatus(item, completed, skipped) === "skipped");
  const hasOpenBusiness = brief?.userPlanBlocks.some(
    (block) =>
      block.status === "planned" &&
      (block.domain === "startup" || isEntrepreneurshipBlock(block)),
  );
  const recommendation =
    brief?.recommendation?.status === "pending" && !hasOpenBusiness
      ? brief.recommendation
      : null;
  const mainItem = recommendation ? null : (openItems[0] ?? null);
  const nextItems = (recommendation ? openItems : openItems.slice(1)).slice(0, 3);

  const lifeGoals = goals
    .filter((goal) => isLifeGoalType(goal.category))
    .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99))
    .slice(0, 2);

  const upcoming = (data?.weekPlan?.days ?? [])
    .filter((day) => day.date !== brief?.date)
    .flatMap((day) =>
      day.blocks
        .filter(
          (block) =>
            block.status !== "done" &&
            block.status !== "skipped" &&
            (block.source === "google_calendar" ||
              block.source === "user_plan" ||
              block.priority === "protect"),
        )
        .slice(0, 2)
        .map((block) => ({
          key: `${day.date}:${block.id}`,
          day: day.weekdayLabel,
          title: cleanLabel(block.label),
        })),
    )
    .slice(0, 3);

  const moneyActions = [
    ...(financialActions?.spendingWarning ? [financialActions.spendingWarning] : []),
    ...(financialActions?.upcomingBills ?? []),
  ].slice(0, 2);

  const mainTitle = recommendation?.action ?? (mainItem ? itemTitle(mainItem) : null);
  const mainDetail = recommendation?.whyItMatters ?? (mainItem ? itemDetail(mainItem) : null);
  const mainMeta = recommendation
    ? `${recommendation.timeRequiredMinutes || "Now"}${recommendation.timeRequiredMinutes ? " min" : ""} · Highest leverage`
    : mainItem
      ? `${itemTime(mainItem)} · ${itemDomain(mainItem)}`
      : null;

  return (
    <div className="mx-auto max-w-lg space-y-3">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
          {userNow().toFormat("cccc, MMMM d")}
        </p>
        <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-[var(--ink)]">
          Keep the main thing the main thing.
        </h1>
      </header>

      {isLoading && !brief ? (
        <p className="py-8 text-center text-sm text-[var(--muted)]">Loading your day…</p>
      ) : isError && !brief ? (
        <p className="py-8 text-center text-sm text-rose-600">Couldn&apos;t load today.</p>
      ) : (
        <>
          <section className="rounded-2xl bg-[color-mix(in_srgb,var(--accent)_10%,var(--card-solid))] p-4 ring-1 ring-[color-mix(in_srgb,var(--accent)_28%,transparent)]">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--accent-strong)]">
              Main thing
            </p>
            {mainTitle ? (
              <>
                <h2 className="mt-1 text-lg font-semibold leading-snug text-[var(--ink)]">
                  {cleanLabel(mainTitle)}
                </h2>
                {mainMeta ? (
                  <p className="mt-1 text-xs font-semibold text-[var(--accent-strong)]">{mainMeta}</p>
                ) : null}
                {mainDetail ? (
                  <p className="mt-2 text-sm leading-relaxed text-[var(--ink-soft)]">{mainDetail}</p>
                ) : null}
              </>
            ) : (
              <p className="mt-1 text-sm text-[var(--ink-soft)]">
                Today is clear. Choose the next meaningful move.
              </p>
            )}
            <button
              type="button"
              onClick={onOpenToday}
              className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white"
            >
              Open today
              <ArrowRight size={16} />
            </button>
          </section>

          {nextItems.length > 0 ? (
            <section className="overflow-hidden rounded-2xl bg-[var(--card-solid)] ring-1 ring-[var(--card-border)]">
              <div className="flex items-center justify-between px-3 py-2.5">
                <h2 className="text-sm font-semibold text-[var(--ink)]">Next up</h2>
                <span className="text-[11px] font-semibold text-[var(--muted)]">
                  {doneCount} completed
                </span>
              </div>
              <ol>
                {nextItems.map((item) => (
                  <li
                    key={item.ref}
                    className="flex min-h-14 items-center gap-3 border-t border-[var(--card-border)] px-3"
                  >
                    <Circle size={18} className="shrink-0 text-[var(--muted)]" />
                    <span className="min-w-0 flex-1 py-2">
                      <span className="line-clamp-2 text-sm font-semibold text-[var(--ink)]">
                        {cleanLabel(itemTitle(item))}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-[var(--muted)]">
                        {itemTime(item)} · {itemDomain(item)}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          <section className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onOpenToday}
              className="min-h-24 rounded-2xl bg-[var(--card-solid)] p-3 text-left ring-1 ring-[var(--card-border)]"
            >
              <CheckCircle2 size={16} className="text-teal-600" />
              <p className="mt-2 text-sm font-semibold text-[var(--ink)]">
                {doneCount > 0 ? `${doneCount} followed through` : "Start the streak"}
              </p>
              <p className="mt-0.5 text-[11px] text-[var(--muted)]">Today&apos;s commitments</p>
            </button>
            <button
              type="button"
              onClick={onOpenGrowth}
              disabled={!onOpenGrowth}
              className="min-h-24 rounded-2xl bg-[var(--card-solid)] p-3 text-left ring-1 ring-[var(--card-border)] disabled:cursor-default"
            >
              <Flame size={16} className="text-[var(--ember-strong)]" />
              <p className="mt-2 text-sm font-semibold text-[var(--ink)]">
                {data?.entrepreneurship?.weekDoneCount ?? 0} leverage moves
              </p>
              <p className="mt-0.5 text-[11px] text-[var(--muted)]">This week</p>
            </button>
          </section>

          {skippedItems.length > 0 ? (
            <button
              type="button"
              onClick={onOpenToday}
              className="flex min-h-12 w-full items-center gap-3 rounded-2xl bg-amber-500/10 px-3 text-left ring-1 ring-amber-400/30"
            >
              <AlertTriangle size={17} className="shrink-0 text-amber-700 dark:text-amber-300" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-[var(--ink)]">
                  {skippedItems.length} {skippedItems.length === 1 ? "item needs" : "items need"} a decision
                </span>
                <span className="block truncate text-[11px] text-[var(--muted)]">
                  Recommit, reschedule, or let it go.
                </span>
              </span>
              <ArrowRight size={16} className="shrink-0 text-[var(--muted)]" />
            </button>
          ) : null}

          {lifeGoals.length > 0 && onOpenGoals ? (
            <section className="rounded-2xl bg-[var(--card-solid)] p-3 ring-1 ring-[var(--card-border)]">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--ink)]">
                  <Target size={15} className="text-[var(--accent-strong)]" />
                  Life priorities
                </h2>
                <button
                  type="button"
                  onClick={onOpenGoals}
                  className="min-h-11 px-1 text-xs font-semibold text-[var(--accent-strong)]"
                >
                  All goals
                </button>
              </div>
              <div className="space-y-3">
                {lifeGoals.map((goal) => {
                  const progress = Math.max(0, Math.min(100, Math.round(goal.currentAmount)));
                  return (
                    <div key={goal.id}>
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="truncate font-semibold text-[var(--ink-soft)]">{goal.name}</span>
                        <span className="shrink-0 tabular-nums text-[var(--muted)]">{progress}%</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--ink)_8%,transparent)]">
                        <div
                          className="h-full rounded-full bg-[var(--accent)]"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          {upcoming.length > 0 ? (
            <section className="rounded-2xl bg-[var(--card-solid)] p-3 ring-1 ring-[var(--card-border)]">
              <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--ink)]">
                <CalendarDays size={15} className="text-[var(--accent-strong)]" />
                Coming up
              </h2>
              <ul className="mt-2 space-y-2">
                {upcoming.map((item) => (
                  <li key={item.key} className="flex gap-3 text-sm">
                    <span className="w-8 shrink-0 text-xs font-semibold text-[var(--accent-strong)]">
                      {item.day}
                    </span>
                    <span className="line-clamp-1 font-medium text-[var(--ink-soft)]">{item.title}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {moneyActions.length > 0 && onOpenFinance ? (
            <button
              type="button"
              onClick={onOpenFinance}
              className="flex min-h-12 w-full items-center gap-3 rounded-2xl bg-rose-500/8 px-3 text-left ring-1 ring-rose-400/25"
            >
              <AlertTriangle size={17} className="shrink-0 text-rose-600 dark:text-rose-300" />
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-rose-700 dark:text-rose-300">
                  Money action
                </span>
                <span className="line-clamp-1 block text-sm font-semibold text-[var(--ink)]">
                  {moneyActions[0]}
                </span>
              </span>
              <ArrowRight size={16} className="shrink-0 text-[var(--muted)]" />
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
