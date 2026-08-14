"use client";

import { formatCurrency } from "@/lib/format";
import type { CashLadderPoint } from "@/lib/cash-flow";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Props = {
  months: CashLadderPoint[];
};

function formatSignedCurrency(amount: number) {
  if (Math.abs(amount) < 0.01) return "$0";
  return `${amount > 0 ? "+" : "-"}${formatCurrency(Math.abs(amount))}`;
}

function LadderTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ payload?: CashLadderPoint }>;
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
          <span className="tabular-nums text-[var(--accent-strong)]">
            {formatCurrency(point.income)}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-[var(--ink-soft)]">Spent</span>
          <span className="tabular-nums">{formatCurrency(point.spent)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-[var(--ink-soft)]">Month net</span>
          <span
            className={`font-semibold tabular-nums ${
              point.net >= 0 ? "text-[var(--accent-strong)]" : "text-rose-500"
            }`}
          >
            {formatSignedCurrency(point.net)}
          </span>
        </div>
        <div className="flex justify-between gap-4 border-t border-[var(--card-border)] pt-1 mt-1">
          <span className="font-medium">Ladder height</span>
          <span
            className={`font-semibold tabular-nums ${
              point.cumulativeNet >= 0 ? "text-[var(--accent-strong)]" : "text-rose-500"
            }`}
          >
            {formatSignedCurrency(point.cumulativeNet)}
          </span>
        </div>
      </div>
    </div>
  );
}

function ladderVerdict(months: CashLadderPoint[]) {
  const closed = months.filter((m) => !m.isPartial);
  const latest = months[months.length - 1];
  const ladderHeight = latest?.cumulativeNet ?? 0;
  const climbingMonths = closed.filter((m) => m.net > 0).length;
  const slippingMonths = closed.filter((m) => m.net < 0).length;

  const lastClosed = [...closed].reverse()[0] ?? null;
  const priorClosed =
    lastClosed != null ? closed[closed.indexOf(lastClosed) - 1] ?? null : null;
  const monthOverMonthDelta =
    lastClosed && priorClosed ? lastClosed.net - priorClosed.net : null;

  if (closed.length === 0 && latest) {
    return {
      status: latest.net >= 0 ? "climbing" : "slipping",
      title: latest.net >= 0 ? "Climbing so far this month" : "Behind so far this month",
      detail: `This month is still open at ${formatSignedCurrency(latest.net)}. Closed months will lock the ladder rungs.`,
      ladderHeight,
      monthOverMonthDelta,
    } as const;
  }

  if (ladderHeight > 0 && climbingMonths >= slippingMonths) {
    return {
      status: "climbing" as const,
      title: "You're climbing the ladder",
      detail:
        monthOverMonthDelta != null && lastClosed && priorClosed
          ? `${climbingMonths} of ${closed.length} closed months were net-positive. ${lastClosed.label} was ${
              monthOverMonthDelta >= 0 ? "up" : "down"
            } ${formatCurrency(Math.abs(monthOverMonthDelta))} vs ${priorClosed.label}.`
          : `${climbingMonths} of ${closed.length} closed months were net-positive — cash is stacking over this window.`,
      ladderHeight,
      monthOverMonthDelta,
    };
  }

  if (ladderHeight < 0 || slippingMonths > climbingMonths) {
    return {
      status: "slipping" as const,
      title: "Ladder has been slipping",
      detail:
        monthOverMonthDelta != null && lastClosed && priorClosed
          ? `Cumulative net is ${formatSignedCurrency(ladderHeight)}. ${lastClosed.label} was ${
              monthOverMonthDelta >= 0 ? "up" : "down"
            } ${formatCurrency(Math.abs(monthOverMonthDelta))} vs ${priorClosed.label} — offense needs a stronger month.`
          : `Cumulative net is ${formatSignedCurrency(ladderHeight)} across this window. Income growth or spend cuts rebuild the climb.`,
      ladderHeight,
      monthOverMonthDelta,
    };
  }

  return {
    status: "flat" as const,
    title: "Mostly flat month to month",
    detail: `Ladder height sits near ${formatSignedCurrency(ladderHeight)}. One strong closed month tips this back to climbing.`,
    ladderHeight,
    monthOverMonthDelta,
  };
}

export function CashLadderChart({ months }: Props) {
  if (!months.length) return null;

  const verdict = ladderVerdict(months);
  const statusTone =
    verdict.status === "climbing"
      ? "bg-[var(--accent-soft)] ring-[color-mix(in_srgb,var(--accent)_28%,transparent)]"
      : verdict.status === "slipping"
        ? "bg-rose-500/10 ring-rose-400/30"
        : "bg-[color-mix(in_srgb,var(--ink)_5%,transparent)] ring-[var(--card-border)]";

  return (
    <div className="app-card p-6 space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="app-label mb-1">Actual results</p>
          <h2 className="text-lg font-semibold text-[var(--ink)] tracking-tight">
            Cash ladder — month over month
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)] leading-relaxed max-w-xl">
            Bars = each month&apos;s net (in minus out). The line = how high the ladder has climbed
            over this window. This is history — not the forward projection sketch below.
          </p>
        </div>
        <div className={`rounded-xl px-4 py-3 ring-1 shrink-0 max-w-xs ${statusTone}`}>
          <p className="app-label mb-0.5">Ladder check</p>
          <p
            className={`text-base font-bold tracking-tight ${
              verdict.status === "climbing"
                ? "text-[var(--accent-strong)]"
                : verdict.status === "slipping"
                  ? "text-rose-600"
                  : "text-[var(--ink)]"
            }`}
          >
            {verdict.title}
          </p>
          <p className="text-[11px] text-[var(--ink-soft)] mt-1 leading-relaxed">
            Height:{" "}
            <span
              className={`font-semibold tabular-nums ${
                verdict.ladderHeight >= 0 ? "text-[var(--accent-strong)]" : "text-rose-600"
              }`}
            >
              {formatSignedCurrency(verdict.ladderHeight)}
            </span>
          </p>
          <p className="text-[11px] text-[var(--ink-soft)] mt-1 leading-relaxed">{verdict.detail}</p>
        </div>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={months} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.25)" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 12, fill: "var(--muted)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              yAxisId="net"
              tick={{ fontSize: 12, fill: "var(--muted)" }}
              tickFormatter={(val) => `$${Math.round(Number(val) / 1000)}k`}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              yAxisId="ladder"
              orientation="right"
              tick={{ fontSize: 12, fill: "var(--muted)" }}
              tickFormatter={(val) => `$${Math.round(Number(val) / 1000)}k`}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<LadderTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 12, color: "var(--ink-soft)" }}
              formatter={(value) => (value === "net" ? "Month net" : "Ladder height")}
            />
            <ReferenceLine yAxisId="net" y={0} stroke="var(--card-border)" />
            <Bar yAxisId="net" dataKey="net" name="net" radius={[6, 6, 0, 0]} maxBarSize={44}>
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
            <Line
              yAxisId="ladder"
              type="monotone"
              dataKey="cumulativeNet"
              name="cumulativeNet"
              stroke="#0f766e"
              strokeWidth={2.5}
              dot={{ r: 3.5, fill: "#0f766e", strokeWidth: 0 }}
              activeDot={{ r: 5, fill: "#0f766e", strokeWidth: 0 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="overflow-x-auto rounded-xl ring-1 ring-[var(--card-border)]">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="bg-[color-mix(in_srgb,var(--ink)_4%,transparent)] text-left text-[11px] uppercase tracking-wider text-[var(--muted)]">
              <th className="px-3 py-2.5 font-semibold">Month</th>
              <th className="px-3 py-2.5 font-semibold text-right">In</th>
              <th className="px-3 py-2.5 font-semibold text-right">Out</th>
              <th className="px-3 py-2.5 font-semibold text-right">Net</th>
              <th className="px-3 py-2.5 font-semibold text-right">Ladder</th>
            </tr>
          </thead>
          <tbody>
            {months.map((month) => (
              <tr
                key={month.month}
                className="border-t border-[var(--card-border)] text-[var(--ink)]"
              >
                <td className="px-3 py-2.5">
                  <span className="font-medium">{month.label}</span>
                  {month.isPartial ? (
                    <span className="ml-2 text-[11px] text-[var(--ink-soft)]">in progress</span>
                  ) : null}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-[var(--accent-strong)]">
                  {formatCurrency(month.income)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(month.spent)}</td>
                <td
                  className={`px-3 py-2.5 text-right tabular-nums font-semibold ${
                    month.net >= 0 ? "text-[var(--accent-strong)]" : "text-rose-500"
                  }`}
                >
                  {formatSignedCurrency(month.net)}
                </td>
                <td
                  className={`px-3 py-2.5 text-right tabular-nums font-semibold ${
                    month.cumulativeNet >= 0 ? "text-[var(--accent-strong)]" : "text-rose-500"
                  }`}
                >
                  {formatSignedCurrency(month.cumulativeNet)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-[var(--muted)] leading-relaxed">
        Green bars = you kept more than you spent that month. Red = you ran behind. The teal line is
        the ladder: each month&apos;s net stacks on the last. If the line trends up, you&apos;re
        climbing on a month-over-month basis.
      </p>
    </div>
  );
}
