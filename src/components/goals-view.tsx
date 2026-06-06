"use client";

import { useState } from "react";
import { formatCurrency } from "@/lib/format";
import { Target, Plus, Trash2, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export function GoalsView({ goals }: { goals: any[] }) {
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
        <h1 className="text-2xl font-bold text-zinc-900 hidden md:block">Financial Goals</h1>
        {!isAdding && (
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-emerald-700 transition"
          >
            <Plus size={16} /> Add Goal
          </button>
        )}
      </div>

      {isAdding && (
        <form onSubmit={handleAddGoal} className="bg-white border border-zinc-200 p-6 rounded-3xl shadow-sm mb-6">
          <h2 className="font-semibold text-lg mb-4">Create New Goal</h2>
          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">Goal Name</label>
              <input
                required
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="Trip to Japan or Pay off Chase Card"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">Target Amount ($)</label>
              <input
                required
                type="number"
                min="1"
                step="0.01"
                value={form.targetAmount}
                onChange={(e) => setForm({ ...form, targetAmount: e.target.value })}
                className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="5000"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">Goal Type</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="savings">Save Money</option>
                <option value="debt_payoff">Pay Down Debt</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">Priority</label>
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
                className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="1">High (Focus on this first)</option>
                <option value="2">Medium (Balance with others)</option>
                <option value="3">Low (Nice to have)</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-zinc-500 mb-1">Target Date (Optional)</label>
              <input
                type="date"
                value={form.targetDate}
                onChange={(e) => setForm({ ...form, targetDate: e.target.value })}
                className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white text-sm font-semibold rounded-xl hover:bg-black transition disabled:opacity-50"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : "Save Goal"}
            </button>
          </div>
        </form>
      )}

      {goals.length === 0 && !isAdding ? (
        <div className="bg-white border border-zinc-200 p-12 rounded-3xl text-center shadow-sm">
          <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Target className="text-emerald-600" size={24} />
          </div>
          <h3 className="text-lg font-semibold text-zinc-900 mb-2">No goals set</h3>
          <p className="text-zinc-500 mb-6 max-w-sm mx-auto">Set financial goals like a vacation or a down payment, and your AI coach will help you optimize your spending to hit them.</p>
          <button
            onClick={() => setIsAdding(true)}
            className="inline-flex items-center gap-2 bg-zinc-900 text-white px-5 py-2.5 rounded-xl font-medium hover:bg-black transition"
          >
            <Plus size={16} /> Create your first goal
          </button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {goals.map((goal) => {
            const progress = goal.targetAmount > 0 ? Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100)) : 0;
            return (
              <div key={goal.id} className="bg-white border border-zinc-200 p-6 rounded-3xl shadow-sm relative group">
                <button
                  onClick={() => handleDeleteGoal(goal.id)}
                  className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg opacity-0 group-hover:opacity-100 transition"
                  title="Delete Goal"
                >
                  <Trash2 size={16} />
                </button>
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-10 h-10 bg-emerald-50 rounded-full flex items-center justify-center shrink-0">
                    <Target className="text-emerald-600" size={20} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-zinc-900 text-lg">{goal.name}</h3>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {goal.category === "debt_payoff" && (
                        <span className="text-[10px] uppercase tracking-wider font-bold bg-rose-100 text-rose-700 px-2 py-0.5 rounded">Debt Payoff</span>
                      )}
                      {goal.priority === 1 && (
                        <span className="text-[10px] uppercase tracking-wider font-bold bg-orange-100 text-orange-700 px-2 py-0.5 rounded">High Priority</span>
                      )}
                      {goal.priority === 3 && (
                        <span className="text-[10px] uppercase tracking-wider font-bold bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded">Low Priority</span>
                      )}
                      {goal.targetDate && (
                        <span className="text-[10px] uppercase tracking-wider font-bold text-zinc-500 px-2 py-0.5 rounded border border-zinc-200">Target: {goal.targetDate}</span>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="mt-6">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="font-semibold text-emerald-600">{formatCurrency(goal.currentAmount)}</span>
                    <span className="text-zinc-500">of {formatCurrency(goal.targetAmount)}</span>
                  </div>
                  <div className="w-full bg-zinc-100 rounded-full h-2.5 overflow-hidden">
                    <div 
                      className="bg-emerald-500 h-2.5 rounded-full transition-all duration-500" 
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
