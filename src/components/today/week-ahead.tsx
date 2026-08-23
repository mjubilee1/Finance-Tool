"use client";

import { Check, ChevronDown, Plus } from "lucide-react";
import { useState } from "react";
import {
  DAY_SHAPE_LABEL,
  PlannerItemForm,
  SkipReasonForm,
  plannerRequest,
  type PlannerFormState,
  type WeeklyOperatingPlanOverview,
} from "./planner-shared";

type WeekBlock = WeeklyOperatingPlanOverview["days"][number]["blocks"][number];

function isGtmBlock(block: WeekBlock) {
  return (
    block.domain === "startup" ||
    block.why?.includes("entrepreneurship:") ||
    block.why?.includes("entrepreneurship")
  );
}

function weekPriority(block: WeekBlock) {
  if (block.source === "google_calendar" || block.priority === "locked") return 1;
  if (block.priority === "protect") return 2;
  if (block.source === "user_plan") return 3;
  return 6;
}

export function WeekAhead({
  weekPlan,
  todayDate,
  onChanged,
}: {
  weekPlan: WeeklyOperatingPlanOverview | null | undefined;
  todayDate?: string | null;
  onChanged: () => void;
}) {
  const [openDate, setOpenDate] = useState<string | null>(todayDate ?? null);
  const [busy, setBusy] = useState<string | null>(null);
  const [addingDate, setAddingDate] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedBlock, setExpandedBlock] = useState<string | null>(null);
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
    <div className="overflow-hidden rounded-2xl bg-[var(--card-solid)] ring-1 ring-[var(--card-border)]">
      <div className="flex items-center justify-between gap-3 px-3 py-2.5">
        <p className="text-sm font-semibold text-[var(--ink)]">Week</p>
        <p className="text-[11px] font-semibold tabular-nums text-[var(--muted)]">
          {weekPlan.startDate.slice(5)}–{weekPlan.endDate.slice(5)}
        </p>
      </div>

      {error ? (
        <p className="border-t border-[var(--card-border)] px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
          {error}
        </p>
      ) : null}

      <ol>
        {weekPlan.days.map((day) => {
          const isToday = Boolean(todayDate && day.date === todayDate);
          const isOpen = openDate === day.date;
          const visibleBlocks = day.blocks
            .filter((block) => !isGtmBlock(block))
            .filter(
              (block) =>
                block.source === "google_calendar" ||
                block.source === "user_plan" ||
                block.priority === "protect",
            )
            .sort((a, b) => weekPriority(a) - weekPriority(b) || a.sortKey - b.sortKey)
            .slice(0, 5);
          const headline = visibleBlocks[0]?.label ?? DAY_SHAPE_LABEL[day.dayShape];

          return (
            <li key={day.date} className="border-t border-[var(--card-border)]">
              <button
                type="button"
                onClick={() => setOpenDate(isOpen ? null : day.date)}
                className={`flex min-h-12 w-full items-center gap-3 px-3 text-left ${
                  isToday ? "bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]" : ""
                }`}
              >
                <span className="w-14 shrink-0 text-[13px] font-semibold text-[var(--ink)]">
                  {day.weekdayLabel.slice(0, 3)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-[var(--ink-soft)]">{headline}</span>
                <span className="shrink-0 text-[11px] font-semibold tabular-nums text-[var(--muted)]">
                  {visibleBlocks.length}
                </span>
                <ChevronDown
                  size={16}
                  className={`shrink-0 text-[var(--muted)] transition-transform ${isOpen ? "rotate-180" : ""}`}
                />
              </button>

              {isOpen ? (
                <div className="border-t border-[var(--card-border)]">
                  {visibleBlocks.length === 0 ? (
                    <p className="px-3 py-3 text-sm text-[var(--muted)]">Nothing locked in.</p>
                  ) : (
                    <ol>
                      {visibleBlocks.map((block) => {
                        const isDone = block.status === "done";
                        const isSkipped = block.status === "skipped";
                        const isUser = block.source === "user_plan" && block.activityId;
                        const rowKey = `${day.date}:${block.id}`;
                        const expanded = expandedBlock === rowKey;
                        const skipKey = rowKey;
                        const isSkipping =
                          skipTarget?.date === day.date && skipTarget.blockKey === block.id;

                        const mark = (status: "done" | "planned" | "skipped", notes?: string) =>
                          void run(`week-${status}-${rowKey}`, async () => {
                            if (isUser) {
                              await plannerRequest("PATCH", {
                                id: block.activityId,
                                status,
                                ...(notes ? { notes } : {}),
                              });
                            } else {
                              await plannerRequest("PATCH", {
                                action: "system",
                                date: day.date,
                                blockKey: block.id,
                                status,
                                ...(notes ? { notes } : {}),
                              });
                            }
                          });

                        return (
                          <li key={block.id} className="border-t border-[var(--card-border)] first:border-t-0">
                            <div className="flex items-stretch">
                              <button
                                type="button"
                                onClick={() => setExpandedBlock(expanded ? null : rowKey)}
                                className="flex min-h-11 min-w-0 flex-1 items-center gap-3 px-3 text-left"
                              >
                                <span className="w-12 shrink-0 text-[11px] font-semibold tabular-nums text-[var(--muted)]">
                                  {block.time.replace(":00", "")}
                                </span>
                                <span
                                  className={`min-w-0 flex-1 truncate text-sm font-semibold ${
                                    isDone || isSkipped
                                      ? "text-[var(--muted)] line-through"
                                      : "text-[var(--ink)]"
                                  }`}
                                >
                                  {block.label}
                                </span>
                              </button>
                              {block.source !== "google_calendar" ? (
                                <button
                                  type="button"
                                  aria-label={isDone ? "Undo done" : "Mark done"}
                                  disabled={busy !== null}
                                  onClick={() => mark(isDone ? "planned" : "done")}
                                  className={`m-1.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-1 ${
                                    isDone
                                      ? "bg-teal-500/20 text-teal-800 ring-teal-400/40 dark:text-teal-200"
                                      : "bg-[color-mix(in_srgb,var(--ink)_6%,transparent)] text-[var(--muted)] ring-[var(--card-border)]"
                                  }`}
                                >
                                  <Check size={16} />
                                </button>
                              ) : null}
                            </div>

                            {expanded ? (
                              <div className="space-y-2 px-3 pb-3">
                                {block.source !== "google_calendar" ? (
                                  <div className="flex flex-wrap gap-1.5">
                                    <button
                                      type="button"
                                      disabled={busy !== null}
                                      onClick={() => {
                                        if (isSkipped) {
                                          mark("planned");
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
                                      className="min-h-10 rounded-full px-3 text-xs font-semibold text-rose-700 ring-1 ring-rose-400/35 dark:text-rose-300"
                                    >
                                      {isSkipped ? "Unskip" : "Skip"}
                                    </button>
                                    {isUser ? (
                                      <>
                                        <button
                                          type="button"
                                          disabled={busy !== null}
                                          onClick={() => {
                                            setSkipTarget(null);
                                            setEditingId(block.activityId!);
                                            setAddingDate(null);
                                            setForm({
                                              title: block.label,
                                              timeLabel: block.time === "Your block" ? "" : block.time,
                                              notes: block.why.includes(" · added to your plan")
                                                ? ""
                                                : block.why,
                                              domain: block.domain || "personal",
                                              date: day.date,
                                            });
                                          }}
                                          className="min-h-10 rounded-full px-3 text-xs font-semibold text-[var(--accent-strong)] ring-1 ring-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
                                        >
                                          Edit
                                        </button>
                                        <button
                                          type="button"
                                          disabled={busy !== null}
                                          onClick={() =>
                                            void run(`week-del-${block.activityId}`, async () => {
                                              await plannerRequest("DELETE", undefined, block.activityId);
                                            })
                                          }
                                          className="min-h-10 rounded-full px-3 text-xs font-semibold text-[var(--muted)] ring-1 ring-[var(--card-border)]"
                                        >
                                          Remove
                                        </button>
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
                                        mark("skipped", skipReason.trim() || "Skipped from week planner.");
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
                            ) : null}
                          </li>
                        );
                      })}
                    </ol>
                  )}

                  {addingDate === day.date ? (
                    <div className="px-3 pb-3">
                      <PlannerItemForm
                        form={form}
                        onChange={setForm}
                        busy={busy !== null}
                        saveLabel="Add"
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
                    </div>
                  ) : (
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
                      className="inline-flex min-h-10 items-center gap-1.5 px-3 pb-2 text-sm font-semibold text-[var(--ink-soft)]"
                    >
                      <Plus size={16} />
                      Add
                    </button>
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
