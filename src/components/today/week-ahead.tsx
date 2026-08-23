"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  DAY_SHAPE_LABEL,
  PlannerActionButton,
  PlannerItemForm,
  SkipReasonForm,
  plannerRequest,
  weeklyBlockTone,
  type PlannerFormState,
  type WeeklyOperatingPlanOverview,
} from "./planner-shared";

export function WeekAhead({
  weekPlan,
  todayDate,
  onChanged,
}: {
  weekPlan: WeeklyOperatingPlanOverview | null | undefined;
  todayDate?: string | null;
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
          <h2 className="mt-1 text-base font-semibold text-[var(--ink)]">Week script</h2>
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
          const isToday = Boolean(todayDate && day.date === todayDate);
          const visibleBlocks = day.blocks
            .filter((block) =>
              block.source === "google_calendar" ||
              block.source === "user_plan" ||
              block.priority === "protect" ||
              block.priority === "prep" ||
              block.type === "cash" ||
              block.type === "work" ||
              block.type === "focus" ||
              block.type === "recovery" ||
              isToday,
            )
            .slice(0, isToday ? 8 : 6);
          const refs = visibleBlocks.map((block) => block.ref || `week:${block.id}`);

          return (
            <div
              key={day.date}
              className={`rounded-xl p-3 ring-1 ${
                isToday
                  ? "bg-[var(--accent-soft)] ring-[color-mix(in_srgb,var(--accent)_40%,transparent)]"
                  : "bg-[color-mix(in_srgb,var(--ink)_3%,transparent)] ring-[var(--card-border)]"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--ink)]">
                    {day.weekdayLabel} · {day.dateLabel}
                    {isToday ? (
                      <span className="ml-2 rounded-full bg-[var(--accent)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                        Today
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-[var(--muted)] mt-0.5">{DAY_SHAPE_LABEL[day.dayShape]}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="rounded-full bg-[color-mix(in_srgb,var(--ink)_6%,transparent)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
                    {isToday
                      ? "Today"
                      : day.blocks.some((block) => block.source === "google_calendar")
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
              <p className="mt-1 line-clamp-2 text-xs leading-snug text-[var(--ink-soft)]">{day.valueFocus}</p>

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
                      <p className="mt-0.5 line-clamp-1 text-[11px] leading-snug opacity-80">{block.why}</p>
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
                            onClick={() => {
                              if (isDone) {
                                void run(`week-done-${ref}`, async () => {
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
                              void run(`week-done-${ref}`, async () => {
                                if (isUser) {
                                  await plannerRequest("PATCH", {
                                    id: block.activityId,
                                    status: "done",
                                  });
                                } else {
                                  await plannerRequest("PATCH", {
                                    action: "system",
                                    date: day.date,
                                    blockKey: block.id,
                                    status: "done",
                                  });
                                }
                              });
                            }}
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
