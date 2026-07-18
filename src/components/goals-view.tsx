"use client";

import { useMemo, useState } from "react";
import { formatCurrency } from "@/lib/format";
import { calculateGoalPace } from "@/lib/cash-flow";
import { calculateGoalFunding } from "@/lib/goal-funding";
import { summarizeDebtMonth } from "@/lib/debt-paydown";
import {
  GOAL_TYPE_OPTIONS,
  LIFE_GOAL_PROGRESS_TARGET,
  goalTypeLabel,
  isLifeGoalType,
  isMoneyGoalType,
  type GoalType,
} from "@/lib/goal-types";
import { Target, Plus, Trash2, Loader2, Pencil } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { DateTime } from "luxon";

type Goal = {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  monthlyContribution?: number | null;
  targetDate?: string | null;
  priority?: number;
  category?: string;
  createdAt?: string;
  thisMonthPaid?: number;
  monthKey?: string;
};

type GoalForm = {
  name: string;
  targetAmount: string;
  targetDate: string;
  priority: string;
  type: GoalType;
  monthlyContribution: string;
};

const emptyForm: GoalForm = {
  name: "",
  targetAmount: "",
  targetDate: "",
  priority: "2",
  type: "savings",
  monthlyContribution: "",
};

function goalToForm(goal: Goal): GoalForm {
  const type = (goal.category && GOAL_TYPE_OPTIONS.some((o) => o.value === goal.category)
    ? goal.category
    : "savings") as GoalType;
  return {
    name: goal.name,
    targetAmount: String(goal.targetAmount ?? ""),
    targetDate: goal.targetDate?.trim() || "",
    priority: String(goal.priority ?? 2),
    type,
    monthlyContribution:
      goal.monthlyContribution != null && goal.monthlyContribution > 0
        ? String(goal.monthlyContribution)
        : "",
  };
}

export function GoalsView({
  goals,
  netDailyAverage = 0,
  checkingCash = 0,
}: {
  goals: Goal[];
  netDailyAverage?: number;
  checkingCash?: number;
}) {
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [paymentDrafts, setPaymentDrafts] = useState<Record<string, string>>({});
  const [form, setForm] = useState<GoalForm>(emptyForm);
  const isDebtForm = form.type === "debt_payoff";

  const isLifeForm = isLifeGoalType(form.type);
  const moneyGoals = useMemo(
    () => goals.filter((goal) => isMoneyGoalType(goal.category)),
    [goals],
  );

  const funding = useMemo(
    () =>
      calculateGoalFunding({
        checkingCash,
        goals: moneyGoals,
      }),
    [checkingCash, moneyGoals],
  );
  const fundingById = useMemo(
    () => new Map(funding.goals.map((goal) => [goal.id, goal])),
    [funding.goals],
  );

  const invalidateGoals = () => {
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["growth-dashboard"] });
  };

  const startEdit = (goal: Goal) => {
    setIsAdding(false);
    setEditingId(goal.id);
    setForm(goalToForm(goal));
  };

  const cancelForm = () => {
    setIsAdding(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleAddGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = isLifeForm
        ? {
            name: form.name,
            type: form.type,
            priority: form.priority,
            targetDate: form.targetDate,
            targetAmount: LIFE_GOAL_PROGRESS_TARGET,
            currentAmount: 0,
          }
        : {
            name: form.name,
            type: form.type,
            priority: form.priority,
            targetDate: form.targetDate,
            targetAmount: form.targetAmount,
            monthlyContribution: form.monthlyContribution || null,
          };
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        cancelForm();
        invalidateGoals();
      } else {
        const data = await res.json().catch(() => null);
        alert(data?.error || "Failed to add goal");
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        id: editingId,
        name: form.name,
        type: form.type,
        priority: form.priority,
        targetDate: form.targetDate,
        monthlyContribution: form.monthlyContribution || null,
      };
      if (isLifeForm) {
        payload.targetAmount = LIFE_GOAL_PROGRESS_TARGET;
      } else {
        payload.targetAmount = form.targetAmount;
      }

      const res = await fetch("/api/goals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        cancelForm();
        invalidateGoals();
      } else {
        const data = await res.json().catch(() => null);
        alert(data?.error || "Failed to update goal");
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteGoal = async (id: string) => {
    if (!confirm("Are you sure you want to delete this goal?")) return;
    try {
      const res = await fetch(`/api/goals?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        if (editingId === id) cancelForm();
        invalidateGoals();
      }
    } catch (error) {
      console.error(error);
    }
  };

  const updateGoalAmount = async (id: string, currentAmount: number) => {
    setUpdatingId(id);
    try {
      const res = await fetch("/api/goals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, currentAmount }),
      });
      if (res.ok) invalidateGoals();
    } finally {
      setUpdatingId(null);
    }
  };

  const logDebtPayment = async (id: string) => {
    const raw = paymentDrafts[id]?.trim() ?? "";
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount <= 0) {
      alert("Enter the extra principal you paid (beyond the minimum).");
      return;
    }
    setUpdatingId(id);
    try {
      const res = await fetch("/api/goals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, addAmount: amount }),
      });
      if (res.ok) {
        setPaymentDrafts((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        invalidateGoals();
      } else {
        const data = await res.json().catch(() => null);
        alert(data?.error || "Failed to log payment");
      }
    } finally {
      setUpdatingId(null);
    }
  };

  const renderGoalForm = (mode: "create" | "edit") => (
    <form
      onSubmit={mode === "create" ? handleAddGoal : handleSaveEdit}
      className="app-card p-6 mb-6"
    >
      <h2 className="font-semibold text-lg text-slate-900 mb-4">
        {mode === "create" ? "Create new goal" : "Edit goal"}
      </h2>
      <div className="grid sm:grid-cols-2 gap-4 mb-4">
        <div className="sm:col-span-2">
          <label className="app-label block mb-1.5">Goal name</label>
          <input
            required
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="app-input w-full px-3 py-2 text-sm"
            placeholder="Pay off Chase card, finish a book, renew passport…"
          />
        </div>
        <div>
          <label className="app-label block mb-1.5">Goal type</label>
          <select
            value={form.type}
            onChange={(e) =>
              setForm({ ...form, type: e.target.value as GoalType, targetAmount: "" })
            }
            className="app-input w-full px-3 py-2 text-sm"
          >
            <optgroup label="Money">
              {GOAL_TYPE_OPTIONS.filter((o) => o.group === "money").map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Life">
              {GOAL_TYPE_OPTIONS.filter((o) => o.group === "life").map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </optgroup>
          </select>
        </div>
        <div>
          <label className="app-label block mb-1.5">Priority</label>
          <select
            value={form.priority}
            onChange={(e) => setForm({ ...form, priority: e.target.value })}
            className="app-input w-full px-3 py-2 text-sm"
          >
            <option value="1">High (focus first)</option>
            <option value="2">Medium</option>
            <option value="3">Low</option>
          </select>
        </div>
        {!isLifeForm ? (
          <>
            <div>
              <label className="app-label block mb-1.5">Target amount ($)</label>
              <input
                required
                type="number"
                min="1"
                step="0.01"
                value={form.targetAmount}
                onChange={(e) => setForm({ ...form, targetAmount: e.target.value })}
                className="app-input w-full px-3 py-2 text-sm"
                placeholder="5000"
              />
            </div>
            <div>
              <label className="app-label block mb-1.5">
                {isDebtForm ? "Monthly principal plan ($)" : "Monthly plan ($)"}
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.monthlyContribution}
                onChange={(e) => setForm({ ...form, monthlyContribution: e.target.value })}
                className="app-input w-full px-3 py-2 text-sm"
                placeholder={isDebtForm ? "e.g. 200 beyond minimums" : "Optional — e.g. 15"}
              />
              {isDebtForm ? (
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                  Extra principal each month — not the minimum. That&apos;s how you tell paydown from
                  treading water.
                </p>
              ) : null}
            </div>
          </>
        ) : (
          <div className="rounded-xl bg-slate-50/80 p-3 ring-1 ring-slate-200/50 text-sm text-slate-600 leading-relaxed sm:col-span-2">
            Life goals track progress (0–100%), not dollars. Update progress after you work the
            goal.
          </div>
        )}
        <div>
          <label className="app-label block mb-1.5">Target date</label>
          <input
            type="date"
            value={form.targetDate}
            onChange={(e) => setForm({ ...form, targetDate: e.target.value })}
            className="app-input w-full px-3 py-2 text-sm"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={cancelForm}
          className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-xl transition"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 app-btn-primary text-sm disabled:opacity-50"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : null}
          {mode === "create" ? "Save goal" : "Save changes"}
        </button>
      </div>
    </form>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl app-display text-slate-900 tracking-tight hidden md:block">Goals</h1>
        {!isAdding && !editingId && (
          <button
            onClick={() => {
              setEditingId(null);
              setForm(emptyForm);
              setIsAdding(true);
            }}
            className="flex items-center gap-2 app-btn-primary px-4 py-2 text-sm"
          >
            <Plus size={16} /> Add goal
          </button>
        )}
      </div>

      {moneyGoals.length > 0 ? (
        <div className="app-card p-4 text-sm text-slate-600 leading-relaxed">
          Money goals use your <span className="font-medium text-slate-800">checking cash</span>{" "}
          ({formatCurrency(funding.checkingCash)}) after a{" "}
          {formatCurrency(funding.protectedBuffer)} buffer. Order: targets within ~12 months, then
          undated goals, then farther dates — so a 2027 house doesn&apos;t beat a trip with no date.
          Debt goals track a <span className="font-medium text-slate-800">monthly principal plan</span>{" "}
          so you can see real paydown vs treading water. Life goals track progress separately.
        </div>
      ) : null}

      {isAdding ? renderGoalForm("create") : null}
      {editingId ? renderGoalForm("edit") : null}

      {goals.length === 0 && !isAdding ? (
        <div className="app-card p-12 text-center">
          <div className="w-12 h-12 bg-teal-50 rounded-2xl flex items-center justify-center mx-auto mb-4 ring-1 ring-teal-200/60">
            <Target className="text-teal-600" size={24} />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">No goals set</h3>
          <p className="text-slate-500 mb-6 max-w-sm mx-auto leading-relaxed">
            Money, learning, fitness, career, documents — anything you want to compound. Examples
            only: debt payoff, a book, a passport renewal.
          </p>
          <button
            onClick={() => setIsAdding(true)}
            className="inline-flex items-center gap-2 app-btn-primary px-5 py-2.5"
          >
            <Plus size={16} /> Create your first goal
          </button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {goals.map((goal) => {
            const lifeGoal = isLifeGoalType(goal.category);
            const funded = lifeGoal ? null : fundingById.get(goal.id);
            const progress = lifeGoal
              ? Math.min(
                  100,
                  Math.round(
                    (Math.max(0, goal.currentAmount) /
                      Math.max(1, goal.targetAmount || LIFE_GOAL_PROGRESS_TARGET)) *
                      100,
                  ),
                )
              : (funded?.progressPct ?? 0);
            const effectiveAmount = funded?.effectiveAmount ?? goal.currentAmount;
            const pace = !lifeGoal
              ? calculateGoalPace({
                  targetAmount: goal.targetAmount,
                  currentAmount: effectiveAmount,
                  targetDate: goal.targetDate,
                  netDailyAverage,
                  monthlyContribution: goal.monthlyContribution,
                  category: goal.category,
                })
              : null;
            const projectedLabel = pace?.projectedDate
              ? DateTime.fromISO(pace.projectedDate).toFormat("MMM d, yyyy")
              : null;
            const complete = lifeGoal
              ? progress >= 100
              : Boolean(funded?.fullyFunded);
            const isEditing = editingId === goal.id;
            const isDebt = goal.category === "debt_payoff";
            const debtMonth = isDebt
              ? summarizeDebtMonth({
                  monthPaid: goal.thisMonthPaid ?? 0,
                  monthlyPlan: goal.monthlyContribution,
                  totalPaid: effectiveAmount,
                  targetAmount: goal.targetAmount,
                })
              : null;

            return (
              <div
                key={goal.id}
                className={`app-card p-6 relative group ${isEditing ? "ring-2 ring-teal-400/50" : ""}`}
              >
                <div className="absolute top-4 right-4 flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition">
                  <button
                    type="button"
                    onClick={() => startEdit(goal)}
                    className="p-2 text-slate-400 hover:text-teal-700 hover:bg-teal-50 rounded-lg"
                    title="Edit goal"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteGoal(goal.id)}
                    className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg"
                    title="Delete goal"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="flex items-start gap-4 mb-4 pr-16">
                  <div className="w-10 h-10 bg-teal-50 rounded-xl flex items-center justify-center shrink-0 ring-1 ring-teal-200/50">
                    <Target className="text-teal-600" size={20} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 text-lg">{goal.name}</h3>
                    <div className="flex flex-wrap gap-2 mt-1.5">
                      <span className="text-[10px] uppercase tracking-wider font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md">
                        {goalTypeLabel(goal.category)}
                      </span>
                      {isDebt && (
                        <span className="text-[10px] uppercase tracking-wider font-bold bg-rose-50 text-rose-700 px-2 py-0.5 rounded-md ring-1 ring-rose-200/60">Debt</span>
                      )}
                      {debtMonth && debtMonth.status !== "done" ? (
                        <span
                          className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-md ring-1 ${
                            debtMonth.status === "treading_water"
                              ? "bg-amber-50 text-amber-900 ring-amber-200/70"
                              : debtMonth.status === "behind" || debtMonth.status === "no_plan"
                                ? "bg-slate-100 text-slate-700 ring-slate-200/70"
                                : "bg-teal-50 text-teal-800 ring-teal-200/60"
                          }`}
                        >
                          {debtMonth.statusLabel}
                        </span>
                      ) : null}
                      {goal.priority === 1 && (
                        <span className="text-[10px] uppercase tracking-wider font-bold bg-amber-50 text-amber-800 px-2 py-0.5 rounded-md ring-1 ring-amber-200/60">High</span>
                      )}
                      {goal.priority === 3 && (
                        <span className="text-[10px] uppercase tracking-wider font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">Low</span>
                      )}
                      {goal.targetDate?.trim() ? (
                        <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500 px-2 py-0.5 rounded-md ring-1 ring-slate-200/60">Target: {goal.targetDate}</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEdit(goal)}
                          className="text-[10px] uppercase tracking-wider font-bold text-slate-400 px-2 py-0.5 rounded-md ring-1 ring-dashed ring-slate-300 hover:text-teal-700 hover:ring-teal-300"
                        >
                          Add target date
                        </button>
                      )}
                      {complete ? (
                        <span className="text-[10px] uppercase tracking-wider font-bold bg-teal-50 text-teal-800 px-2 py-0.5 rounded-md ring-1 ring-teal-200/60">
                          Done
                        </span>
                      ) : funded?.coveredByChecking ? (
                        <span className="text-[10px] uppercase tracking-wider font-bold bg-sky-50 text-sky-800 px-2 py-0.5 rounded-md ring-1 ring-sky-200/60">
                          From checking
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  {lifeGoal ? (
                    <>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="font-semibold text-teal-700 tabular-nums">{progress}%</span>
                        <span className="text-slate-500">progress</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={progress}
                        disabled={updatingId === goal.id}
                        onChange={(e) => updateGoalAmount(goal.id, Number(e.target.value))}
                        className="w-full accent-teal-600"
                      />
                      <p className="text-xs text-slate-500 mt-2">
                        Drag to update — money is not required for this goal.
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="font-semibold text-teal-700 tabular-nums">{formatCurrency(effectiveAmount)}</span>
                        <span className="text-slate-500 tabular-nums">of {formatCurrency(goal.targetAmount)}</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-teal-500 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(100, progress)}%` }}
                        />
                      </div>
                      <p className="text-xs text-slate-500 mt-2">
                        {Math.round(progress)}% {isDebt ? "paid toward payoff" : "covered"}
                        {funded?.coveredByChecking
                          ? ` · ${formatCurrency(funded.checkingAllocation)} assigned from checking`
                          : ""}
                        {!isDebt && goal.monthlyContribution && goal.monthlyContribution > 0
                          ? ` · plan ${formatCurrency(goal.monthlyContribution)}/mo`
                          : ""}
                      </p>
                    </>
                  )}
                </div>

                {isDebt && debtMonth ? (
                  <div className="mt-4 rounded-xl p-3 ring-1 ring-slate-200/70 bg-slate-50/70">
                    <div className="flex justify-between text-sm mb-2 gap-3">
                      <span className="font-semibold text-slate-800">
                        {debtMonth.monthLabel} principal
                      </span>
                      <span className="text-slate-600 tabular-nums shrink-0">
                        {formatCurrency(debtMonth.monthPaid)}
                        {debtMonth.monthlyPlan != null
                          ? ` / ${formatCurrency(debtMonth.monthlyPlan)}`
                          : ""}
                      </span>
                    </div>
                    {debtMonth.monthlyPlan != null ? (
                      <div className="w-full bg-white rounded-full h-2 overflow-hidden ring-1 ring-slate-200/60">
                        <div
                          className={`h-2 rounded-full transition-all duration-500 ${
                            debtMonth.status === "treading_water"
                              ? "bg-amber-500"
                              : debtMonth.status === "behind"
                                ? "bg-slate-400"
                                : "bg-teal-500"
                          }`}
                          style={{ width: `${Math.min(100, debtMonth.monthProgressPct)}%` }}
                        />
                      </div>
                    ) : null}
                    {!complete ? (
                      <div className="mt-3 flex flex-col sm:flex-row gap-2">
                        <input
                          type="number"
                          min="1"
                          step="0.01"
                          inputMode="decimal"
                          placeholder="Extra principal paid"
                          value={paymentDrafts[goal.id] ?? ""}
                          onChange={(e) =>
                            setPaymentDrafts((prev) => ({
                              ...prev,
                              [goal.id]: e.target.value,
                            }))
                          }
                          className="app-input flex-1 px-3 py-2 text-sm"
                        />
                        <button
                          type="button"
                          disabled={updatingId === goal.id}
                          onClick={() => logDebtPayment(goal.id)}
                          className="inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-xl ring-1 ring-teal-200/70 disabled:opacity-60"
                        >
                          {updatingId === goal.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : null}
                          Log payment
                        </button>
                      </div>
                    ) : null}
                    <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                      Log extras beyond the minimum. That&apos;s what shrinks the balance.
                    </p>
                  </div>
                ) : null}

                {lifeGoal && !complete ? (
                  <button
                    type="button"
                    disabled={updatingId === goal.id}
                    onClick={() => updateGoalAmount(goal.id, LIFE_GOAL_PROGRESS_TARGET)}
                    className="mt-3 text-xs font-semibold text-teal-700 hover:text-teal-800 disabled:opacity-60"
                  >
                    {updatingId === goal.id ? "Saving…" : "Mark complete"}
                  </button>
                ) : null}

                {!lifeGoal && !isDebt && !funded?.fullyFunded ? (
                  <button
                    type="button"
                    disabled={updatingId === goal.id}
                    onClick={() => updateGoalAmount(goal.id, goal.targetAmount)}
                    className="mt-3 text-xs font-semibold text-teal-700 hover:text-teal-800 disabled:opacity-60"
                  >
                    {updatingId === goal.id ? "Saving…" : "Mark as fully covered"}
                  </button>
                ) : null}

                <div
                  className={`mt-4 rounded-xl p-3 text-sm ring-1 leading-relaxed ${
                    isDebt && debtMonth
                      ? debtMonth.status === "treading_water" || debtMonth.status === "behind"
                        ? "bg-amber-50/80 text-amber-900 ring-amber-200/50"
                        : debtMonth.status === "no_plan"
                          ? "bg-slate-50 text-slate-700 ring-slate-200/60"
                          : "bg-teal-50/80 text-teal-900 ring-teal-200/50"
                      : complete || pace?.onTrack
                        ? "bg-teal-50/80 text-teal-900 ring-teal-200/50"
                        : "bg-amber-50/80 text-amber-900 ring-amber-200/50"
                  }`}
                >
                  <p>
                    {lifeGoal
                      ? complete
                        ? "Done — protect the win and pick the next compounding move."
                        : goal.targetDate?.trim()
                          ? `Life goal in progress — target ${goal.targetDate}. Log work in Growth when you push it forward.`
                          : "Life goal in progress — update the slider as you move. No cash allocation needed."
                      : isDebt && debtMonth
                        ? debtMonth.message
                        : funded?.fullyFunded
                          ? "Checking coverage already meets this goal — protect that cash until you spend it on purpose."
                          : funded?.coveredByChecking && pace && pace.dailyContribution <= 0
                            ? `Checking covers ${formatCurrency(funded.checkingAllocation)} for now — add income or cut spend to keep filling the rest.`
                            : pace?.paceMessage}
                  </p>
                  {!lifeGoal && !funded?.fullyFunded && projectedLabel && pace && pace.remaining > 0 && (
                    <p className="text-xs mt-1 opacity-80">
                      {formatCurrency(pace.remaining)} left · ~{pace.monthsToComplete} mo at current pace
                      {pace.tenDollarsFasterDays && pace.tenDollarsFasterDays > 0
                        ? ` · Cut $10/day to finish ~${pace.tenDollarsFasterDays} days sooner`
                        : ""}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
