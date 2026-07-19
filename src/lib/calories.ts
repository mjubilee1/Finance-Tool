import { DateTime } from "luxon";
import { USER_TIME_ZONE } from "@/lib/user-timezone";

export const DEFAULT_MON_WED_TARGET = 2250;
export const DEFAULT_THU_SUN_TARGET = 2600;
export const DEFAULT_DURATION_WEEKS = 4;

export type CalorieExperimentLike = {
  id: string;
  name: string;
  startDate: string;
  durationWeeks: number;
  monWedTarget: number;
  thuSunTarget: number;
  weeklyBudget: number;
  status: string;
  notes?: string | null;
};

export type CalorieDayLogLike = {
  id: string;
  date: string;
  calories: number;
  notes?: string | null;
};

export type CalorieWeekDay = {
  date: string;
  label: string;
  weekday: number;
  target: number;
  calories: number | null;
  delta: number | null;
  isToday: boolean;
  isFuture: boolean;
  band: "mon_wed" | "thu_sun";
};

export type CalorieWeekSummary = {
  weekIndex: number;
  weekStart: string;
  weekEnd: string;
  label: string;
  days: CalorieWeekDay[];
  loggedCalories: number;
  loggedDays: number;
  expectedToDate: number;
  remainingBudget: number;
  weeklyBudget: number;
  avgLogged: number | null;
  paceStatus: "under" | "on_track" | "over" | "empty";
  paceMessage: string;
  isCurrent: boolean;
};

export function computeWeeklyBudget(monWedTarget: number, thuSunTarget: number) {
  return monWedTarget * 3 + thuSunTarget * 4;
}

export function parseIsoDate(value: string) {
  const dt = DateTime.fromISO(value.trim(), { zone: USER_TIME_ZONE });
  return dt.isValid ? dt.startOf("day") : null;
}

export function todayIso(now = DateTime.now().setZone(USER_TIME_ZONE)) {
  return now.toISODate()!;
}

/** Luxon weekday: 1=Mon … 7=Sun */
export function dayTarget(
  dateIso: string,
  monWedTarget: number,
  thuSunTarget: number
): { target: number; band: "mon_wed" | "thu_sun"; weekday: number } {
  const dt = parseIsoDate(dateIso);
  if (!dt) {
    return { target: monWedTarget, band: "mon_wed", weekday: 1 };
  }
  const weekday = dt.weekday;
  if (weekday >= 1 && weekday <= 3) {
    return { target: monWedTarget, band: "mon_wed", weekday };
  }
  return { target: thuSunTarget, band: "thu_sun", weekday };
}

export function weekStartMonday(dateIso: string) {
  const dt = parseIsoDate(dateIso) ?? DateTime.now().setZone(USER_TIME_ZONE).startOf("day");
  // Luxon weekday: 1=Mon … 7=Sun — pin to Monday regardless of locale week settings.
  return dt.minus({ days: dt.weekday - 1 });
}

export function experimentEndDate(startDate: string, durationWeeks: number) {
  const start = weekStartMonday(startDate);
  return start.plus({ weeks: durationWeeks, days: -1 }).toISODate()!;
}

export function buildWeekSummary(opts: {
  experiment: Pick<
    CalorieExperimentLike,
    "monWedTarget" | "thuSunTarget" | "weeklyBudget" | "startDate" | "durationWeeks"
  >;
  weekIndex: number;
  logsByDate: Map<string, number>;
  today?: string;
}): CalorieWeekSummary {
  const today = opts.today ?? todayIso();
  const todayDt = parseIsoDate(today)!;
  const start = weekStartMonday(opts.experiment.startDate);
  const weekStart = start.plus({ weeks: opts.weekIndex });
  const weekEnd = weekStart.plus({ days: 6 });
  const weeklyBudget = opts.experiment.weeklyBudget;

  const days: CalorieWeekDay[] = [];
  let loggedCalories = 0;
  let loggedDays = 0;
  let targetForLogged = 0;

  for (let i = 0; i < 7; i++) {
    const day = weekStart.plus({ days: i });
    const date = day.toISODate()!;
    const { target, band, weekday } = dayTarget(
      date,
      opts.experiment.monWedTarget,
      opts.experiment.thuSunTarget
    );
    const calories = opts.logsByDate.has(date) ? opts.logsByDate.get(date)! : null;
    const isToday = date === today;
    const isFuture = day > todayDt;

    if (calories != null) {
      loggedCalories += calories;
      loggedDays += 1;
      targetForLogged += target;
    }

    days.push({
      date,
      label: day.toFormat("ccc"),
      weekday,
      target,
      calories,
      delta: calories != null ? calories - target : null,
      isToday,
      isFuture,
      band,
    });
  }

  const remainingBudget = weeklyBudget - loggedCalories;
  const avgLogged = loggedDays > 0 ? Math.round(loggedCalories / loggedDays) : null;

  let paceStatus: CalorieWeekSummary["paceStatus"] = "empty";
  let paceMessage = "Log today to start the week.";

  if (loggedDays > 0) {
    const slack = targetForLogged - loggedCalories;
    if (loggedCalories > weeklyBudget) {
      paceStatus = "over";
      paceMessage = `Over weekly budget by ${formatCals(loggedCalories - weeklyBudget)}.`;
    } else if (slack >= 150) {
      paceStatus = "under";
      paceMessage = `Under logged targets by ${formatCals(slack)} — room later in the week.`;
    } else if (slack <= -150) {
      paceStatus = "over";
      paceMessage = `Over logged targets by ${formatCals(-slack)} — tighten toward Sunday.`;
    } else {
      paceStatus = "on_track";
      paceMessage = "On track for the weekly budget.";
    }
  }

  const isCurrent =
    todayDt >= weekStart && todayDt <= weekEnd && opts.weekIndex < opts.experiment.durationWeeks;

  return {
    weekIndex: opts.weekIndex,
    weekStart: weekStart.toISODate()!,
    weekEnd: weekEnd.toISODate()!,
    label: `Week ${opts.weekIndex + 1}`,
    days,
    loggedCalories,
    loggedDays,
    expectedToDate: targetForLogged,
    remainingBudget,
    weeklyBudget,
    avgLogged,
    paceStatus,
    paceMessage,
    isCurrent,
  };
}

export function buildExperimentWeeks(
  experiment: CalorieExperimentLike,
  logs: CalorieDayLogLike[],
  today = todayIso()
) {
  const logsByDate = new Map(logs.map((l) => [l.date, l.calories]));
  const weeks: CalorieWeekSummary[] = [];
  for (let i = 0; i < experiment.durationWeeks; i++) {
    weeks.push(
      buildWeekSummary({
        experiment,
        weekIndex: i,
        logsByDate,
        today,
      })
    );
  }
  return weeks;
}

export function formatCals(n: number) {
  return `${Math.round(n).toLocaleString("en-US")} cal`;
}

export function serializeExperiment(row: {
  id: string;
  name: string;
  startDate: string;
  durationWeeks: number;
  monWedTarget: number;
  thuSunTarget: number;
  weeklyBudget: number;
  status: string;
  notes: string | null;
}) {
  return {
    id: row.id,
    name: row.name,
    startDate: row.startDate,
    durationWeeks: row.durationWeeks,
    monWedTarget: row.monWedTarget,
    thuSunTarget: row.thuSunTarget,
    weeklyBudget: row.weeklyBudget,
    status: row.status,
    notes: row.notes,
    endDate: experimentEndDate(row.startDate, row.durationWeeks),
  };
}

export function serializeLog(row: {
  id: string;
  date: string;
  calories: number;
  notes: string | null;
  experimentId: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    date: row.date,
    calories: row.calories,
    notes: row.notes,
    experimentId: row.experimentId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
