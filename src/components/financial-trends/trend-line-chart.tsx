"use client";

import { formatCurrency } from "@/lib/format";
import type { MonthlyTrendPoint, TrendsEvent } from "@/lib/financial-trends";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type SeriesKey = keyof MonthlyTrendPoint;

type Props = {
  title: string;
  subtitle?: string;
  points: MonthlyTrendPoint[];
  valueKey: SeriesKey;
  rollingKey?: SeriesKey;
  showRolling: boolean;
  onToggleRolling?: () => void;
  invertGood?: boolean;
  events?: TrendsEvent[];
  showEvents?: boolean;
  formatAsPercent?: boolean;
  secondaryKey?: SeriesKey;
  secondaryLabel?: string;
};

function formatValue(value: number, asPercent?: boolean) {
  if (asPercent) return `${Math.round(value)}%`;
  return formatCurrency(value);
}

function ChartTooltip({
  active,
  payload,
  label,
  formatAsPercent,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string }>;
  label?: string;
  formatAsPercent?: boolean;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-xl px-3 py-2.5 text-sm shadow-lg"
      style={{
        border: "1px solid var(--card-border)",
        background: "var(--card-solid)",
        color: "var(--ink)",
      }}
    >
      <p className="font-semibold mb-1.5">{label}</p>
      <div className="space-y-1 text-xs">
        {payload.map((entry) => (
          <div key={String(entry.name)} className="flex justify-between gap-4">
            <span className="text-[var(--ink-soft)]">{entry.name}</span>
            <span className="tabular-nums font-medium" style={{ color: entry.color }}>
              {formatValue(Number(entry.value ?? 0), formatAsPercent)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TrendLineChart({
  title,
  subtitle,
  points,
  valueKey,
  rollingKey,
  showRolling,
  onToggleRolling,
  invertGood = false,
  events = [],
  showEvents = true,
  formatAsPercent,
  secondaryKey,
  secondaryLabel,
}: Props) {
  if (!points.length) return null;

  const first = Number(points[0]?.[valueKey] ?? 0);
  const last = Number(points[points.length - 1]?.[valueKey] ?? 0);
  const delta = last - first;
  const improving = invertGood ? delta < 0 : delta > 0;
  const flat = Math.abs(delta) < (formatAsPercent ? 2 : 50);

  const eventMonthKeys = new Set(
    events.map((event) => event.date.slice(0, 7)).filter(Boolean),
  );

  const chartData = points.map((point) => ({
    ...point,
    xLabel: point.yearLabel,
    hasEvent: eventMonthKeys.has(point.month),
  }));

  const eventLines = showEvents
    ? points.filter((point) => eventMonthKeys.has(point.month))
    : [];

  return (
    <div className="app-card p-5 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-semibold text-[var(--ink)] tracking-tight">{title}</h3>
            <span
              className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                flat
                  ? "bg-[color-mix(in_srgb,var(--ink)_6%,transparent)] text-[var(--ink-soft)]"
                  : improving
                    ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                    : "bg-rose-500/10 text-rose-600"
              }`}
            >
              {flat ? "Flat" : improving ? "Improving" : "Declining"}{" "}
              <span className="tabular-nums">
                {formatAsPercent
                  ? `${delta >= 0 ? "+" : ""}${Math.round(delta)} pts`
                  : `${delta >= 0 ? "+" : "-"}${formatCurrency(Math.abs(delta))}`}
              </span>
            </span>
          </div>
          {subtitle ? (
            <p className="text-sm text-[var(--muted)] mt-1 leading-relaxed">{subtitle}</p>
          ) : null}
        </div>
        {rollingKey && onToggleRolling ? (
          <button
            type="button"
            onClick={onToggleRolling}
            className={`shrink-0 rounded-xl px-3 py-2 text-xs font-semibold ring-1 transition-colors ${
              showRolling
                ? "bg-[var(--accent-soft)] text-[var(--accent-strong)] ring-[color-mix(in_srgb,var(--accent)_28%,transparent)]"
                : "bg-[color-mix(in_srgb,var(--ink)_4%,transparent)] text-[var(--ink-soft)] ring-[var(--card-border)]"
            }`}
          >
            3-mo avg {showRolling ? "on" : "off"}
          </button>
        ) : null}
      </div>

      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.25)" />
            <XAxis
              dataKey="xLabel"
              tick={{ fontSize: 11, fill: "var(--muted)" }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={28}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--muted)" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(val) =>
                formatAsPercent
                  ? `${Math.round(Number(val))}%`
                  : `$${Math.round(Number(val) / 1000)}k`
              }
              width={48}
            />
            <Tooltip content={<ChartTooltip formatAsPercent={formatAsPercent} />} />
            <Legend wrapperStyle={{ fontSize: 12, color: "var(--ink-soft)" }} />
            {eventLines.map((point) => (
              <ReferenceLine
                key={`event-${point.month}`}
                x={point.yearLabel}
                stroke="color-mix(in srgb, var(--ink) 28%, transparent)"
                strokeDasharray="3 3"
              />
            ))}
            <Line
              type="monotone"
              dataKey={valueKey as string}
              name="Monthly"
              stroke="var(--accent)"
              strokeWidth={2.5}
              dot={{ r: 3, fill: "var(--accent)", strokeWidth: 0 }}
              activeDot={{ r: 5, fill: "var(--accent)", strokeWidth: 0 }}
            />
            {secondaryKey ? (
              <Line
                type="monotone"
                dataKey={secondaryKey as string}
                name={secondaryLabel ?? "Expected"}
                stroke="#94a3b8"
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
              />
            ) : null}
            {showRolling && rollingKey ? (
              <Line
                type="monotone"
                dataKey={rollingKey as string}
                name="3-mo avg"
                stroke="#0f766e"
                strokeWidth={2.25}
                strokeDasharray="6 4"
                connectNulls
                dot={false}
              />
            ) : null}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
