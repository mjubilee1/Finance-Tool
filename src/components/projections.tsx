"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { formatCurrency } from "@/lib/format";
import { DateTime } from "luxon";

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
  const [dailySpendOverride, setDailySpendOverride] = useState<number | null>(null);
  const excludeDebt = !includeDebt;

  const { data, isLoading } = useQuery({
    queryKey: ["projections", excludeDebt],
    queryFn: () => fetchProjections(excludeDebt),
  });

  const metrics = data?.metrics as {
    daysAnalyzed: number;
    dailyAverageSpend: number;
    dailyAverageIncome: number;
    netDailyAverage: number;
    currentTotalBalance: number;
  } | undefined;

  const safeSpendScenario = data?.safeSpendScenario as SafeSpendScenario | undefined;
  const baseSafeDaily = safeSpendScenario?.safeDailySpend ?? metrics?.dailyAverageSpend ?? 0;
  const activeDailySpend = dailySpendOverride ?? baseSafeDaily;
  const plannedNetDaily = (metrics?.dailyAverageIncome ?? 0) - activeDailySpend;

  const whatIfScenario = useMemo(() => {
    if (!metrics) {
      return {
        balanceIn30Days: 0,
        balanceIn90Days: 0,
        balanceIn180Days: 0,
        monthlySpend: 0,
        yearlyImpact: 0,
        projectionData: [],
      };
    }

    const balance = metrics.currentTotalBalance;
    const project = (days: number) => balance + plannedNetDaily * days;
    const chartData = [];
    const today = DateTime.now();

    for (let i = 0; i <= 180; i += 15) {
      const projDate = today.plus({ days: i });
      chartData.push({
        date: projDate.toISODate(),
        projectedBalance: balance + metrics.netDailyAverage * i,
        whatIfBalance: balance + plannedNetDaily * i,
      });
    }

    return {
      balanceIn30Days: project(30),
      balanceIn90Days: project(90),
      balanceIn180Days: project(180),
      monthlySpend: activeDailySpend * 30,
      yearlyImpact: (baseSafeDaily - activeDailySpend) * 365,
      projectionData: chartData,
    };
  }, [metrics, plannedNetDaily, activeDailySpend, baseSafeDaily]);

  if (isLoading) {
    return (
      <div className="p-8 text-center animate-pulse">
        <div className="h-6 w-48 bg-slate-200 rounded-lg mx-auto mb-4" />
        <div className="h-4 w-32 bg-slate-200 rounded-lg mx-auto mb-8" />
        <div className="h-64 bg-slate-100 rounded-xl" />
      </div>
    );
  }

  if (!data || data.error || !metrics) {
    return null;
  }

  const sliderMin = Math.max(0, Math.round(baseSafeDaily * 0.5));
  const sliderMax = Math.round(baseSafeDaily * 1.5 + 20);

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">Based on {Math.round(metrics.daysAnalyzed)} days of history</p>
        </div>

        <label className="flex items-center space-x-3 bg-slate-50 p-2.5 rounded-xl ring-1 ring-slate-200/60 cursor-pointer hover:bg-slate-100/80 transition-colors">
          <div className="relative">
            <input
              type="checkbox"
              className="sr-only"
              checked={includeDebt}
              onChange={(e) => setIncludeDebt(e.target.checked)}
            />
            <div className={`block w-10 h-6 rounded-full transition-colors ${includeDebt ? "bg-teal-500" : "bg-slate-300"}`} />
            <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform shadow-sm ${includeDebt ? "translate-x-4" : ""}`} />
          </div>
          <span className="text-sm font-medium text-slate-700">Include debt accounts</span>
        </label>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Daily avg spend", value: metrics.dailyAverageSpend, className: "text-slate-900" },
          { label: "Daily avg income", value: metrics.dailyAverageIncome, className: "text-teal-700" },
          {
            label: "Net daily",
            value: metrics.netDailyAverage,
            className: metrics.netDailyAverage >= 0 ? "text-teal-700" : "text-rose-600",
          },
          { label: "Current balance", value: metrics.currentTotalBalance, className: "text-slate-900" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl bg-slate-50/80 p-4 ring-1 ring-slate-200/50">
            <p className="app-label mb-1">{stat.label}</p>
            <p className={`text-xl font-bold tabular-nums tracking-tight ${stat.className}`}>
              {formatCurrency(stat.value)}
            </p>
          </div>
        ))}
      </div>

      {safeSpendScenario ? (
        <div className="app-hero-gradient app-card-elevated p-6 space-y-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="app-label text-teal-700 mb-2">What-if planner</p>
              <h3 className="text-xl font-bold text-slate-900 tracking-tight">
                If you spend {formatCurrency(activeDailySpend)}/day
              </h3>
              <p className="mt-2 text-sm text-slate-600 max-w-2xl leading-relaxed">
                CFO safe spend is {formatCurrency(baseSafeDaily)}/day. Drag the slider to see how daily choices change your month and year.
              </p>
            </div>
            <div className={`rounded-xl px-4 py-3 text-right ring-1 ${plannedNetDaily >= 0 ? "bg-teal-50 ring-teal-200/60" : "bg-amber-50 ring-amber-200/60"}`}>
              <p className="app-label mb-0.5">Planned net daily</p>
              <p className={`text-2xl font-bold tabular-nums ${plannedNetDaily >= 0 ? "text-teal-700" : "text-amber-700"}`}>
                {formatCurrency(plannedNetDaily)}
              </p>
            </div>
          </div>

          <div className="rounded-xl bg-white/90 p-4 ring-1 ring-slate-200/60">
            <div className="flex justify-between text-sm text-slate-500 mb-2 tabular-nums">
              <span>{formatCurrency(sliderMin)}/day</span>
              <span className="font-semibold text-slate-900">{formatCurrency(activeDailySpend)}/day</span>
              <span>{formatCurrency(sliderMax)}/day</span>
            </div>
            <input
              type="range"
              min={sliderMin}
              max={sliderMax}
              step={1}
              value={Math.round(activeDailySpend)}
              onChange={(e) => setDailySpendOverride(Number(e.target.value))}
              className="w-full"
            />
            {dailySpendOverride !== null && dailySpendOverride !== baseSafeDaily && (
              <button
                type="button"
                onClick={() => setDailySpendOverride(null)}
                className="mt-2 text-xs font-semibold text-teal-700 hover:text-teal-800"
              >
                Reset to CFO safe spend
              </button>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            {[
              { label: "30 days", value: whatIfScenario.balanceIn30Days },
              { label: "90 days", value: whatIfScenario.balanceIn90Days },
              { label: "6 months", value: whatIfScenario.balanceIn180Days },
              {
                label: "Yearly impact",
                value: whatIfScenario.yearlyImpact,
                signed: true,
                positive: whatIfScenario.yearlyImpact >= 0,
              },
            ].map((item) => (
              <div key={item.label} className="rounded-xl bg-white/80 p-4 ring-1 ring-slate-200/50">
                <p className="app-label mb-1">{item.label}</p>
                <p className={`text-xl font-bold tabular-nums ${item.signed ? (item.positive ? "text-teal-700" : "text-amber-700") : "text-slate-900"}`}>
                  {item.signed && item.positive ? "+" : ""}
                  {formatCurrency(item.value)}
                </p>
              </div>
            ))}
          </div>

          <p className="text-xs text-slate-500 leading-relaxed">
            Assumes daily income at {formatCurrency(safeSpendScenario.dailyIncomeAssumption)} and variable spend at{" "}
            {formatCurrency(activeDailySpend)}/day ({formatCurrency(whatIfScenario.monthlySpend)}/month).
          </p>
        </div>
      ) : null}

      <div className="space-y-4">
        <div>
          <h3 className="font-semibold text-slate-900">6-month projection</h3>
          <p className="text-sm text-slate-500">Historical trend vs your spending plan.</p>
        </div>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={whatIfScenario.projectionData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12, fill: "#64748b" }}
                tickMargin={10}
                axisLine={false}
                tickLine={false}
                tickFormatter={(val) => {
                  const d = new Date(val);
                  return `${d.getMonth() + 1}/${d.getDate()}`;
                }}
              />
              <YAxis
                tick={{ fontSize: 12, fill: "#64748b" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`}
              />
              <Tooltip
                formatter={(value, name) => [
                  formatCurrency(Number(value ?? 0)),
                  name === "whatIfBalance" || name === "safeSpendProjectedBalance"
                    ? "Your plan"
                    : "Historical trend",
                ]}
                labelFormatter={(label) => new Date(label).toLocaleDateString()}
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 4px 12px rgba(15,23,42,0.08)",
                }}
              />
              <ReferenceLine y={0} stroke="#f87171" strokeDasharray="3 3" />
              <Line
                type="monotone"
                dataKey="projectedBalance"
                stroke="#0d9488"
                strokeWidth={2.5}
                dot={{ r: 3, fill: "#0d9488", strokeWidth: 0 }}
                activeDot={{ r: 5, fill: "#0d9488", strokeWidth: 0 }}
              />
              <Line
                type="monotone"
                dataKey="whatIfBalance"
                stroke="#6366f1"
                strokeWidth={2.5}
                strokeDasharray="6 4"
                dot={{ r: 3, fill: "#6366f1", strokeWidth: 0 }}
                activeDot={{ r: 5, fill: "#6366f1", strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-slate-400 text-center">
          Historical trend uses past net daily flow. Your plan holds variable spending to the slider value.
        </p>
      </div>
    </div>
  );
}
