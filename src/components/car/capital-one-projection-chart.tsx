"use client";

import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency } from "@/lib/format";
import { CAR_FUNDED_BY } from "@/lib/car";

type CapOneProjectionResponse = {
  linked?: boolean;
  error?: string;
  metrics?: {
    currentBalance: number;
    accountBreakdown: Array<{ name: string; balance: number }>;
    daysAnalyzed: number;
    lyftIncome: number;
    lyftDailyAverage: number;
    dailyAverageIncome: number;
    dailyAverageSpend: number;
    observedNetDaily: number;
    monthlyCarFloor: number;
    carFloorDaily: number;
    netAfterCarFloorDaily: number;
    paymentMonthly: number;
    insuranceMonthly: number;
  };
  milestones?: {
    balanceIn180Days: number;
    afterCarFloorIn180Days: number;
  };
  projectionData?: Array<{
    date: string;
    projectedBalance: number;
    afterCarFloorBalance: number;
  }>;
};

async function fetchCapOneProjection(): Promise<CapOneProjectionResponse> {
  const res = await fetch("/api/car/projection");
  const data = (await res.json().catch(() => ({}))) as CapOneProjectionResponse;
  if (!res.ok && !data.error) {
    throw new Error("Failed to load Capital One projection");
  }
  return data;
}

export function CapitalOneProjectionChart() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["car-capital-one-projection"],
    queryFn: fetchCapOneProjection,
  });

  if (isLoading) {
    return (
      <div className="app-card p-6 animate-pulse space-y-3">
        <div className="h-4 w-40 rounded bg-[color-mix(in_srgb,var(--ink)_12%,transparent)]" />
        <div className="h-48 rounded-xl bg-[color-mix(in_srgb,var(--ink)_6%,transparent)]" />
      </div>
    );
  }

  if (error || !data || data.error || !data.metrics || !data.projectionData) {
    return (
      <div className="app-card p-5 text-sm text-[var(--muted)]">
        {data?.error ??
          (error instanceof Error
            ? error.message
            : `Link ${CAR_FUNDED_BY} to project this account’s cash flow.`)}
      </div>
    );
  }

  const { metrics, milestones, projectionData } = data;
  const netPositive = metrics.observedNetDaily >= 0;

  return (
    <div className="app-card p-5 space-y-5">
      <div>
        <p className="app-label mb-1">{CAR_FUNDED_BY} growth</p>
        <h2 className="text-lg font-semibold text-[var(--ink)] tracking-tight">
          How this account grows with Lyft + bills
        </h2>
        <p className="text-sm text-[var(--muted)] mt-1 leading-relaxed">
          Uses only {CAR_FUNDED_BY} checking/savings cash flow from the last{" "}
          {metrics.daysAnalyzed} days — Lyft deposits, transfers in, and spend — then reserves your
          car payment + insurance floor ({formatCurrency(metrics.monthlyCarFloor)}/mo).
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: "Cap One cash",
            value: metrics.currentBalance,
            hint: "Checking + savings",
          },
          {
            label: "Lyft in / day",
            value: metrics.lyftDailyAverage,
            hint: `${formatCurrency(metrics.lyftIncome)} in window`,
          },
          {
            label: "Car floor / mo",
            value: metrics.monthlyCarFloor,
            hint: `${formatCurrency(metrics.paymentMonthly)} + ${formatCurrency(metrics.insuranceMonthly)}`,
          },
          {
            label: "Net / day",
            value: metrics.observedNetDaily,
            hint: netPositive ? "Before reserving car floor" : "Running behind",
            danger: !netPositive,
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl bg-[color-mix(in_srgb,var(--ink)_5%,transparent)] p-3 ring-1 ring-[var(--card-border)]"
          >
            <p className="app-label mb-1">{stat.label}</p>
            <p
              className={`text-lg font-bold tabular-nums ${
                stat.danger ? "text-rose-600" : "text-[var(--ink)]"
              }`}
            >
              {formatCurrency(stat.value)}
            </p>
            <p className="text-[11px] text-[var(--muted)] mt-1">{stat.hint}</p>
          </div>
        ))}
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={projectionData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="color-mix(in srgb, var(--ink) 12%, transparent)" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: "var(--muted)" }}
              tickFormatter={(value: string) => value.slice(5)}
              minTickGap={24}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--muted)" }}
              tickFormatter={(value: number) => `$${Math.round(value / 100) * 100}`}
              width={56}
            />
            <Tooltip
              formatter={(value) => formatCurrency(typeof value === "number" ? value : Number(value) || 0)}
              labelFormatter={(label) => String(label)}
              contentStyle={{
                borderRadius: 12,
                border: "1px solid var(--card-border)",
                background: "var(--card-bg, #111)",
              }}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="projectedBalance"
              name="At recent pace"
              stroke="var(--accent)"
              strokeWidth={2.5}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="afterCarFloorBalance"
              name="After car floor"
              stroke="var(--muted)"
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {milestones ? (
        <p className="text-sm text-[var(--ink-soft)] leading-relaxed">
          In ~6 months at the recent Cap One pace: about{" "}
          <span className="font-semibold tabular-nums text-[var(--ink)]">
            {formatCurrency(milestones.balanceIn180Days)}
          </span>
          . After always reserving the car floor: about{" "}
          <span className="font-semibold tabular-nums text-[var(--ink)]">
            {formatCurrency(milestones.afterCarFloorIn180Days)}
          </span>
          . Surplus after the floor (~
          {formatCurrency(metrics.netAfterCarFloorDaily)}
          /day) is what can fund goals/fun on Cap One.
        </p>
      ) : null}

      {metrics.accountBreakdown.length > 0 ? (
        <ul className="text-xs text-[var(--muted)] space-y-1 border-t border-[var(--card-border)] pt-3">
          {metrics.accountBreakdown.map((account) => (
            <li key={account.name} className="flex justify-between gap-3 tabular-nums">
              <span className="truncate">{account.name}</span>
              <span className="text-[var(--ink)] shrink-0">{formatCurrency(account.balance)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
