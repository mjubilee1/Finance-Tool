import { DateTime } from "luxon";
import {
  carMaintenanceTypeLabel,
  formatOdometer,
  parseIsoDate,
  type CarProfileLike,
} from "@/lib/car";

/** Interval rules for keeping the financed car healthy and neat through payoff. */
export const CAR_MAINTENANCE_SCHEDULE = [
  {
    id: "wash" as const,
    label: "Wash / cleaning",
    /** Time-only cadence — no mileage trigger. */
    intervalMiles: null,
    intervalDays: 14,
    cadenceLabel: "every 2 weeks",
  },
  {
    id: "oil_change" as const,
    label: "Oil change",
    intervalMiles: 5_000,
    intervalDays: 180,
    cadenceLabel: "every 5,000 mi or 6 mo",
  },
  {
    id: "tires" as const,
    label: "Tires / rotation",
    intervalMiles: 7_500,
    intervalDays: 180,
    cadenceLabel: "every 7,500 mi or 6 mo",
  },
  {
    id: "fluids" as const,
    label: "Fluids",
    intervalMiles: 10_000,
    intervalDays: 365,
    cadenceLabel: "every 10,000 mi or 12 mo",
  },
  {
    id: "brakes" as const,
    label: "Brakes",
    intervalMiles: 15_000,
    intervalDays: 365,
    cadenceLabel: "every 15,000 mi or 12 mo",
  },
  {
    id: "inspection" as const,
    label: "Inspection",
    intervalMiles: null,
    intervalDays: 365,
    cadenceLabel: "every 12 months",
  },
] as const;

export type CarScheduleServiceId = (typeof CAR_MAINTENANCE_SCHEDULE)[number]["id"];

export type MaintenanceLogLike = {
  serviceType: string;
  serviceDate: string;
  odometerMiles: number | null;
};

export type CarLifespanSummary = {
  startOdometerMiles: number;
  currentOdometerMiles: number;
  milesDriven: number;
  ownershipStartDate: string;
  ownershipDays: number;
  ownershipMonths: number;
  termMonths: number;
  termProgressPct: number;
  projectedTermEndMiles: number | null;
};

export type CarServiceScheduleItem = {
  id: CarScheduleServiceId;
  label: string;
  cadenceLabel: string;
  lastDate: string | null;
  lastOdometer: number | null;
  nextDueDate: string | null;
  nextDueMiles: number | null;
  milesUntilDue: number | null;
  daysUntilDue: number | null;
  /** 0–100+ how far through the interval (100 = due, >100 overdue). */
  intervalUsedPct: number;
  status: "ok" | "due_soon" | "overdue" | "unknown";
  statusLabel: string;
};

export type CarMaintenanceManageSummary = {
  lifespan: CarLifespanSummary;
  schedule: CarServiceScheduleItem[];
  /** Chart rows for horizontal progress bars (capped at 100 for display). */
  chartRows: Array<{
    id: string;
    name: string;
    usedPct: number;
    fill: string;
    status: CarServiceScheduleItem["status"];
  }>;
  timeline: Array<{
    date: string;
    label: string;
    odometerMiles: number | null;
    milesFromStart: number | null;
  }>;
};

function ownershipBaseline(profile: CarProfileLike & { startOdometerMiles?: number }) {
  const startMiles =
    typeof profile.startOdometerMiles === "number" && Number.isFinite(profile.startOdometerMiles)
      ? profile.startOdometerMiles
      : profile.odometerMiles;
  return {
    date: profile.loanStartDate,
    miles: startMiles,
  };
}

export function summarizeCarLifespan(
  profile: CarProfileLike & { startOdometerMiles?: number },
  todayIso?: string,
): CarLifespanSummary {
  const today = todayIso
    ? DateTime.fromISO(todayIso, { zone: "America/New_York" }).startOf("day")
    : DateTime.now().setZone("America/New_York").startOf("day");
  const start = parseIsoDate(profile.loanStartDate);
  const startOdometerMiles =
    typeof profile.startOdometerMiles === "number" && Number.isFinite(profile.startOdometerMiles)
      ? Math.max(0, profile.startOdometerMiles)
      : Math.max(0, profile.odometerMiles);
  const currentOdometerMiles = Math.max(startOdometerMiles, profile.odometerMiles);
  const milesDriven = Math.max(0, Math.round(currentOdometerMiles - startOdometerMiles));

  const ownershipDays =
    start && today.isValid ? Math.max(0, Math.floor(today.diff(start, "days").days)) : 0;
  const ownershipMonths =
    start && today.isValid ? Math.max(0, Math.floor(today.diff(start, "months").months)) : 0;
  const termMonths = Math.max(1, Math.round(profile.loanTermMonths));
  const termProgressPct = Math.min(
    100,
    Math.round((Math.min(ownershipMonths, termMonths) / termMonths) * 1000) / 10,
  );

  let projectedTermEndMiles: number | null = null;
  if (ownershipDays >= 7 && milesDriven > 0) {
    const daily = milesDriven / ownershipDays;
    const remainingDays = Math.max(0, termMonths * 30.4 - ownershipDays);
    projectedTermEndMiles = Math.round(currentOdometerMiles + daily * remainingDays);
  }

  return {
    startOdometerMiles,
    currentOdometerMiles,
    milesDriven,
    ownershipStartDate: profile.loanStartDate,
    ownershipDays,
    ownershipMonths,
    termMonths,
    termProgressPct,
    projectedTermEndMiles,
  };
}

function lastLogForType(logs: MaintenanceLogLike[], serviceType: string) {
  const matches = logs
    .filter((l) => l.serviceType === serviceType)
    .sort((a, b) => b.serviceDate.localeCompare(a.serviceDate));
  return matches[0] ?? null;
}

function statusFill(status: CarServiceScheduleItem["status"]) {
  switch (status) {
    case "overdue":
      return "#e11d48";
    case "due_soon":
      return "#d97706";
    case "ok":
      return "#2563eb";
    default:
      return "#94a3b8";
  }
}

export function buildCarServiceSchedule(
  profile: CarProfileLike & { startOdometerMiles?: number },
  logs: MaintenanceLogLike[],
  todayIso?: string,
): CarServiceScheduleItem[] {
  const today = todayIso
    ? DateTime.fromISO(todayIso, { zone: "America/New_York" }).startOf("day")
    : DateTime.now().setZone("America/New_York").startOf("day");
  const baseline = ownershipBaseline(profile);
  const currentMiles = Math.max(baseline.miles, profile.odometerMiles);

  return CAR_MAINTENANCE_SCHEDULE.map((rule) => {
    const last = lastLogForType(logs, rule.id);
    const lastDate = last?.serviceDate ?? baseline.date;
    const lastOdometer =
      last?.odometerMiles != null
        ? last.odometerMiles
        : last
          ? null
          : baseline.miles;
    const lastDt = parseIsoDate(lastDate);

    const nextDueMiles =
      rule.intervalMiles != null && lastOdometer != null
        ? lastOdometer + rule.intervalMiles
        : null;
    const nextDueDate =
      lastDt && rule.intervalDays != null
        ? lastDt.plus({ days: rule.intervalDays }).toISODate()
        : null;

    const milesUntilDue =
      nextDueMiles != null ? Math.round(nextDueMiles - currentMiles) : null;
    const nextDueDt = parseIsoDate(nextDueDate ?? "");
    const daysUntilDue =
      nextDueDt && today.isValid
        ? Math.round(nextDueDt.diff(today, "days").days)
        : null;

    const milesUsedPct =
      rule.intervalMiles != null && lastOdometer != null
        ? ((currentMiles - lastOdometer) / rule.intervalMiles) * 100
        : null;
    const daysUsedPct =
      lastDt && rule.intervalDays != null && today.isValid
        ? (today.diff(lastDt, "days").days / rule.intervalDays) * 100
        : null;

    const intervalUsedPct = Math.max(
      0,
      Math.round(Math.max(milesUsedPct ?? 0, daysUsedPct ?? 0) * 10) / 10,
    );

    let status: CarServiceScheduleItem["status"] = "unknown";
    if (milesUsedPct != null || daysUsedPct != null) {
      if (intervalUsedPct >= 100) status = "overdue";
      else if (intervalUsedPct >= 80) status = "due_soon";
      else status = "ok";
    }

    let statusLabel = "Log a baseline to start the clock";
    if (status === "overdue") {
      if (milesUntilDue != null && milesUntilDue < 0 && daysUntilDue != null && daysUntilDue < 0) {
        statusLabel = `Overdue by ${formatOdometer(Math.abs(milesUntilDue))} / ${Math.abs(daysUntilDue)}d`;
      } else if (milesUntilDue != null && milesUntilDue < 0) {
        statusLabel = `Overdue by ${formatOdometer(Math.abs(milesUntilDue))}`;
      } else if (daysUntilDue != null && daysUntilDue < 0) {
        statusLabel = `Overdue by ${Math.abs(daysUntilDue)} days`;
      } else {
        statusLabel = "Due now";
      }
    } else if (status === "due_soon") {
      const parts: string[] = [];
      if (milesUntilDue != null && milesUntilDue >= 0) parts.push(`~${formatOdometer(milesUntilDue)}`);
      if (daysUntilDue != null && daysUntilDue >= 0) parts.push(`${daysUntilDue}d`);
      statusLabel = parts.length ? `Due soon · ${parts.join(" / ")} left` : "Due soon";
    } else if (status === "ok") {
      const parts: string[] = [];
      if (milesUntilDue != null && milesUntilDue >= 0) parts.push(`${formatOdometer(milesUntilDue)}`);
      if (daysUntilDue != null && daysUntilDue >= 0) parts.push(`${daysUntilDue}d`);
      statusLabel = parts.length ? `${parts.join(" / ")} until due` : "On track";
    }

    return {
      id: rule.id,
      label: rule.label,
      cadenceLabel: rule.cadenceLabel,
      lastDate: last ? last.serviceDate : null,
      lastOdometer: last?.odometerMiles ?? null,
      nextDueDate,
      nextDueMiles,
      milesUntilDue,
      daysUntilDue,
      intervalUsedPct,
      status,
      statusLabel,
    };
  });
}

export function summarizeCarMaintenanceManage(
  profile: CarProfileLike & { startOdometerMiles?: number },
  logs: MaintenanceLogLike[],
  todayIso?: string,
): CarMaintenanceManageSummary {
  const lifespan = summarizeCarLifespan(profile, todayIso);
  const schedule = buildCarServiceSchedule(profile, logs, todayIso);
  const chartRows = schedule.map((item) => ({
    id: item.id,
    name: item.label,
    usedPct: Math.min(100, item.intervalUsedPct),
    fill: statusFill(item.status),
    status: item.status,
  }));

  const timeline = [...logs]
    .sort((a, b) => a.serviceDate.localeCompare(b.serviceDate))
    .map((log) => ({
      date: log.serviceDate,
      label: carMaintenanceTypeLabel(log.serviceType),
      odometerMiles: log.odometerMiles,
      milesFromStart:
        log.odometerMiles != null
          ? Math.max(0, Math.round(log.odometerMiles - lifespan.startOdometerMiles))
          : null,
    }));

  return { lifespan, schedule, chartRows, timeline };
}
