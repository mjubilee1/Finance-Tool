"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { formatCurrency } from "@/lib/format";

function fetchProjections(excludeDebt: boolean) {
  return fetch(`/api/projections?excludeDebt=${excludeDebt}`).then((res) => res.json());
}

export function Projections() {
  const [excludeDebt, setExcludeDebt] = useState(false);

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

  const { metrics, projectionData } = data;

  return (
    <div className="bg-white border border-zinc-200 p-6 rounded-3xl space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-zinc-900">Financial Projections</h2>
          <p className="text-sm text-zinc-500">Based on {Math.round(metrics.daysAnalyzed)} days of history</p>
        </div>
        
        <label className="flex items-center space-x-3 bg-zinc-50 p-2.5 rounded-xl border border-zinc-200 cursor-pointer hover:bg-zinc-100 transition-colors">
          <div className="relative">
            <input 
              type="checkbox" 
              className="sr-only" 
              checked={excludeDebt}
              onChange={(e) => setExcludeDebt(e.target.checked)}
            />
            <div className={`block w-10 h-6 rounded-full transition-colors ${excludeDebt ? 'bg-emerald-500' : 'bg-zinc-300'}`}></div>
            <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${excludeDebt ? 'translate-x-4' : ''}`}></div>
          </div>
          <span className="text-sm font-medium text-zinc-700">
            Exclude Debt Accounts
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

      <div className="space-y-4">
        <h3 className="font-semibold text-zinc-900">6-Month Projection</h3>
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
                formatter={(value: number) => [formatCurrency(value), "Projected Balance"]}
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
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-zinc-500 text-center">
          * Projection assumes your historical daily average net flow continues.
        </p>
      </div>
    </div>
  );
}
