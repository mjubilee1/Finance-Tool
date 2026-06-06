"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { formatCurrency } from "@/lib/format";

function fetchProjections(excludeDebt: boolean) {
  return fetch(`/api/projections?excludeDebt=${excludeDebt}`).then((res) => res.json());
}

type SafeSpendScenario = {
  safeDailySpend: number;
  safeSpendReason: string;
  dailyIncomeAssumption: number;
  plannedNetDailyAverage: number;
  monthlySpendAtSafeRate: number;
  sixMonthSpendAtSafeRate: number;
  balanceIn30Days: number;
  balanceIn90Days: number;
  balanceIn180Days: number;
  tenDollarsPerDayMonthlyImpact: number;
  tenDollarsPerDaySixMonthImpact: number;
  raiseFactors: string[];
  hurtFactors: string[];
};

export function Projections() {
  const [includeDebt, setIncludeDebt] = useState(false);
  const excludeDebt = !includeDebt;

  const { data, isLoading } = useQuery({
    queryKey: ["projections", excludeDebt],
    queryFn: () => fetchProjections(excludeDebt),
  });

  if (isLoading) {
    return (
      <div className="p-8 text-center bg-white border border-zinc-200 rounded-3xl animate-pulse">
        <div className="h-6 w-48 bg-zinc-200 rounded mx-auto mb-4"></div>
        <div className="h-4 w-32 bg-zinc-200 rounded mx-auto mb-8"></div>
        <div className="h-64 bg-zinc-100 rounded-xl"></div>
      </div>
    );
  }

  if (!data || data.error) {
    return null;
  }

  const { metrics, projectionData, safeSpendScenario } = data as {
    metrics: {
      daysAnalyzed: number;
      dailyAverageSpend: number;
      dailyAverageIncome: number;
      netDailyAverage: number;
      currentTotalBalance: number;
    };
    projectionData: Array<{
      date: string;
      projectedBalance: number;
      safeSpendProjectedBalance: number;
    }>;
    safeSpendScenario?: SafeSpendScenario;
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-sm text-zinc-500">Based on {Math.round(metrics.daysAnalyzed)} days of history</p>
        </div>
        
        <label className="flex items-center space-x-3 bg-zinc-50 p-2.5 rounded-xl border border-zinc-200 cursor-pointer hover:bg-zinc-100 transition-colors">
          <div className="relative">
            <input 
              type="checkbox" 
              className="sr-only" 
              checked={includeDebt}
              onChange={(e) => setIncludeDebt(e.target.checked)}
            />
            <div className={`block w-10 h-6 rounded-full transition-colors ${includeDebt ? 'bg-emerald-500' : 'bg-zinc-300'}`}></div>
            <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${includeDebt ? 'translate-x-4' : ''}`}></div>
          </div>
          <span className="text-sm font-medium text-zinc-700">
            Include Debt Accounts
          </span>
        </label>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-100">
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Daily Avg Spend</p>
          <p className="text-xl font-bold text-zinc-900">{formatCurrency(metrics.dailyAverageSpend)}</p>
        </div>
        <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-100">
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Daily Avg Income</p>
          <p className="text-xl font-bold text-emerald-600">{formatCurrency(metrics.dailyAverageIncome)}</p>
        </div>
        <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-100">
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Net Daily</p>
          <p className={`text-xl font-bold ${metrics.netDailyAverage >= 0 ? "text-emerald-600" : "text-red-500"}`}>
            {formatCurrency(metrics.netDailyAverage)}
          </p>
        </div>
        <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-100">
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Current Balance</p>
          <p className="text-xl font-bold text-zinc-900">{formatCurrency(metrics.currentTotalBalance)}</p>
        </div>
      </div>

      {safeSpendScenario ? (
        <div className="bg-emerald-950 text-white p-6 rounded-3xl shadow-xl">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-emerald-300 font-semibold mb-2">Micro to Macro Plan</p>
              <h3 className="text-xl font-bold">
                If you hold spending to {formatCurrency(safeSpendScenario.safeDailySpend)}/day
              </h3>
              <p className="mt-2 text-sm text-emerald-50/80 max-w-2xl">
                That is {formatCurrency(safeSpendScenario.monthlySpendAtSafeRate)} per month and {formatCurrency(safeSpendScenario.sixMonthSpendAtSafeRate)} over six months before new debt payments. Every extra $10/day costs about {formatCurrency(safeSpendScenario.tenDollarsPerDayMonthlyImpact)} per month and {formatCurrency(safeSpendScenario.tenDollarsPerDaySixMonthImpact)} over six months.
              </p>
            </div>
            <div className={`rounded-2xl px-4 py-3 text-right ${safeSpendScenario.plannedNetDailyAverage >= 0 ? "bg-emerald-400/15" : "bg-amber-400/15"}`}>
              <p className="text-xs uppercase tracking-wider text-emerald-100/70">Planned Net Daily</p>
              <p className="text-2xl font-bold text-emerald-300">{formatCurrency(safeSpendScenario.plannedNetDailyAverage)}</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 mt-6">
            <div className="rounded-2xl bg-white/10 p-4 border border-white/10">
              <p className="text-xs uppercase tracking-wider text-emerald-100/70 mb-1">30 Days</p>
              <p className="text-xl font-bold">{formatCurrency(safeSpendScenario.balanceIn30Days)}</p>
            </div>
            <div className="rounded-2xl bg-white/10 p-4 border border-white/10">
              <p className="text-xs uppercase tracking-wider text-emerald-100/70 mb-1">90 Days</p>
              <p className="text-xl font-bold">{formatCurrency(safeSpendScenario.balanceIn90Days)}</p>
            </div>
            <div className="rounded-2xl bg-white/10 p-4 border border-white/10">
              <p className="text-xs uppercase tracking-wider text-emerald-100/70 mb-1">6 Months</p>
              <p className="text-xl font-bold">{formatCurrency(safeSpendScenario.balanceIn180Days)}</p>
            </div>
          </div>

          <p className="mt-4 text-xs text-emerald-50/70">
            Assumes daily income continues at {formatCurrency(safeSpendScenario.dailyIncomeAssumption)} and daily spend stays at the CFO safe-spend number.
          </p>
        </div>
      ) : null}

      <div className="space-y-4">
        <div>
          <h3 className="font-semibold text-zinc-900">6-Month Projection</h3>
          <p className="text-sm text-zinc-500">Compare your historical trend against the CFO safe-spend plan.</p>
        </div>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={projectionData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4e4e7" />
              <XAxis 
                dataKey="date" 
                tick={{fontSize: 12, fill: "#71717a"}} 
                tickMargin={10} 
                axisLine={false}
                tickLine={false}
                tickFormatter={(val) => {
                  const d = new Date(val);
                  return `${d.getMonth() + 1}/${d.getDate()}`;
                }}
              />
              <YAxis 
                tick={{fontSize: 12, fill: "#71717a"}} 
                axisLine={false}
                tickLine={false}
                tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`} 
              />
              <Tooltip 
                formatter={(value, name) => [
                  formatCurrency(Number(value ?? 0)),
                  name === "safeSpendProjectedBalance" ? "Safe-spend plan" : "Historical trend",
                ]}
                labelFormatter={(label) => new Date(label).toLocaleDateString()}
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="3 3" />
              <Line 
                type="monotone" 
                dataKey="projectedBalance" 
                stroke="#10b981" 
                strokeWidth={3} 
                dot={{ r: 3, fill: "#10b981", strokeWidth: 0 }} 
                activeDot={{ r: 6, fill: "#10b981", strokeWidth: 0 }}
              />
              <Line 
                type="monotone" 
                dataKey="safeSpendProjectedBalance" 
                stroke="#2563eb" 
                strokeWidth={3} 
                strokeDasharray="6 4"
                dot={{ r: 3, fill: "#2563eb", strokeWidth: 0 }} 
                activeDot={{ r: 6, fill: "#2563eb", strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-zinc-500 text-center">
          * Historical trend uses past net daily flow. Safe-spend plan holds variable spending to the CFO daily number.
        </p>
      </div>
    </div>
  );
}
