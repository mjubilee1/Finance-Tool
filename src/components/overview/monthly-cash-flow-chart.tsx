"use client";

import { formatCurrency } from "@/lib/format";
import type { MonthlyCashFlowPoint } from "@/lib/cash-flow";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Props = {
  months: MonthlyCashFlowPoint[];
};

function formatSignedCurrency(amount: number) {
  if (Math.abs(amount) < 0.01) return "$0";
  return `${amount > 0 ? "+" : "-"}${formatCurrency(Math.abs(amount))}`;
}

function MonthlyTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ payload?: MonthlyCashFlowPoint }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div
      className="rounded-xl px-3 py-2.5 text-sm shadow-lg"
      style={{
        border: "1px solid var(--card-border)",
        background: "var(--card-solid)",
        color: "var(--ink)",
      }}
    >
      <p className="font-semibold mb-2">
        {label}
        {point.isPartial ? " (in progress)" : ""}
      </p>
      <div className="space-y-1 text-xs">
        <div className="flex justify-between gap-4">
          <span className="text-[var(--ink-soft)]">Income</span>
          <span className="tabular-nums text-[var(--accent-strong)]">{formatCurrency(point.income)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-[var(--ink-soft)]">Spent</span>
          <span className="tabular-nums">{formatCurrency(point.spent)}</span>
        </div>
        <div className="flex justify-between gap-4 border-t border-[var(--card-border)] pt-1 mt-1">
          <span className="font-medium">Net</span>
          <span
            className={`font-semibold tabular-nums ${
              point.net >= 0 ? "text-[var(--accent-strong)]" : "text-rose-500"
            }`}
          >
            {formatSignedCurrency(point.net)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function MonthlyCashFlowChart({ months }: Props) {
  if (!months.length) return null;

  const currentMonth = months.find((month) => month.isCurrentMonth) ?? months[months.length - 1];
  const lastCompleteMonth = [...months].reverse().find((month) => !month.isPartial) ?? null;
  const priorMonth =
    lastCompleteMonth != null
      ? months[months.indexOf(lastCompleteMonth) - 1] ?? null
      : months.length > 1
        ? months[months.length - 2]
        : null;

  const monthOverMonthDelta =
    lastCompleteMonth && priorMonth ? lastCompleteMonth.net - priorMonth.net : null;

  return (
    <div className="app-card p-6 space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="app-label mb-1">Actual results</p>
          <h2 className="text-lg font-semibold text-[var(--ink)] tracking-tight">
            Month over month
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)] leading-relaxed">
            What really posted — income minus spending each month. This is your history, not a
            projection.
          </p>
        </div>
        {lastCompleteMonth ? (
          <div
            className={`rounded-xl px-4 py-3 ring-1 shrink-0 ${
              lastCompleteMonth.net >= 0
                ? "bg-[var(--accent-soft)] ring-[color-mix(in_srgb,var(--accent)_28%,transparent)]"
                : "bg-rose-500/10 ring-rose-400/30"
            }`}
          >
            <p className="app-label mb-0.5">{lastCompleteMonth.label} net</p>
            <p
              className={`text-xl font-bold tabular-nums ${
                lastCompleteMonth.net >= 0 ? "text-[var(--accent-strong)]" : "text-rose-600"
              }`}
            >
              {formatSignedCurrency(lastCompleteMonth.net)}
            </p>
            {monthOverMonthDelta != null ? (
              <p className="text-[11px] text-[var(--ink-soft)] mt-1">
                {monthOverMonthDelta >= 0 ? "Up" : "Down"}{" "}
                {formatCurrency(Math.abs(monthOverMonthDelta))} vs prior month
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          {
            label: "This month so far",
            income: currentMonth.income,
            spent: currentMonth.spent,
            net: currentMonth.net,
            partial: currentMonth.isPartial,
          },
          ...(lastCompleteMonth
            ? [
                {
                  label: `${lastCompleteMonth.label} (closed)`,
                  income: lastCompleteMonth.income,
                  spent: lastCompleteMonth.spent,
                  net: lastCompleteMonth.net,
                  partial: false,
                },
              ]
            : []),
        ].map((row) => (
          <div
            key={row.label}
            className="rounded-xl bg-[color-mix(in_srgb,var(--ink)_5%,transparent)] p-3 ring-1 ring-[var(--card-border)] sm:col-span-1 col-span-2 first:col-span-2 sm:first:col-span-1"
          >
            <p className="app-label mb-2">
              {row.label}
              {row.partial ? " · partial" : ""}
            </p>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between gap-2">
                <span className="text-[var(--muted)]">In</span>
                <span className="tabular-nums text-[var(--accent-strong)]">
                  {formatCurrency(row.income)}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[var(--muted)]">Out</span>
                <span className="tabular-nums">{formatCurrency(row.spent)}</span>
              </div>
              <div className="flex justify-between gap-2 font-semibold pt-1 border-t border-[var(--card-border)]">
                <span>Net</span>
                <span
                  className={`tabular-nums ${
                    row.net >= 0 ? "text-[var(--accent-strong)]" : "text-rose-500"
                  }`}
                >
                  {formatSignedCurrency(row.net)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={months} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.25)" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 12, fill: "var(--muted)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 12, fill: "var(--muted)" }}
              tickFormatter={(val) => `$${Math.round(val / 1000)}k`}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<MonthlyTooltip />} />
            <ReferenceLine y={0} stroke="var(--card-border)" />
            <Bar dataKey="net" radius={[6, 6, 0, 0]} maxBarSize={48}>
              {months.map((month) => (
                <Cell
                  key={month.month}
                  fill={
                    month.isCurrentMonth
                      ? "color-mix(in srgb, var(--accent) 55%, transparent)"
                      : month.net >= 0
                        ? "var(--accent)"
                        : "#f87171"
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[11px] text-[var(--muted)] leading-relaxed">
        Green bars = you kept more than you spent that month. Red = you ran behind. The lighter bar is
        this month still in progress — compare it to closed months once the calendar turns.
      </p>
    </div>
  );
}
