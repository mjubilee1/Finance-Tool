import { DateTime } from "luxon";

export const LYFT_WEEKLY_PROGRAM_FEE = 334;
export const LYFT_WEEKLY_PROGRAM_FEE_LABEL = "$334/week";
export const LYFT_MONTHLY_PROGRAM_FEE_ESTIMATE = Math.round(LYFT_WEEKLY_PROGRAM_FEE * 4.33);
export const LYFT_GROSS_EARNINGS_NOTE_PREFIX = "Lyft gross earnings";

/** Default weekly profit band after the Hertz/Lyft fee is covered. */
export const LYFT_WEEKLY_PROFIT_GOAL_MIN = 200;
export const LYFT_WEEKLY_PROFIT_GOAL_MAX = 400;
export const LYFT_WEEKLY_PROFIT_GOAL_DEFAULT = 300;

/** Default monthly profit band (~4× weekly) after fees. */
export const LYFT_MONTHLY_PROFIT_GOAL_MIN = 800;
export const LYFT_MONTHLY_PROFIT_GOAL_MAX = 1600;
export const LYFT_MONTHLY_PROFIT_GOAL_DEFAULT = 1200;

export const LYFT_DEFAULT_HOURLY_NET = 20;

export type LyftDayStatus =
  | "future"
  | "no_drive"
  | "under_target"
  | "hit_fee_pace"
  | "hit_profit"
  | "ahead";

export type LyftCoachStance = "cover_fee" | "catch_up" | "on_track" | "take_break";

type LyftActivityLike = {
  date: string;
  category?: string | null;
  title?: string | null;
  notes?: string | null;
  status?: string | null;
};

export type LyftGoalTargets = {
  weeklyProfitTarget: number;
  monthlyProfitTarget: number;
  hourlyNet: number;
};

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function parseCurrency(value: string | undefined) {
  if (!value) return null;
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function clampTarget(value: number | null | undefined, min: number, max: number, fallback: number) {
  if (value == null || !Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function resolveLyftGoalTargets(params?: {
  weeklyProfitTarget?: number | null;
  monthlyProfitTarget?: number | null;
  lyftHourlyNet?: number | null;
}): LyftGoalTargets {
  return {
    weeklyProfitTarget: clampTarget(
      params?.weeklyProfitTarget,
      LYFT_WEEKLY_PROFIT_GOAL_MIN,
      LYFT_WEEKLY_PROFIT_GOAL_MAX,
      LYFT_WEEKLY_PROFIT_GOAL_DEFAULT,
    ),
    monthlyProfitTarget: clampTarget(
      params?.monthlyProfitTarget,
      LYFT_MONTHLY_PROFIT_GOAL_MIN,
      LYFT_MONTHLY_PROFIT_GOAL_MAX,
      LYFT_MONTHLY_PROFIT_GOAL_DEFAULT,
    ),
    hourlyNet:
      params?.lyftHourlyNet != null && Number.isFinite(params.lyftHourlyNet) && params.lyftHourlyNet > 0
        ? params.lyftHourlyNet
        : LYFT_DEFAULT_HOURLY_NET,
  };
}

export function parseLyftGrossEarnings(activity: Pick<LyftActivityLike, "category" | "title" | "notes">) {
  const category = activity.category?.toLowerCase();
  const text = `${activity.title ?? ""}\n${activity.notes ?? ""}`;
  const structured = text.match(/Lyft gross earnings:\s*\$?([\d,]+(?:\.\d+)?)/i);
  const structuredAmount = parseCurrency(structured?.[1]);
  if (structuredAmount != null) return structuredAmount;

  if (category !== "lyft") return null;
  const titleAmount = text.match(/\$?([\d,]+(?:\.\d+)?)\s*(?:gross|earned|lyft)/i);
  return parseCurrency(titleAmount?.[1]);
}

export function getLyftWeekRange(dateIso: string) {
  const date = DateTime.fromISO(dateIso);
  const base = date.isValid ? date : DateTime.local();
  const start = base.startOf("week");
  const end = start.plus({ days: 6 });

  return {
    startIso: start.toISODate()!,
    endIso: end.toISODate()!,
  };
}

export function getLyftMonthRange(dateIso: string) {
  const date = DateTime.fromISO(dateIso);
  const base = date.isValid ? date : DateTime.local();
  const start = base.startOf("month");
  const end = base.endOf("month");

  return {
    startIso: start.toISODate()!,
    endIso: end.toISODate()!,
    daysInMonth: end.day,
  };
}

export function summarizeLyftWeek(
  activities: LyftActivityLike[],
  dateIso: string,
  goals?: Partial<LyftGoalTargets>,
) {
  const targets = resolveLyftGoalTargets(goals);
  const { startIso, endIso } = getLyftWeekRange(dateIso);
  const grossEarned = roundCurrency(
    activities.reduce((sum, activity) => {
      if (activity.date < startIso || activity.date > endIso) return sum;
      return sum + (parseLyftGrossEarnings(activity) ?? 0);
    }, 0),
  );
  const feeRemaining = roundCurrency(Math.max(0, LYFT_WEEKLY_PROGRAM_FEE - grossEarned));
  const profitAfterFee = roundCurrency(Math.max(0, grossEarned - LYFT_WEEKLY_PROGRAM_FEE));
  const weeklyGrossNeeded = roundCurrency(LYFT_WEEKLY_PROGRAM_FEE + targets.weeklyProfitTarget);
  const dailyGrossTarget = roundCurrency(weeklyGrossNeeded / 7);
  const dailyFeeShare = roundCurrency(LYFT_WEEKLY_PROGRAM_FEE / 7);
  const profitRemainingToGoal = roundCurrency(Math.max(0, targets.weeklyProfitTarget - profitAfterFee));

  return {
    weekStart: startIso,
    weekEnd: endIso,
    grossEarned,
    feeRemaining,
    profitAfterFee,
    weeklyProfitTarget: targets.weeklyProfitTarget,
    weeklyProfitGoalMin: LYFT_WEEKLY_PROFIT_GOAL_MIN,
    weeklyProfitGoalMax: LYFT_WEEKLY_PROFIT_GOAL_MAX,
    weeklyGrossNeeded,
    dailyGrossTarget,
    dailyFeeShare,
    profitRemainingToGoal,
    feeCovered: feeRemaining <= 0,
  };
}

export function summarizeLyftMonth(
  activities: LyftActivityLike[],
  dateIso: string,
  goals?: Partial<LyftGoalTargets>,
) {
  const targets = resolveLyftGoalTargets(goals);
  const { startIso, endIso, daysInMonth } = getLyftMonthRange(dateIso);
  const week = summarizeLyftWeek(activities, dateIso, targets);

  const byDate = new Map<string, number>();
  for (const activity of activities) {
    if (activity.date < startIso || activity.date > endIso) continue;
    const amount = parseLyftGrossEarnings(activity);
    if (amount == null) continue;
    byDate.set(activity.date, roundCurrency((byDate.get(activity.date) ?? 0) + amount));
  }

  const grossEarned = roundCurrency([...byDate.values()].reduce((sum, value) => sum + value, 0));

  // Approximate fee weeks already in the month (full weeks from Monday starts overlapping the month).
  const monthStart = DateTime.fromISO(startIso);
  const monthEnd = DateTime.fromISO(endIso);
  let feeWeeks = 0;
  let cursor = monthStart.startOf("week");
  while (cursor <= monthEnd) {
    const weekEnd = cursor.plus({ days: 6 });
    if (weekEnd >= monthStart && cursor <= monthEnd) feeWeeks += 1;
    cursor = cursor.plus({ weeks: 1 });
  }
  const estimatedFees = roundCurrency(feeWeeks * LYFT_WEEKLY_PROGRAM_FEE);
  const profitAfterFee = roundCurrency(Math.max(0, grossEarned - estimatedFees));
  const profitRemainingToGoal = roundCurrency(Math.max(0, targets.monthlyProfitTarget - profitAfterFee));
  const dayOfMonth = DateTime.fromISO(dateIso).isValid
    ? DateTime.fromISO(dateIso).day
    : DateTime.local().day;
  const expectedProfitPace = roundCurrency(
    targets.monthlyProfitTarget * Math.min(1, dayOfMonth / daysInMonth),
  );

  return {
    monthStart: startIso,
    monthEnd: endIso,
    daysInMonth,
    grossEarned,
    estimatedFees,
    feeWeeks,
    profitAfterFee,
    monthlyProfitTarget: targets.monthlyProfitTarget,
    monthlyProfitGoalMin: LYFT_MONTHLY_PROFIT_GOAL_MIN,
    monthlyProfitGoalMax: LYFT_MONTHLY_PROFIT_GOAL_MAX,
    profitRemainingToGoal,
    expectedProfitPace,
    weeklySnapshot: week,
  };
}

function dayStatusLabel(status: LyftDayStatus) {
  switch (status) {
    case "future":
      return "Upcoming";
    case "no_drive":
      return "No drive";
    case "under_target":
      return "Behind";
    case "hit_fee_pace":
      return "Fee pace";
    case "hit_profit":
      return "Hit target";
    case "ahead":
      return "Ahead";
  }
}

export function buildLyftDayBreakdown(
  activities: LyftActivityLike[],
  dateIso: string,
  goals?: Partial<LyftGoalTargets>,
) {
  const targets = resolveLyftGoalTargets(goals);
  const week = summarizeLyftWeek(activities, dateIso, targets);
  const today = DateTime.fromISO(dateIso);
  const todayIso = today.isValid ? today.toISODate()! : DateTime.local().toISODate()!;
  const start = DateTime.fromISO(week.weekStart);

  const earnedByDate = new Map<string, number>();
  const droveByDate = new Set<string>();
  for (const activity of activities) {
    if (activity.date < week.weekStart || activity.date > week.weekEnd) continue;
    const category = activity.category?.toLowerCase();
    const haystack = `${activity.title ?? ""} ${activity.notes ?? ""}`.toLowerCase();
    const isLyft = category === "lyft" || haystack.includes("lyft");
    if (!isLyft) continue;
    if (activity.status !== "skipped") droveByDate.add(activity.date);
    const amount = parseLyftGrossEarnings(activity);
    if (amount != null) {
      earnedByDate.set(activity.date, roundCurrency((earnedByDate.get(activity.date) ?? 0) + amount));
    }
  }

  let runningGross = 0;
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = start.plus({ days: index });
    const iso = day.toISODate()!;
    const gross = earnedByDate.get(iso) ?? 0;
    const isFuture = iso > todayIso;
    const isToday = iso === todayIso;
    runningGross = isFuture ? runningGross : roundCurrency(runningGross + gross);
    const runningProfit = roundCurrency(Math.max(0, runningGross - LYFT_WEEKLY_PROGRAM_FEE));

    let status: LyftDayStatus;
    if (isFuture) {
      status = "future";
    } else if (gross <= 0 && !droveByDate.has(iso)) {
      status = "no_drive";
    } else if (gross < week.dailyFeeShare) {
      status = "under_target";
    } else if (runningProfit >= targets.weeklyProfitTarget || gross >= week.dailyGrossTarget * 1.35) {
      status = "ahead";
    } else if (gross >= week.dailyGrossTarget) {
      status = "hit_profit";
    } else {
      status = "hit_fee_pace";
    }

    return {
      date: iso,
      label: day.toFormat("ccc"),
      dayNum: day.day,
      isToday,
      isFuture,
      grossEarned: gross,
      status,
      statusLabel: dayStatusLabel(status),
      hitDailyTarget: !isFuture && gross >= week.dailyGrossTarget,
    };
  });

  return {
    ...week,
    days,
  };
}

export function buildLyftCoachAdvice(params: {
  week: ReturnType<typeof summarizeLyftWeek>;
  month: ReturnType<typeof summarizeLyftMonth>;
  hourlyNet?: number | null;
  dateIso: string;
}) {
  const targets = resolveLyftGoalTargets({
    weeklyProfitTarget: params.week.weeklyProfitTarget,
    monthlyProfitTarget: params.month.monthlyProfitTarget,
    lyftHourlyNet: params.hourlyNet,
  });
  const today = DateTime.fromISO(params.dateIso);
  const dayIndex = today.isValid ? today.weekday : DateTime.local().weekday; // 1=Mon … 7=Sun
  const daysElapsed = Math.min(7, Math.max(1, dayIndex));
  const daysRemaining = Math.max(0, 7 - dayIndex);
  const expectedWeeklyProfitPace = roundCurrency(
    (targets.weeklyProfitTarget * daysElapsed) / 7,
  );
  const profitGapVsPace = roundCurrency(params.week.profitAfterFee - expectedWeeklyProfitPace);
  const hoursToCoverFee =
    params.week.feeRemaining > 0
      ? Math.ceil(params.week.feeRemaining / targets.hourlyNet)
      : 0;
  const hoursToWeeklyGoal =
    params.week.profitRemainingToGoal > 0
      ? Math.ceil(
          (params.week.feeRemaining + params.week.profitRemainingToGoal) / targets.hourlyNet,
        )
      : 0;

  let stance: LyftCoachStance;
  let headline: string;
  let detail: string;

  if (params.week.feeRemaining > 0) {
    stance = "cover_fee";
    headline = `Fee floor first — $${params.week.feeRemaining.toFixed(0)} left of ${LYFT_WEEKLY_PROGRAM_FEE_LABEL}`;
    detail =
      hoursToCoverFee > 0
        ? `About ${hoursToCoverFee} hr at ~$${targets.hourlyNet}/hr covers the Hertz fee. Profit starts after that.`
        : `Keep driving until the ${LYFT_WEEKLY_PROGRAM_FEE_LABEL} fee is covered before counting Capital One profit.`;
  } else if (params.week.profitAfterFee >= targets.weeklyProfitTarget) {
    stance = "take_break";
    headline = `Week profit hit — $${params.week.profitAfterFee.toFixed(0)} / $${targets.weeklyProfitTarget} goal`;
    detail =
      "You're good. Take the break, protect leverage/gym/joy, and only drive if you want optional upside — don't grind low-ROI hours out of guilt.";
  } else if (profitGapVsPace >= 0 && params.month.profitAfterFee >= params.month.expectedProfitPace) {
    stance = "on_track";
    headline = `On pace — $${params.week.profitAfterFee.toFixed(0)} profit vs ~$${expectedWeeklyProfitPace.toFixed(0)} expected`;
    detail =
      daysRemaining > 0
        ? `Room to choose: light Lyft or leverage. Monthly band is $${LYFT_MONTHLY_PROFIT_GOAL_MIN}–$${LYFT_MONTHLY_PROFIT_GOAL_MAX}; you're holding pace.`
        : "Week is on track. Bank the surplus to Capital One and protect recovery.";
  } else {
    stance = "catch_up";
    const gap = Math.max(params.week.profitRemainingToGoal, roundCurrency(-profitGapVsPace));
    headline = `Make it back — ~$${gap.toFixed(0)} behind the weekly profit band`;
    detail =
      hoursToWeeklyGoal > 0
        ? `Roughly ${hoursToWeeklyGoal} more hr at ~$${targets.hourlyNet}/hr gets you to $${targets.weeklyProfitTarget} weekly profit (toward $${targets.monthlyProfitTarget}/mo).`
        : `Pick up a Lyft block to close the gap toward $${targets.weeklyProfitTarget}/week ($${LYFT_WEEKLY_PROFIT_GOAL_MIN}–$${LYFT_WEEKLY_PROFIT_GOAL_MAX} band).`;
  }

  return {
    stance,
    headline,
    detail,
    expectedWeeklyProfitPace,
    profitGapVsPace,
    hoursToCoverFee,
    hoursToWeeklyGoal,
    daysRemaining,
    hourlyNet: targets.hourlyNet,
  };
}

export function buildLyftPaceSnapshot(
  activities: LyftActivityLike[],
  dateIso: string,
  goals?: {
    weeklyProfitTarget?: number | null;
    monthlyProfitTarget?: number | null;
    lyftHourlyNet?: number | null;
  },
) {
  const targets = resolveLyftGoalTargets(goals);
  const week = buildLyftDayBreakdown(activities, dateIso, targets);
  const month = summarizeLyftMonth(activities, dateIso, targets);
  const advice = buildLyftCoachAdvice({
    week,
    month,
    hourlyNet: targets.hourlyNet,
    dateIso,
  });
  const todayDay = week.days.find((day) => day.isToday) ?? null;

  return {
    date: dateIso,
    targets,
    week,
    month,
    today: todayDay,
    advice,
    labels: {
      weeklyFee: LYFT_WEEKLY_PROGRAM_FEE_LABEL,
      weeklyProfitBand: `$${LYFT_WEEKLY_PROFIT_GOAL_MIN}–$${LYFT_WEEKLY_PROFIT_GOAL_MAX}/week`,
      monthlyProfitBand: `$${LYFT_MONTHLY_PROFIT_GOAL_MIN}–$${LYFT_MONTHLY_PROFIT_GOAL_MAX}/month`,
    },
  };
}

export function calculateLyftEntryImpact(existingWeekGross: number, grossEarnings: number) {
  const feeRemainingBefore = Math.max(0, LYFT_WEEKLY_PROGRAM_FEE - existingWeekGross);
  const feeCoveredByEntry = Math.min(grossEarnings, feeRemainingBefore);
  const profitAfterFee = Math.max(0, grossEarnings - feeRemainingBefore);
  const feeRemainingAfter = Math.max(0, LYFT_WEEKLY_PROGRAM_FEE - existingWeekGross - grossEarnings);

  return {
    feeRemainingBefore: roundCurrency(feeRemainingBefore),
    feeCoveredByEntry: roundCurrency(feeCoveredByEntry),
    profitAfterFee: roundCurrency(profitAfterFee),
    feeRemainingAfter: roundCurrency(feeRemainingAfter),
  };
}

export function buildLyftEarningsNote(params: {
  grossEarnings: number;
  existingWeekGross: number;
  baseNote?: string | null;
}) {
  const impact = calculateLyftEntryImpact(params.existingWeekGross, params.grossEarnings);
  const lines = [
    `${LYFT_GROSS_EARNINGS_NOTE_PREFIX}: $${roundCurrency(params.grossEarnings).toFixed(2)}.`,
    `Applied to ${LYFT_WEEKLY_PROGRAM_FEE_LABEL} fee first: $${impact.feeCoveredByEntry.toFixed(2)}.`,
    `Lyft profit after fee from this entry: $${impact.profitAfterFee.toFixed(2)}.`,
    `Weekly fee remaining after this entry: $${impact.feeRemainingAfter.toFixed(2)}.`,
  ];

  if (params.baseNote?.trim()) {
    lines.push(params.baseNote.trim());
  }

  return lines.join(" ");
}
