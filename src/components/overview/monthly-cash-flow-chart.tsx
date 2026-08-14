"use client";

import { useState } from "react";
import { formatCurrency } from "@/lib/format";
import type {
  MonthlyCashFlowByChecking,
  MonthlyCashFlowPoint,
  MonthlyCashFlowScope,
} from "@/lib/cash-flow";
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
  byChecking?: MonthlyCashFlowByChecking | null;
};

const SCOPE_LABELS: Record<MonthlyCashFlowScope, string> = {
  all: "All",
  chase: "Chase",
  capital_one: "Cap One",
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

  const pendingIncome = point.pendingIncome ?? 0;
  const pendingSpent = point.pendingSpent ?? 0;
  const hasPending = pendingIncome > 0.005 || pendingSpent > 0.005;

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
        {hasPending ? (
          <div className="flex justify-between gap-4 text-[var(--ink-soft)]">
            <span>Pending in totals</span>
            <span className="tabular-nums">
              {pendingSpent > 0.005 ? `${formatCurrency(pendingSpent)} out` : null}
              {pendingSpent > 0.005 && pendingIncome > 0.005 ? " · " : null}
              {pendingIncome > 0.005 ? `${formatCurrency(pendingIncome)} in` : null}
            </span>
          </div>
        ) : null}
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

function seriesForScope(
  scope: MonthlyCashFlowScope,
  months: MonthlyCashFlowPoint[],
  byChecking?: MonthlyCashFlowByChecking | null,
): MonthlyCashFlowPoint[] {
  if (!byChecking) return months;
  if (scope === "chase") return byChecking.chase;
  if (scope === "capital_one") return byChecking.capitalOne;
  return byChecking.all.length > 0 ? byChecking.all : months;
}

export function MonthlyCashFlowChart({ months, byChecking = null }: Props) {
  const availableScopes = byChecking?.availableScopes ?? (["all"] as MonthlyCashFlowScope[]);
  const showScopeTabs = availableScopes.length > 1;
  const [scope, setScope] = useState<MonthlyCashFlowScope>("all");
  const activeScope = availableScopes.includes(scope) ? scope : "all";
  const chartMonths = seriesForScope(activeScope, months, byChecking);

  if (!chartMonths.length) return null;

  const currentMonth =
    chartMonths.find((month) => month.isCurrentMonth) ?? chartMonths[chartMonths.length - 1];
  const lastCompleteMonth = [...chartMonths].reverse().find((month) => !month.isPartial) ?? null;
  const priorMonth =
    lastCompleteMonth != null
      ? chartMonths[chartMonths.indexOf(lastCompleteMonth) - 1] ?? null
      : chartMonths.length > 1
        ? chartMonths[chartMonths.length - 2]
        : null;

  const monthOverMonthDelta =
    lastCompleteMonth && priorMonth ? lastCompleteMonth.net - priorMonth.net : null;

  const headline = currentMonth.isPartial
    ? {
        label: `${currentMonth.label} so far`,
        net: currentMonth.net,
        sub:
          lastCompleteMonth != null
            ? `${lastCompleteMonth.label} closed at ${formatSignedCurrency(lastCompleteMonth.net)}`
            : null,
      }
    : {
        label: `${currentMonth.label} net`,
        net: currentMonth.net,
        sub:
          monthOverMonthDelta != null
            ? `${monthOverMonthDelta >= 0 ? "Up" : "Down"} ${formatCurrency(Math.abs(monthOverMonthDelta))} vs prior month`
            : null,
      };

  const scopeHint =
    activeScope === "chase"
      ? "Chase checking only — paycheck account."
      : activeScope === "capital_one"
        ? "Capital One checking only — car + goals bucket."
        : showScopeTabs
          ? "Combined across primary accounts. Switch banks for a real split."
          : null;

  // Side-by-side snapshot for current + last closed when viewing All with both banks.
  const showBankSnapshot =
    activeScope === "all" &&
    Boolean(byChecking) &&
    availableScopes.includes("chase") &&
    availableScopes.includes("capital_one") &&
    lastCompleteMonth != null;

  const chaseClosed = byChecking?.chase.find((m) => m.month === lastCompleteMonth?.month);
  const capOneClosed = byChecking?.capitalOne.find((m) => m.month === lastCompleteMonth?.month);
  const chaseCurrent = byChecking?.chase.find((m) => m.isCurrentMonth);
  const capOneCurrent = byChecking?.capitalOne.find((m) => m.isCurrentMonth);

  return (
    <div className="app-card p-6 space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="app-label mb-1">Actual results</p>
          <h2 className="text-lg font-semibold text-[var(--ink)] tracking-tight">
            Month over month
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)] leading-relaxed">
            What really hit the bank — income minus spending by post date. A bill that clears Aug
            1 counts in August, even if it feels like a July bill.
          </p>
        </div>
        <div
          className={`rounded-xl px-4 py-3 ring-1 shrink-0 ${
            headline.net >= 0
              ? "bg-[var(--accent-soft)] ring-[color-mix(in_srgb,var(--accent)_28%,transparent)]"
              : "bg-rose-500/10 ring-rose-400/30"
          }`}
        >
          <p className="app-label mb-0.5">{headline.label}</p>
          <p
            className={`text-xl font-bold tabular-nums ${
              headline.net >= 0 ? "text-[var(--accent-strong)]" : "text-rose-600"
            }`}
          >
            {formatSignedCurrency(headline.net)}
          </p>
          {headline.sub ? (
            <p className="text-[11px] text-[var(--ink-soft)] mt-1">{headline.sub}</p>
          ) : null}
          {currentMonth.isPartial && monthOverMonthDelta != null && lastCompleteMonth && priorMonth ? (
            <p className="text-[11px] text-[var(--ink-soft)] mt-0.5">
              {lastCompleteMonth.label} was {monthOverMonthDelta >= 0 ? "up" : "down"}{" "}
              {formatCurrency(Math.abs(monthOverMonthDelta))} vs {priorMonth.label}
            </p>
          ) : null}
        </div>
      </div>

      {showScopeTabs ? (
        <div
          className="flex gap-1 rounded-lg p-1 ring-1 ring-[var(--card-border)] bg-[color-mix(in_srgb,var(--ink)_4%,transparent)]"
          role="tablist"
          aria-label="Cash flow by checking account"
        >
          {availableScopes.map((key) => {
            const selected = activeScope === key;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setScope(key)}
                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  selected
                    ? "bg-[var(--card-solid)] text-[var(--ink)] shadow-sm ring-1 ring-[var(--card-border)]"
                    : "text-[var(--muted)] hover:text-[var(--ink)]"
                }`}
              >
                {SCOPE_LABELS[key]}
              </button>
            );
          })}
        </div>
      ) : null}

      {scopeHint ? (
        <p className="text-[11px] text-[var(--muted)] -mt-2">{scopeHint}</p>
      ) : null}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          {
            label: "This month so far",
            income: currentMonth.income,
            spent: currentMonth.spent,
            net: currentMonth.net,
            partial: currentMonth.isPartial,
            pendingIncome: currentMonth.pendingIncome ?? 0,
            pendingSpent: currentMonth.pendingSpent ?? 0,
            asOfDate: currentMonth.asOfDate,
          },
          ...(lastCompleteMonth
            ? [
                {
                  label: `${lastCompleteMonth.label} (closed)`,
                  income: lastCompleteMonth.income,
                  spent: lastCompleteMonth.spent,
                  net: lastCompleteMonth.net,
                  partial: false,
                  pendingIncome: 0,
                  pendingSpent: 0,
                  asOfDate: undefined as string | undefined,
                },
              ]
            : []),
        ].map((row) => {
          const hasPending = row.pendingIncome > 0.005 || row.pendingSpent > 0.005;
          return (
          <div
            key={row.label}
            className="rounded-xl bg-[color-mix(in_srgb,var(--ink)_5%,transparent)] p-3 ring-1 ring-[var(--card-border)] sm:col-span-1 col-span-2 first:col-span-2 sm:first:col-span-1"
          >
            <p className="app-label mb-2">
              {row.label}
              {row.partial ? " · up to date" : ""}
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
              {row.partial ? (
                <p className="text-[10px] text-[var(--muted)] pt-1 leading-snug">
                  {hasPending
                    ? `Includes ${formatCurrency(row.pendingSpent)} pending out` +
                      (row.pendingIncome > 0.005
                        ? ` · ${formatCurrency(row.pendingIncome)} pending in`
                        : "") +
                      ". Live through today — Sync if a fresh bill is missing."
                    : "Live through today, including pending once the bank shows them. Sync if a fresh bill is missing."}
                </p>
              ) : null}
            </div>
          </div>
          );
        })}
      </div>

      {showBankSnapshot && chaseClosed && capOneClosed ? (
        <div className="grid grid-cols-2 gap-3">
          {[
            {
              bank: "Chase",
              closed: chaseClosed,
              current: chaseCurrent,
            },
            {
              bank: "Capital One",
              closed: capOneClosed,
              current: capOneCurrent,
            },
          ].map((row) => (
            <div
              key={row.bank}
              className="rounded-xl bg-[color-mix(in_srgb,var(--ink)_5%,transparent)] p-3 ring-1 ring-[var(--card-border)]"
            >
              <p className="app-label mb-2">{row.bank}</p>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="text-[var(--muted)]">{row.closed.label} net</span>
                  <span
                    className={`tabular-nums font-medium ${
                      row.closed.net >= 0 ? "text-[var(--accent-strong)]" : "text-rose-500"
                    }`}
                  >
                    {formatSignedCurrency(row.closed.net)}
                  </span>
                </div>
                {row.current ? (
                  <div className="flex justify-between gap-2">
                    <span className="text-[var(--muted)]">{row.current.label} so far</span>
                    <span
                      className={`tabular-nums ${
                        row.current.net >= 0 ? "text-[var(--accent-strong)]" : "text-rose-500"
                      }`}
                    >
                      {formatSignedCurrency(row.current.net)}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartMonths} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
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
              {chartMonths.map((month) => (
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
        this month live through today (pending included). Bills land in the month they clear — so a
        late July obligation that posts Aug 1 makes July look stronger and August heavier.
        {showScopeTabs
          ? " Use Chase / Cap One to see each checking account on its own."
          : ""}
      </p>
    </div>
  );
}
