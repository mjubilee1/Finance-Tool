"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  formatCarDueLabel,
  formatOdometer,
  type CarProfileLike,
} from "@/lib/car";
import {
  summarizeCarMaintenanceManage,
  type MaintenanceLogLike,
} from "@/lib/car-maintenance-schedule";

type Props = {
  profile: CarProfileLike;
  logs: MaintenanceLogLike[];
};

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    payload?: {
      name: string;
      usedPct: number;
      status: string;
    };
  }>;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  const statusText =
    point.status === "overdue"
      ? "Overdue"
      : point.status === "due_soon"
        ? "Due soon"
        : point.status === "ok"
          ? "On track"
          : "Needs a log";

  return (
    <div
      className="rounded-xl px-3 py-2.5 text-sm shadow-lg"
      style={{
        border: "1px solid var(--card-border)",
        background: "var(--card-solid)",
        color: "var(--ink)",
      }}
    >
      <p className="font-semibold">{point.name}</p>
      <p className="text-xs text-[var(--muted)] mt-1">
        {Math.round(point.usedPct)}% through interval · {statusText}
      </p>
    </div>
  );
}

export function CarMaintenanceManageChart({ profile, logs }: Props) {
  const summary = summarizeCarMaintenanceManage(profile, logs);
  const { lifespan, schedule, chartRows, timeline } = summary;
  const wash = schedule.find((s) => s.id === "wash");
  const overdueCount = schedule.filter((s) => s.status === "overdue").length;
  const dueSoonCount = schedule.filter((s) => s.status === "due_soon").length;

  return (
    <div className="space-y-4">
      <div className="app-card p-5 space-y-5">
        <div>
          <p className="app-label mb-1">Manage chart</p>
          <h2 className="text-lg font-semibold text-[var(--ink)] tracking-tight">
            Maintenance & cleanings over ownership
          </h2>
          <p className="text-sm text-[var(--muted)] mt-1 leading-relaxed">
            Clock started at {formatOdometer(lifespan.startOdometerMiles)} on{" "}
            {formatCarDueLabel(lifespan.ownershipStartDate)}. Bars fill as each service nears its
            next date or mileage — wash/cleaning stays on a short cadence so the car stays neat
            through payoff.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl px-3 py-3 ring-1 ring-[var(--card-border)] bg-[color-mix(in_srgb,var(--ink)_4%,transparent)]">
            <p className="app-label mb-1">Start</p>
            <p className="text-lg font-bold tabular-nums text-[var(--ink)]">
              {formatOdometer(lifespan.startOdometerMiles)}
            </p>
          </div>
          <div className="rounded-xl px-3 py-3 ring-1 ring-[var(--card-border)] bg-[color-mix(in_srgb,var(--ink)_4%,transparent)]">
            <p className="app-label mb-1">Driven</p>
            <p className="text-lg font-bold tabular-nums text-[var(--ink)]">
              {formatOdometer(lifespan.milesDriven)}
            </p>
            <p className="text-xs text-[var(--muted)] mt-0.5">
              since day one · now {formatOdometer(lifespan.currentOdometerMiles)}
            </p>
          </div>
          <div className="rounded-xl px-3 py-3 ring-1 ring-[var(--card-border)] bg-[color-mix(in_srgb,var(--ink)_4%,transparent)]">
            <p className="app-label mb-1">Owned</p>
            <p className="text-lg font-bold tabular-nums text-[var(--ink)]">
              {lifespan.ownershipMonths} mo
            </p>
            <p className="text-xs text-[var(--muted)] mt-0.5">
              {lifespan.termProgressPct}% of {lifespan.termMonths}-mo term
            </p>
          </div>
          <div className="rounded-xl px-3 py-3 ring-1 ring-[var(--card-border)] bg-[color-mix(in_srgb,var(--ink)_4%,transparent)]">
            <p className="app-label mb-1">Attention</p>
            <p className="text-lg font-bold tabular-nums text-[var(--ink)]">
              {overdueCount + dueSoonCount}
            </p>
            <p className="text-xs text-[var(--muted)] mt-0.5">
              {overdueCount} overdue · {dueSoonCount} due soon
            </p>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between text-xs text-[var(--muted)] mb-1.5">
            <span>Ownership lifespan</span>
            <span>
              {formatCarDueLabel(lifespan.ownershipStartDate)} → {lifespan.termMonths} mo term
              {lifespan.projectedTermEndMiles != null
                ? ` · ~${formatOdometer(lifespan.projectedTermEndMiles)} at payoff pace`
                : ""}
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-[color-mix(in_srgb,var(--ink)_10%,transparent)] overflow-hidden">
            <div
              className="h-full rounded-full bg-blue-600 transition-[width] duration-500"
              style={{ width: `${Math.min(100, lifespan.termProgressPct)}%` }}
            />
          </div>
        </div>

        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartRows}
              layout="vertical"
              margin={{ top: 4, right: 12, bottom: 4, left: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--card-border)" />
              <XAxis
                type="number"
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
                tick={{ fill: "var(--muted)", fontSize: 11 }}
                axisLine={{ stroke: "var(--card-border)" }}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={108}
                tick={{ fill: "var(--ink-soft)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "color-mix(in srgb, var(--ink) 4%, transparent)" }} />
              <Bar dataKey="usedPct" radius={[0, 6, 6, 0]} barSize={14}>
                {chartRows.map((row) => (
                  <Cell key={row.id} fill={row.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {wash ? (
          <div className="rounded-xl px-3 py-3 ring-1 ring-[var(--card-border)] bg-[color-mix(in_srgb,var(--ink)_4%,transparent)]">
            <p className="app-label mb-1">Next cleaning</p>
            <p className="text-sm font-semibold text-[var(--ink)]">{wash.statusLabel}</p>
            <p className="text-xs text-[var(--muted)] mt-1">
              {wash.cadenceLabel}
              {wash.nextDueDate ? ` · target ${formatCarDueLabel(wash.nextDueDate)}` : ""}
              {wash.nextDueMiles != null ? ` · by ${formatOdometer(wash.nextDueMiles)}` : ""}
              {wash.lastDate
                ? ` · last ${formatCarDueLabel(wash.lastDate)}`
                : " · no wash logged yet (clock from ownership start)"}
            </p>
          </div>
        ) : null}
      </div>

      <div className="app-card p-5 space-y-3">
        <p className="app-label">Next due by service</p>
        <div className="space-y-2">
          {schedule.map((item) => (
            <div
              key={item.id}
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 rounded-xl px-3 py-2.5 ring-1 ring-[var(--card-border)] bg-[color-mix(in_srgb,var(--ink)_3%,transparent)]"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--ink)]">{item.label}</p>
                <p className="text-xs text-[var(--muted)]">{item.cadenceLabel}</p>
              </div>
              <div className="text-left sm:text-right shrink-0">
                <p
                  className={`text-xs font-semibold ${
                    item.status === "overdue"
                      ? "text-rose-600"
                      : item.status === "due_soon"
                        ? "text-amber-700"
                        : "text-[var(--ink-soft)]"
                  }`}
                >
                  {item.statusLabel}
                </p>
                {item.nextDueDate || item.nextDueMiles != null ? (
                  <p className="text-xs text-[var(--muted)] mt-0.5">
                    {item.nextDueDate ? formatCarDueLabel(item.nextDueDate) : ""}
                    {item.nextDueDate && item.nextDueMiles != null ? " · " : ""}
                    {item.nextDueMiles != null ? formatOdometer(item.nextDueMiles) : ""}
                  </p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      {timeline.length > 0 ? (
        <div className="app-card p-5 space-y-3">
          <p className="app-label">Dated lifespan log</p>
          <div className="relative space-y-0 pl-4 before:absolute before:left-[7px] before:top-1 before:bottom-1 before:w-px before:bg-[var(--card-border)]">
            {timeline.map((entry, idx) => (
              <div key={`${entry.date}-${entry.label}-${idx}`} className="relative pb-3 last:pb-0">
                <span className="absolute -left-4 top-1.5 h-2.5 w-2.5 rounded-full bg-blue-600 ring-2 ring-white" />
                <p className="text-sm font-semibold text-[var(--ink)]">{entry.label}</p>
                <p className="text-xs text-[var(--muted)]">
                  {formatCarDueLabel(entry.date)}
                  {entry.odometerMiles != null ? ` · ${formatOdometer(entry.odometerMiles)}` : ""}
                  {entry.milesFromStart != null
                    ? ` · +${entry.milesFromStart.toLocaleString("en-US")} mi from start`
                    : ""}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
