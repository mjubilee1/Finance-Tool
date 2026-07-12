"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { formatCurrency } from "@/lib/format";
import { DateTime } from "luxon";
import { DEFAULT_DISCRETIONARY_DAILY } from "@/lib/daily-brief";

function fetchProjections(excludeDebt: boolean) {
  return fetch(`/api/projections?excludeDebt=${excludeDebt}`).then((res) => res.json());
}

type SafeSpendScenario = {
  safeDailySpend: number;
  dailyIncomeAssumption: number;
};

export function Projections() {
  const [includeDebt, setIncludeDebt] = useState(false);
  const [dailySpendOverride, setDailySpendOverride] = useState<number | null>(null);
  const excludeDebt = !includeDebt;

  const { data, isLoading } = useQuery({
    queryKey: ["projections", excludeDebt],
    queryFn: () => fetchProjections(excludeDebt),
  });

  const metrics = data?.metrics as
    | {
        daysAnalyzed: number;
        dailyAverageSpend: number;
        dailyAverageIncome: number;
        netDailyAverage: number;
        currentTotalBalance: number;
        cashBreakdown?: Array<{ name: string; available: number; current: number }>;
      }
    | undefined;

  const safeSpendScenario = data?.safeSpendScenario as SafeSpendScenario | undefined;
  const foodFunTarget = safeSpendScenario?.safeDailySpend ?? DEFAULT_DISCRETIONARY_DAILY;

  // Slider = TOTAL daily spend (bills + gas + food + everything), not the $40 food/fun target.
  const currentTotalSpend = metrics?.dailyAverageSpend ?? 0;
  const dailyIncome = metrics?.dailyAverageIncome ?? 0;
  const currentNet = metrics?.netDailyAverage ?? 0;
  const activeTotalSpend = dailySpendOverride ?? currentTotalSpend;
  const plannedNetDaily = dailyIncome - activeTotalSpend;
  const spendDeltaVsToday = currentTotalSpend - activeTotalSpend;

  const whatIfScenario = useMemo(() => {
    if (!metrics) {
      return {
        balanceIn30Days: 0,
        balanceIn90Days: 0,
        balanceIn180Days: 0,
        balanceIfUnchanged180: 0,
        monthlySpend: 0,
        projectionData: [] as Array<{
          date: string;
          projectedBalance: number;
          whatIfBalance: number;
        }>,
      };
    }

    const balance = metrics.currentTotalBalance;
    const project = (days: number, net: number) => balance + net * days;
    const chartData = [];
    const today = DateTime.now();

    for (let i = 0; i <= 180; i += 15) {
      const projDate = today.plus({ days: i });
      chartData.push({
        date: projDate.toISODate() ?? "",
        projectedBalance: project(i, metrics.netDailyAverage),
        whatIfBalance: project(i, plannedNetDaily),
      });
    }

    return {
      balanceIn30Days: project(30, plannedNetDaily),
      balanceIn90Days: project(90, plannedNetDaily),
      balanceIn180Days: project(180, plannedNetDaily),
      balanceIfUnchanged180: project(180, metrics.netDailyAverage),
      monthlySpend: activeTotalSpend * 30,
      projectionData: chartData,
    };
  }, [metrics, plannedNetDaily, activeTotalSpend]);

  if (isLoading) {
    return (
      <div className="p-8 text-center animate-pulse">
        <div className="h-6 w-48 bg-[color-mix(in_srgb,var(--ink)_12%,transparent)] rounded-lg mx-auto mb-4" />
        <div className="h-4 w-32 bg-[color-mix(in_srgb,var(--ink)_10%,transparent)] rounded-lg mx-auto mb-8" />
        <div className="h-64 bg-[color-mix(in_srgb,var(--ink)_6%,transparent)] rounded-xl" />
      </div>
    );
  }

  if (!data || data.error || !metrics) {
    return null;
  }

  const sliderMin = Math.max(20, Math.round(currentTotalSpend * 0.5));
  const sliderMax = Math.round(currentTotalSpend * 1.4 + 40);
  const sixMonthGain = whatIfScenario.balanceIn180Days - metrics.currentTotalBalance;
  const vsStayTheCourse =
    whatIfScenario.balanceIn180Days - whatIfScenario.balanceIfUnchanged180;

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h2 className="text-xl font-semibold text-[var(--ink)] tracking-tight">
            What happens to your cash if nothing big changes?
          </h2>
          <p className="text-sm text-[var(--ink-soft)] mt-2 leading-relaxed">
            This is a rough sketch from the last {Math.round(metrics.daysAnalyzed)} days — not a
            promise. It helps you see: keep today&apos;s pace, or spend a little less overall, and
            where your bank balance might land.
          </p>
        </div>

        <label className="flex items-center space-x-3 bg-[color-mix(in_srgb,var(--ink)_5%,transparent)] p-2.5 rounded-xl ring-1 ring-[var(--card-border)] cursor-pointer shrink-0">
          <div className="relative">
            <input
              type="checkbox"
              className="sr-only"
              checked={includeDebt}
              onChange={(e) => setIncludeDebt(e.target.checked)}
            />
            <div
              className={`block w-10 h-6 rounded-full transition-colors ${
                includeDebt ? "bg-[var(--accent)]" : "bg-[color-mix(in_srgb,var(--ink)_25%,transparent)]"
              }`}
            />
            <div
              className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform shadow-sm ${
                includeDebt ? "translate-x-4" : ""
              }`}
            />
          </div>
          <span className="text-sm font-medium text-[var(--ink)]">Count credit card debt too</span>
        </label>
      </div>

      <div className="app-card p-5 space-y-3">
        <p className="app-label">Where you are now</p>
        <p className="text-[var(--ink)] leading-relaxed">
          On a typical day you bring in about{" "}
          <span className="font-semibold tabular-nums">{formatCurrency(dailyIncome)}</span> and
          spend about{" "}
          <span className="font-semibold tabular-nums">{formatCurrency(currentTotalSpend)}</span>{" "}
          on <span className="font-medium">everything</span> (bills, gas, food, fun — all of it).
          That leaves about{" "}
          <span
            className={`font-semibold tabular-nums ${
              currentNet >= 0 ? "text-[var(--accent-strong)]" : "text-rose-600"
            }`}
          >
            {formatCurrency(currentNet)}
          </span>{" "}
          {currentNet >= 0 ? "staying in your accounts" : "coming out of your accounts"} each day.
          You currently have about{" "}
          <span className="font-semibold tabular-nums">
            {formatCurrency(metrics.currentTotalBalance)}
          </span>{" "}
          {includeDebt ? "after counting debt" : "available in linked checking/savings"}.
        </p>
        <p className="text-sm text-[var(--ink-soft)] leading-relaxed">
          Separate idea: food and fun alone should usually land near{" "}
          <span className="font-medium text-[var(--ink)]">
            {formatCurrency(foodFunTarget)}/day
          </span>
          . That is <span className="font-medium text-[var(--ink)]">not</span> your whole budget —
          mortgage, utilities, gas, and Lyft sit outside it.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: "Comes in / day",
            hint: "Paycheck, rent, Lyft…",
            value: dailyIncome,
            className: "text-[var(--accent-strong)]",
          },
          {
            label: "Goes out / day",
            hint: "All spending together",
            value: currentTotalSpend,
            className: "text-[var(--ink)]",
          },
          {
            label: "Left over / day",
            hint: currentNet >= 0 ? "Breathing room" : "Running behind",
            value: currentNet,
            className: currentNet >= 0 ? "text-[var(--accent-strong)]" : "text-rose-600",
          },
          {
            label: "Cash you can use",
            hint: includeDebt ? "Cash minus debts (scary)" : "Checking + savings available",
            value: metrics.currentTotalBalance,
            className: "text-[var(--ink)]",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl bg-[color-mix(in_srgb,var(--ink)_5%,transparent)] p-4 ring-1 ring-[var(--card-border)]"
          >
            <p className="app-label mb-1">{stat.label}</p>
            <p className={`text-xl font-bold tabular-nums tracking-tight ${stat.className}`}>
              {formatCurrency(stat.value)}
            </p>
            <p className="text-[11px] text-[var(--ink-soft)] mt-1">{stat.hint}</p>
          </div>
        ))}
      </div>

      {metrics.cashBreakdown && metrics.cashBreakdown.length > 0 && !includeDebt ? (
        <div className="rounded-xl bg-[color-mix(in_srgb,var(--ink)_4%,transparent)] p-4 ring-1 ring-[var(--card-border)] text-sm text-[var(--ink-soft)] leading-relaxed">
          <p className="font-medium text-[var(--ink)] mb-2">Where that cash number comes from</p>
          <ul className="space-y-1">
            {metrics.cashBreakdown.map((account) => (
              <li key={account.name} className="flex justify-between gap-3 tabular-nums">
                <span className="truncate">{account.name}</span>
                <span className="text-[var(--ink)] shrink-0">
                  {formatCurrency(account.available)}
                  {Math.abs(account.available - account.current) > 1 ? (
                    <span className="text-[var(--ink-soft)]">
                      {" "}
                      (bank shows {formatCurrency(account.current)} current)
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs">
            We use <span className="font-medium text-[var(--ink)]">available</span> balance (what you
            can spend), which can be lower than the bank&apos;s &quot;current&quot; number when
            charges are pending.
          </p>
        </div>
      ) : null}

      <div className="app-hero-gradient app-card-elevated p-6 space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="app-label text-[var(--accent-strong)] mb-2">Try a different pace</p>
            <h3 className="text-xl font-bold text-[var(--ink)] tracking-tight">
              What if total spending averaged {formatCurrency(activeTotalSpend)}/day?
            </h3>
            <p className="mt-2 text-sm text-[var(--ink-soft)] max-w-2xl leading-relaxed">
              Drag to raise or lower <span className="font-medium text-[var(--ink)]">all</span>{" "}
              daily spending — not just food/fun. Right now you average about{" "}
              {formatCurrency(currentTotalSpend)}/day out the door.
            </p>
          </div>
          <div
            className={`rounded-xl px-4 py-3 text-right ring-1 ${
              plannedNetDaily >= 0
                ? "bg-[var(--accent-soft)] ring-[color-mix(in_srgb,var(--accent)_28%,transparent)]"
                : "bg-amber-50/80 ring-amber-200/60"
            }`}
          >
            <p className="app-label mb-0.5">Left over each day</p>
            <p
              className={`text-2xl font-bold tabular-nums ${
                plannedNetDaily >= 0 ? "text-[var(--accent-strong)]" : "text-amber-800"
              }`}
            >
              {formatCurrency(plannedNetDaily)}
            </p>
            <p className="text-[11px] text-[var(--ink-soft)] mt-1">
              {spendDeltaVsToday === 0
                ? "Same as today"
                : spendDeltaVsToday > 0
                  ? `${formatCurrency(spendDeltaVsToday)} less spent / day`
                  : `${formatCurrency(Math.abs(spendDeltaVsToday))} more spent / day`}
            </p>
          </div>
        </div>

        <div className="rounded-xl bg-[color-mix(in_srgb,var(--surface)_90%,transparent)] p-4 ring-1 ring-[var(--card-border)]">
          <div className="flex justify-between text-sm text-[var(--ink-soft)] mb-2 tabular-nums">
            <span>{formatCurrency(sliderMin)}/day</span>
            <span className="font-semibold text-[var(--ink)]">
              {formatCurrency(activeTotalSpend)}/day total
            </span>
            <span>{formatCurrency(sliderMax)}/day</span>
          </div>
          <input
            type="range"
            min={sliderMin}
            max={sliderMax}
            step={1}
            value={Math.round(activeTotalSpend)}
            onChange={(e) => setDailySpendOverride(Number(e.target.value))}
            className="w-full accent-[var(--accent)]"
          />
          {dailySpendOverride !== null && (
            <button
              type="button"
              onClick={() => setDailySpendOverride(null)}
              className="mt-2 text-xs font-semibold text-[var(--accent-strong)] hover:opacity-80"
            >
              Reset to your current average ({formatCurrency(currentTotalSpend)}/day)
            </button>
          )}
        </div>

        <div className="rounded-xl bg-[color-mix(in_srgb,var(--ink)_4%,transparent)] p-4 ring-1 ring-[var(--card-border)] text-sm text-[var(--ink)] leading-relaxed">
          <p className="font-medium mb-1">What this means for your life</p>
          {plannedNetDaily >= 0 ? (
            <p>
              At this pace, in about 6 months you might have around{" "}
              <span className="font-semibold tabular-nums">
                {formatCurrency(whatIfScenario.balanceIn180Days)}
              </span>{" "}
              — roughly{" "}
              <span className="font-semibold tabular-nums">{formatCurrency(sixMonthGain)}</span>{" "}
              {sixMonthGain >= 0 ? "more" : "less"} than today.
              {vsStayTheCourse !== 0 ? (
                <>
                  {" "}
                  Versus staying exactly as you are now, that&apos;s about{" "}
                  <span className="font-semibold tabular-nums">
                    {vsStayTheCourse >= 0 ? "+" : ""}
                    {formatCurrency(vsStayTheCourse)}
                  </span>{" "}
                  by then.
                </>
              ) : null}{" "}
              More cash usually means less stress when rent is late, a bill hits, or you want a
              planned fun day without swiping panic.
            </p>
          ) : (
            <p>
              At this pace you&apos;d still be draining accounts by about{" "}
              <span className="font-semibold tabular-nums text-rose-600">
                {formatCurrency(Math.abs(plannedNetDaily))}
              </span>
              /day. In 6 months the sketch lands near{" "}
              <span className="font-semibold tabular-nums">
                {formatCurrency(whatIfScenario.balanceIn180Days)}
              </span>
              . Pull total spend down (or grow income) before treating big purchases as fine.
            </p>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {[
            {
              label: "In 1 month",
              value: whatIfScenario.balanceIn30Days,
              hint: "Near-term cushion",
            },
            {
              label: "In 3 months",
              value: whatIfScenario.balanceIn90Days,
              hint: "A season from now",
            },
            {
              label: "In 6 months",
              value: whatIfScenario.balanceIn180Days,
              hint: "Half a year out",
            },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-xl bg-[color-mix(in_srgb,var(--surface)_85%,transparent)] p-4 ring-1 ring-[var(--card-border)]"
            >
              <p className="app-label mb-1">{item.label}</p>
              <p className="text-xl font-bold tabular-nums text-[var(--ink)]">
                {formatCurrency(item.value)}
              </p>
              <p className="text-[11px] text-[var(--ink-soft)] mt-1">{item.hint}</p>
            </div>
          ))}
        </div>

        <p className="text-xs text-[var(--ink-soft)] leading-relaxed">
          Rough math only: assumes income stays near {formatCurrency(dailyIncome)}/day and total
          spending stays near {formatCurrency(activeTotalSpend)}/day (
          {formatCurrency(whatIfScenario.monthlySpend)}/month). Real life has blowout weekends,
          late rent, and interest — so treat this as a compass, not a guarantee.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <h3 className="font-semibold text-[var(--ink)]">Picture of the next 6 months</h3>
          <p className="text-sm text-[var(--ink-soft)]">
            Solid line = keep today&apos;s pace. Dashed line = the slider plan above.
          </p>
        </div>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={whatIfScenario.projectionData}
              margin={{ top: 5, right: 5, bottom: 5, left: 5 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="color-mix(in srgb, var(--ink) 12%, transparent)"
              />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12, fill: "var(--ink-soft)" }}
                tickMargin={10}
                axisLine={false}
                tickLine={false}
                tickFormatter={(val) => {
                  const d = new Date(val);
                  return `${d.getMonth() + 1}/${d.getDate()}`;
                }}
              />
              <YAxis
                tick={{ fontSize: 12, fill: "var(--ink-soft)" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`}
              />
              <Tooltip
                formatter={(value, name) => [
                  formatCurrency(Number(value ?? 0)),
                  name === "whatIfBalance" ? "Your slider plan" : "If nothing changes",
                ]}
                labelFormatter={(label) => new Date(label).toLocaleDateString()}
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid var(--card-border)",
                  background: "var(--surface)",
                  color: "var(--ink)",
                }}
              />
              <ReferenceLine y={0} stroke="#f87171" strokeDasharray="3 3" />
              <Line
                type="monotone"
                dataKey="projectedBalance"
                stroke="var(--accent)"
                strokeWidth={2.5}
                dot={{ r: 3, fill: "var(--accent)", strokeWidth: 0 }}
                activeDot={{ r: 5, fill: "var(--accent)", strokeWidth: 0 }}
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
      </div>
    </div>
  );
}
