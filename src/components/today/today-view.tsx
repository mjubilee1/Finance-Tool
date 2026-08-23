"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Plus,
  SkipForward,
  Wallet,
} from "lucide-react";
import { useMemo, useState } from "react";
import { formatCurrency } from "@/lib/format";
import { userNow } from "@/lib/user-timezone";
import {
  DAY_SHAPE_LABEL,
  PlannerItemForm,
  SkipReasonForm,
  buildTimelineItems,
  displayPlannerNotes,
  formatCalendarEventTime,
  isEntrepreneurshipBlock,
  plannerRequest,
  preserveEntrepreneurshipMarker,
  shortTimeLabel,
  timelinePriorityLabel,
  timelinePriorityRank,
  type PlannerFormState,
  type TimelineItem,
  type TodayOverviewResponse,
} from "./planner-shared";
import { WeekAhead } from "./week-ahead";

type CashPulse = {
  checking: number | null;
  remainingToday: number;
  dailyAllowance: number;
};

type TodayViewProps = {
  onOpenOverview?: () => void;
  onOpenGrowth?: () => void;
  onOpenSettings?: () => void;
  cashPulse?: CashPulse | null;
};

function itemStatus(
  item: TimelineItem,
  completed: Set<string>,
  skipped: Set<string>,
): "done" | "skipped" | "open" {
  if (item.type === "user") {
    if (item.block.status === "done") return "done";
    if (item.block.status === "skipped") return "skipped";
    return "open";
  }
  if (item.type === "plan") {
    if (completed.has(item.block.key)) return "done";
    if (skipped.has(item.block.key)) return "skipped";
    return "open";
  }
  return "open";
}

function itemTime(item: TimelineItem) {
  if (item.type === "calendar") return formatCalendarEventTime(item.event);
  if (item.type === "user") return shortTimeLabel(item.block.timeLabel);
  return shortTimeLabel(item.block.time);
}

function itemTitle(item: TimelineItem) {
  if (item.type === "calendar") return item.event.title;
  if (item.type === "user") return item.block.title;
  return item.block.label;
}

function itemKind(item: TimelineItem) {
  return timelinePriorityLabel(item);
}

export function TodayView({
  onOpenOverview,
  onOpenGrowth,
  onOpenSettings,
  cashPulse,
}: TodayViewProps) {
  const queryClient = useQueryClient();
  const [expandedRef, setExpandedRef] = useState<string | null>(null);
  const [showWeek, setShowWeek] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [plannerBusy, setPlannerBusy] = useState<string | null>(null);
  const [plannerError, setPlannerError] = useState<string | null>(null);
  const [moveBusy, setMoveBusy] = useState<"done" | "skipped" | "recommend" | null>(null);
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
    date: userNow().toISODate()!,
  });

  const { data: todayOverview, isLoading, isError } = useQuery({
    queryKey: ["overview-today"],
    queryFn: async () => {
      const res = await fetch("/api/today");
      if (!res.ok) throw new Error("Failed to load today's plan");
      return res.json() as Promise<TodayOverviewResponse>;
    },
    staleTime: 60_000,
    retry: false,
  });

  const brief = todayOverview?.brief;
  const completed = useMemo(() => new Set(brief?.completedBlockKeys ?? []), [brief?.completedBlockKeys]);
  const skipped = useMemo(() => new Set(brief?.skippedBlockKeys ?? []), [brief?.skippedBlockKeys]);
  const systemBlocks = brief?.plan.blocks ?? [];
  const allUserBlocks = brief?.userPlanBlocks ?? [];
  const todayUserBlocks = allUserBlocks.filter((block) => !isEntrepreneurshipBlock(block));
  const gtmBlocks = allUserBlocks.filter((block) => isEntrepreneurshipBlock(block));
  const calendar = todayOverview?.calendar ?? null;
  const calendarEvents = calendar?.connected ? calendar.events : [];
  const todayDate = brief?.date ?? userNow().toISODate()!;
  const timelineItems = useMemo(() => {
    const built = buildTimelineItems(
      systemBlocks,
      todayUserBlocks,
      calendarEvents,
      brief?.dayShape,
    );
    return [...built].sort((a, b) => {
      const statusA = itemStatus(a, completed, skipped) === "open" ? 0 : 1;
      const statusB = itemStatus(b, completed, skipped) === "open" ? 0 : 1;
      if (statusA !== statusB) return statusA - statusB;
      const rank = timelinePriorityRank(a) - timelinePriorityRank(b);
      if (rank !== 0) return rank;
      return a.sortKey - b.sortKey;
    });
  }, [brief?.dayShape, calendarEvents, completed, skipped, systemBlocks, todayUserBlocks]);

  const mainRef = timelineItems.find((item) => itemStatus(item, completed, skipped) === "open")?.ref ?? null;
  const openRow = expandedRef;

  const doneCount = timelineItems.filter((item) => itemStatus(item, completed, skipped) === "done").length;
  const openCount = timelineItems.filter((item) => itemStatus(item, completed, skipped) === "open").length;

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

  const updateMoveStatus = async (id: string, status: "done" | "skipped") => {
    setMoveBusy(status);
    try {
      await fetch("/api/growth/recommend", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      refreshPlanner();
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
      refreshPlanner();
    } finally {
      setMoveBusy(null);
    }
  };

  const calendarNeedsAction =
    calendar &&
    (calendar.status === "needs_reconnect" || calendar.status === "not_connected" || Boolean(calendar.error));

  const recommendation = brief?.recommendation;
  const gtmDone = gtmBlocks.filter((block) => block.status === "done").length;

  return (
    <div className="mx-auto max-w-lg space-y-3">
      <header className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
            {brief ? `${DAY_SHAPE_LABEL[brief.dayShape]} · ${brief.dayLabel}` : "Today"}
          </p>
          <h1 className="mt-0.5 truncate text-xl font-semibold tracking-tight text-[var(--ink)]">
            {brief?.dateLabel ?? userNow().toFormat("MMMM d")}
          </h1>
        </div>
        <p className="shrink-0 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
          Main first
          <span className="mt-0.5 block tabular-nums text-sm text-[var(--ink-soft)]">
            {doneCount}/{timelineItems.length || 0}
          </span>
        </p>
      </header>

      {brief?.plan.summary ? (
        <p className="text-sm leading-snug text-[var(--ink-soft)]">{brief.plan.summary}</p>
      ) : null}

      {calendarNeedsAction ? (
        <button
          type="button"
          onClick={() =>
            calendar?.connectAvailable
              ? window.location.assign("/api/integrations/google-calendar/connect")
              : onOpenSettings?.()
          }
          className="flex min-h-11 w-full items-center justify-between gap-2 rounded-xl bg-[var(--accent-soft)] px-3 text-left text-sm font-semibold text-[var(--accent-strong)] ring-1 ring-[color-mix(in_srgb,var(--accent)_28%,transparent)]"
        >
          <span className="inline-flex items-center gap-2">
            <CalendarDays size={16} />
            {calendar?.status === "needs_reconnect" ? "Reconnect calendar" : "Connect calendar"}
          </span>
          <ChevronRight size={16} />
        </button>
      ) : null}

      {recommendation?.action ? (
        <section className="rounded-2xl bg-[var(--card-solid)] px-3 py-2.5 ring-1 ring-[var(--card-border)]">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--accent-strong)]">Move</p>
              <p className="mt-0.5 text-sm font-semibold leading-snug text-[var(--ink)]">{recommendation.action}</p>
            </div>
            {recommendation.status === "pending" ? (
              <div className="flex shrink-0 gap-1.5">
                <button
                  type="button"
                  disabled={moveBusy !== null}
                  onClick={() => updateMoveStatus(recommendation.id, "done")}
                  className="inline-flex h-10 min-w-10 items-center justify-center rounded-full bg-teal-500/20 text-teal-800 ring-1 ring-teal-400/40 disabled:opacity-50 dark:text-teal-200"
                  aria-label="Mark move done"
                >
                  <Check size={16} />
                </button>
                <button
                  type="button"
                  disabled={moveBusy !== null}
                  onClick={() => updateMoveStatus(recommendation.id, "skipped")}
                  className="inline-flex h-10 min-w-10 items-center justify-center rounded-full bg-rose-500/15 text-rose-700 ring-1 ring-rose-400/35 disabled:opacity-50 dark:text-rose-200"
                  aria-label="Skip move"
                >
                  <SkipForward size={16} />
                </button>
              </div>
            ) : (
              <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                {recommendation.status}
              </span>
            )}
          </div>
          {recommendation.status === "pending" && recommendation.timeRequiredMinutes ? (
            <p className="mt-1 text-[11px] text-[var(--muted)]">{recommendation.timeRequiredMinutes}m</p>
          ) : null}
          {recommendation.status !== "pending" ? (
            <button
              type="button"
              disabled={moveBusy !== null}
              onClick={() => generateMove(true)}
              className="mt-1 text-[11px] font-semibold text-[var(--accent-strong)]"
            >
              Different move
            </button>
          ) : null}
        </section>
      ) : (
        <button
          type="button"
          disabled={moveBusy !== null}
          onClick={() => generateMove(false)}
          className="min-h-11 w-full rounded-2xl bg-[var(--card-solid)] px-3 text-sm font-semibold text-[var(--ink-soft)] ring-1 ring-[var(--card-border)]"
        >
          Get today&apos;s move
        </button>
      )}

      {gtmBlocks.length > 0 && onOpenGrowth ? (
        <button
          type="button"
          onClick={onOpenGrowth}
          className="flex min-h-10 w-full items-center justify-between rounded-xl px-1 text-left text-[12px] font-semibold text-[var(--muted)]"
        >
          <span>
            GTM lives on Growth · {gtmDone}/{gtmBlocks.length} today
          </span>
          <ChevronRight size={14} />
        </button>
      ) : null}

      {isLoading && !brief ? (
        <p className="py-8 text-center text-sm text-[var(--muted)]">Loading today…</p>
      ) : isError && !brief ? (
        <p className="py-8 text-center text-sm text-rose-600">Couldn&apos;t load today. Try Sync.</p>
      ) : (
        <section className="overflow-hidden rounded-2xl bg-[var(--card-solid)] ring-1 ring-[var(--card-border)]">
          {plannerError ? (
            <p className="border-b border-[var(--card-border)] px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
              {plannerError}
            </p>
          ) : null}

          {timelineItems.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-[var(--muted)]">Nothing on the board yet.</p>
          ) : (
            <ol>
              {timelineItems.map((item) => {
                const status = itemStatus(item, completed, skipped);
                const expanded = openRow === item.ref;
                const isMain = item.ref === mainRef && status === "open";

                const markSystem = (nextStatus: "done" | "planned" | "skipped", notes?: string) =>
                  void runPlanner(`sys-${item.type === "plan" ? item.block.key : item.ref}`, async () => {
                    if (item.type !== "plan") return;
                    await plannerRequest("PATCH", {
                      action: "system",
                      date: todayDate,
                      blockKey: item.block.key,
                      status: nextStatus,
                      ...(notes ? { notes } : {}),
                    });
                  });

                const markUser = (nextStatus: "done" | "planned" | "skipped", notes?: string) =>
                  void runPlanner(`user-${item.type === "user" ? item.block.id : item.ref}`, async () => {
                    if (item.type !== "user") return;
                    await plannerRequest("PATCH", {
                      id: item.block.id,
                      status: nextStatus,
                      ...(notes ? { notes } : {}),
                    });
                  });

                const toggleDone = () => {
                  if (item.type === "plan") markSystem(status === "done" ? "planned" : "done");
                  if (item.type === "user") markUser(status === "done" ? "planned" : "done");
                };

                const detail =
                  item.type === "plan"
                    ? item.block.why
                    : item.type === "user"
                      ? displayPlannerNotes(item.block.notes)
                      : item.event.location;

                return (
                  <li
                    key={item.ref}
                    className={`border-b border-[var(--card-border)] last:border-b-0 ${
                      isMain ? "bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]" : ""
                    }`}
                  >
                    <div className="flex items-stretch">
                      <button
                        type="button"
                        onClick={() => setExpandedRef(expanded ? null : item.ref)}
                        className="flex min-h-11 min-w-0 flex-1 items-center gap-3 px-3 py-1 text-left"
                      >
                        <span
                          className={`w-12 shrink-0 text-[11px] font-semibold tabular-nums ${
                            status === "open" ? "text-[var(--ink-soft)]" : "text-[var(--muted)]"
                          }`}
                        >
                          {itemTime(item)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className={`block truncate text-sm font-semibold leading-tight ${
                              status === "done"
                                ? "text-[var(--muted)] line-through"
                                : status === "skipped"
                                  ? "text-[var(--muted)]"
                                  : "text-[var(--ink)]"
                            }`}
                          >
                            {item.type === "calendar" && item.event.htmlLink ? (
                              <a
                                href={item.event.htmlLink}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(event) => event.stopPropagation()}
                                className="hover:text-[var(--accent)]"
                              >
                                {itemTitle(item)}
                              </a>
                            ) : (
                              itemTitle(item)
                            )}
                          </span>
                          <span className="mt-0.5 block truncate text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                            {isMain ? "Main · " : ""}
                            {itemKind(item)}
                            {status === "skipped" ? " · skipped" : ""}
                          </span>
                        </span>
                      </button>
                      {item.type !== "calendar" ? (
                        <button
                          type="button"
                          aria-label={status === "done" ? "Undo done" : "Mark done"}
                          disabled={plannerBusy !== null}
                          onClick={toggleDone}
                          className={`m-1.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-1 ${
                            status === "done"
                              ? "bg-teal-500/20 text-teal-800 ring-teal-400/40 dark:text-teal-200"
                              : "bg-[color-mix(in_srgb,var(--ink)_6%,transparent)] text-[var(--muted)] ring-[var(--card-border)]"
                          }`}
                        >
                          <Check size={16} />
                        </button>
                      ) : (
                        <span className="m-1.5 inline-flex h-10 w-10 shrink-0 items-center justify-center text-[var(--muted)]">
                          <CalendarDays size={16} />
                        </span>
                      )}
                    </div>

                    {expanded ? (
                      <div className="space-y-2 px-3 pb-3">
                        {detail ? (
                          <p className="text-xs leading-relaxed text-[var(--ink-soft)]">{detail}</p>
                        ) : null}
                        <div className="flex flex-wrap gap-1.5">
                          {item.type === "plan" || item.type === "user" ? (
                            <button
                              type="button"
                              disabled={plannerBusy !== null}
                              onClick={() => {
                                if (status === "skipped") {
                                  if (item.type === "plan") markSystem("planned");
                                  else markUser("planned");
                                  return;
                                }
                                setTodaySkipTarget({
                                  kind: item.type === "plan" ? "system" : "user",
                                  key: item.type === "plan" ? item.block.key : item.block.id,
                                  label: itemTitle(item),
                                });
                                setTodaySkipReason("");
                              }}
                              className="min-h-10 rounded-full px-3 text-xs font-semibold text-rose-700 ring-1 ring-rose-400/35 dark:text-rose-300"
                            >
                              {status === "skipped" ? "Unskip" : "Skip"}
                            </button>
                          ) : null}
                          {item.type === "user" ? (
                            <>
                              <button
                                type="button"
                                disabled={plannerBusy !== null}
                                onClick={() => {
                                  setEditingItemId(item.block.id);
                                  setPlannerForm({
                                    title: item.block.title,
                                    timeLabel: item.block.timeLabel ?? "",
                                    notes: displayPlannerNotes(item.block.notes) ?? "",
                                    domain: item.block.domain,
                                    date: item.block.date || todayDate,
                                  });
                                }}
                                className="min-h-10 rounded-full px-3 text-xs font-semibold text-[var(--accent-strong)] ring-1 ring-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                disabled={plannerBusy !== null}
                                onClick={() =>
                                  void runPlanner(`user-del-${item.block.id}`, async () => {
                                    await plannerRequest("DELETE", undefined, item.block.id);
                                  })
                                }
                                className="min-h-10 rounded-full px-3 text-xs font-semibold text-[var(--muted)] ring-1 ring-[var(--card-border)]"
                              >
                                Remove
                              </button>
                            </>
                          ) : null}
                        </div>

                        {todaySkipTarget &&
                        ((item.type === "plan" && todaySkipTarget.key === item.block.key) ||
                          (item.type === "user" && todaySkipTarget.key === item.block.id)) ? (
                          <SkipReasonForm
                            label={todaySkipTarget.label}
                            reason={todaySkipReason}
                            onReasonChange={setTodaySkipReason}
                            busy={plannerBusy !== null}
                            onCancel={() => {
                              setTodaySkipTarget(null);
                              setTodaySkipReason("");
                            }}
                            onSave={() => {
                              const notes = todaySkipReason.trim() || "Skipped from today.";
                              if (item.type === "plan") markSystem("skipped", notes);
                              if (item.type === "user") markUser("skipped", notes);
                              setTodaySkipTarget(null);
                              setTodaySkipReason("");
                            }}
                          />
                        ) : null}

                        {item.type === "user" && editingItemId === item.block.id ? (
                          <PlannerItemForm
                            form={plannerForm}
                            onChange={setPlannerForm}
                            busy={plannerBusy !== null}
                            saveLabel="Save"
                            onCancel={() => setEditingItemId(null)}
                            onSave={() =>
                              void runPlanner(`user-edit-${item.block.id}`, async () => {
                                await plannerRequest("PATCH", {
                                  id: item.block.id,
                                  title: plannerForm.title,
                                  domain: plannerForm.domain,
                                  notes: preserveEntrepreneurshipMarker(item.block.notes, plannerForm.notes) || null,
                                  timeLabel: plannerForm.timeLabel || null,
                                  date: plannerForm.date,
                                });
                                setEditingItemId(null);
                              })
                            }
                          />
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          )}

          <div className="border-t border-[var(--card-border)] px-3 py-2">
            {addingItem ? (
              <PlannerItemForm
                form={plannerForm}
                onChange={setPlannerForm}
                busy={plannerBusy !== null}
                saveLabel="Add"
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
                className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-[var(--ink-soft)]"
              >
                <Plus size={16} />
                Add
              </button>
            )}
          </div>
        </section>
      )}

      {openCount > 0 ? (
        <p className="text-center text-[11px] text-[var(--muted)]">{openCount} still open · tap a row for skip / edit</p>
      ) : timelineItems.length > 0 ? (
        <p className="text-center text-[11px] font-semibold text-teal-700 dark:text-teal-300">Day cleared</p>
      ) : null}

      {cashPulse && onOpenOverview ? (
        <button
          type="button"
          onClick={onOpenOverview}
          className="flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl bg-[var(--card-solid)] px-3 ring-1 ring-[var(--card-border)]"
        >
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
            <Wallet size={16} className="text-[var(--muted)]" />
            {cashPulse.checking != null ? formatCurrency(cashPulse.checking) : "Money"}
          </span>
          <span
            className={`text-sm font-semibold tabular-nums ${
              cashPulse.remainingToday < 0 ? "text-rose-500" : "text-[var(--ink-soft)]"
            }`}
          >
            {formatCurrency(Math.max(0, cashPulse.remainingToday))} left
            <ChevronRight size={16} className="ml-1 inline" />
          </span>
        </button>
      ) : null}

      <button
        type="button"
        onClick={() => setShowWeek((open) => !open)}
        className="flex min-h-11 w-full items-center justify-between rounded-2xl bg-[var(--card-solid)] px-3 text-sm font-semibold text-[var(--ink)] ring-1 ring-[var(--card-border)]"
      >
        Week
        <ChevronDown size={16} className={`text-[var(--muted)] transition-transform ${showWeek ? "rotate-180" : ""}`} />
      </button>
      {showWeek ? (
        <WeekAhead weekPlan={todayOverview?.weekPlan} todayDate={todayDate} onChanged={refreshPlanner} />
      ) : null}
    </div>
  );
}
