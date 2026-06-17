"use client";

import { useState } from "react";
import { formatCurrency } from "@/lib/format";
import { calculateGoalPace } from "@/lib/cash-flow";
import { Target, Plus, Trash2, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { DateTime } from "luxon";

type Goal = {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate?: string | null;
  priority?: number;
  category?: string;
};

export function GoalsView({
  goals,
  netDailyAverage = 0,
}: {
  goals: Goal[];
  netDailyAverage?: number;
}) {
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: "", targetAmount: "", targetDate: "", priority: "2", type: "savings" });

  const handleAddGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setForm({ name: "", targetAmount: "", targetDate: "", priority: "2", type: "savings" });
        setIsAdding(false);
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      } else {
        alert("Failed to add goal");
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
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      }
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight hidden md:block">Goals</h1>
        {!isAdding && (
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-2 app-btn-primary px-4 py-2 text-sm"
          >
            <Plus size={16} /> Add goal
          </button>
        )}
      </div>

      {isAdding && (
        <form onSubmit={handleAddGoal} className="app-card p-6 mb-6">
          <h2 className="font-semibold text-lg text-slate-900 mb-4">Create new goal</h2>
          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="app-label block mb-1.5">Goal name</label>
              <input
                required
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="app-input w-full px-3 py-2 text-sm"
                placeholder="Trip to Japan or Pay off Chase Card"
              />
            </div>
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
              <label className="app-label block mb-1.5">Goal type</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="app-input w-full px-3 py-2 text-sm"
              >
                <option value="savings">Save money</option>
                <option value="debt_payoff">Pay down debt</option>
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
            <div className="sm:col-span-2">
              <label className="app-label block mb-1.5">Target date (optional)</label>
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
              onClick={() => setIsAdding(false)}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 app-btn-primary text-sm disabled:opacity-50"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : "Save goal"}
            </button>
          </div>
        </form>
      )}

      {goals.length === 0 && !isAdding ? (
        <div className="app-card p-12 text-center">
          <div className="w-12 h-12 bg-teal-50 rounded-2xl flex items-center justify-center mx-auto mb-4 ring-1 ring-teal-200/60">
            <Target className="text-teal-600" size={24} />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">No goals set</h3>
          <p className="text-slate-500 mb-6 max-w-sm mx-auto leading-relaxed">
            Set financial goals and your CFO will help optimize spending to reach them.
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
            const progress = goal.targetAmount > 0 ? Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100)) : 0;
            const pace = calculateGoalPace({
              targetAmount: goal.targetAmount,
              currentAmount: goal.currentAmount,
              targetDate: goal.targetDate,
              netDailyAverage,
            });
            const projectedLabel = pace.projectedDate
              ? DateTime.fromISO(pace.projectedDate).toFormat("MMM d, yyyy")
              : null;

            return (
              <div key={goal.id} className="app-card p-6 relative group">
                <button
                  onClick={() => handleDeleteGoal(goal.id)}
                  className="absolute top-4 right-4 p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg opacity-0 group-hover:opacity-100 transition"
                  title="Delete Goal"
                >
                  <Trash2 size={16} />
                </button>
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-10 h-10 bg-teal-50 rounded-xl flex items-center justify-center shrink-0 ring-1 ring-teal-200/50">
                    <Target className="text-teal-600" size={20} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 text-lg">{goal.name}</h3>
                    <div className="flex flex-wrap gap-2 mt-1.5">
                      {goal.category === "debt_payoff" && (
                        <span className="text-[10px] uppercase tracking-wider font-bold bg-rose-50 text-rose-700 px-2 py-0.5 rounded-md ring-1 ring-rose-200/60">Debt</span>
                      )}
                      {goal.priority === 1 && (
                        <span className="text-[10px] uppercase tracking-wider font-bold bg-amber-50 text-amber-800 px-2 py-0.5 rounded-md ring-1 ring-amber-200/60">High</span>
                      )}
                      {goal.priority === 3 && (
                        <span className="text-[10px] uppercase tracking-wider font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">Low</span>
                      )}
                      {goal.targetDate && (
                        <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500 px-2 py-0.5 rounded-md ring-1 ring-slate-200/60">Target: {goal.targetDate}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="font-semibold text-teal-700 tabular-nums">{formatCurrency(goal.currentAmount)}</span>
                    <span className="text-slate-500 tabular-nums">of {formatCurrency(goal.targetAmount)}</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-teal-500 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                <div className={`mt-4 rounded-xl p-3 text-sm ring-1 leading-relaxed ${pace.onTrack ? "bg-teal-50/80 text-teal-900 ring-teal-200/50" : "bg-amber-50/80 text-amber-900 ring-amber-200/50"}`}>
                  <p>{pace.paceMessage}</p>
                  {projectedLabel && pace.remaining > 0 && (
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
