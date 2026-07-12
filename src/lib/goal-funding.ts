export type GoalFundingInput = {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate?: string | null;
  priority?: number | null;
  category?: string | null;
  createdAt?: string | Date | null;
};

export type GoalFundingResult = {
  id: string;
  name: string;
  targetAmount: number;
  /** Manual amount saved on the goal record */
  recordedAmount: number;
  /** Checking cash assigned to this goal after buffer + priority */
  checkingAllocation: number;
  /** What we show as funded: max(recorded, checking allocation) */
  effectiveAmount: number;
  progressPct: number;
  remaining: number;
  coveredByChecking: boolean;
  fullyFunded: boolean;
};

export type GoalFundingSummary = {
  checkingCash: number;
  protectedBuffer: number;
  allocatableCash: number;
  allocatedTotal: number;
  unallocatedCash: number;
  goals: GoalFundingResult[];
};

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * Goals are often funded from checking (Chase + Capital One) without a separate pot.
 *
 * Order of claim on surplus (after buffer):
 * 1. Dated goals within ~12 months (soonest first)
 * 2. Undated goals (active intent — e.g. a trip with no date yet)
 * 3. Longer-dated goals (e.g. house in 2027) by priority, then sooner date
 *
 * Without this, a 17-month "near" house starves an undated trip (no date = infinity).
 */
function isMoneySavingsGoal(category?: string | null) {
  const value = category ?? "savings";
  return value === "savings" || value === "debt_payoff";
}

const NEAR_TERM_MONTHS = 12;

function monthsUntilTarget(targetDate?: string | null) {
  const trimmed = typeof targetDate === "string" ? targetDate.trim() : "";
  if (!trimmed) return null;
  const target = new Date(`${trimmed}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(target)) return null;
  const diffMs = target - Date.now();
  return diffMs / (30 * 24 * 60 * 60 * 1000);
}

/** 0 = near dated, 1 = undated, 2 = far dated */
function fundingBucket(targetDate?: string | null): 0 | 1 | 2 {
  const months = monthsUntilTarget(targetDate);
  if (months == null) return 1;
  if (months <= NEAR_TERM_MONTHS) return 0;
  return 2;
}

function compareSavingsGoals(a: GoalFundingInput, b: GoalFundingInput) {
  const aBucket = fundingBucket(a.targetDate);
  const bBucket = fundingBucket(b.targetDate);
  if (aBucket !== bBucket) return aBucket - bBucket;

  const aMonths = monthsUntilTarget(a.targetDate);
  const bMonths = monthsUntilTarget(b.targetDate);

  if (aBucket === 0 || aBucket === 2) {
    // Dated: sooner first, then priority
    if (aMonths != null && bMonths != null && aMonths !== bMonths) {
      return aMonths - bMonths;
    }
    const priorityDiff = (a.priority ?? 3) - (b.priority ?? 3);
    if (priorityDiff !== 0) return priorityDiff;
  } else {
    // Undated: priority first
    const priorityDiff = (a.priority ?? 3) - (b.priority ?? 3);
    if (priorityDiff !== 0) return priorityDiff;
  }

  const aCreated = a.createdAt ? new Date(a.createdAt).getTime() : 0;
  const bCreated = b.createdAt ? new Date(b.createdAt).getTime() : 0;
  return aCreated - bCreated;
}

export function calculateGoalFunding(params: {
  checkingCash: number;
  goals: GoalFundingInput[];
  bufferFloor?: number;
  bufferRatio?: number;
}): GoalFundingSummary {
  const checkingCash = Math.max(0, params.checkingCash);
  const bufferFloor = params.bufferFloor ?? 500;
  const bufferRatio = params.bufferRatio ?? 0.25;
  const protectedBuffer = roundCurrency(Math.max(bufferFloor, checkingCash * bufferRatio));
  const allocatableCash = roundCurrency(Math.max(0, checkingCash - protectedBuffer));

  // Only dollar savings goals get checking allocation. Life goals track % progress.
  // Debt payoff is funded by payments, not by parking checking on the goal card.
  const savingsGoals = params.goals.filter((goal) => (goal.category ?? "savings") === "savings");
  const debtGoals = params.goals.filter((goal) => goal.category === "debt_payoff");
  const lifeGoals = params.goals.filter((goal) => !isMoneySavingsGoal(goal.category));

  const ordered = [...savingsGoals].sort(compareSavingsGoals);

  let pool = allocatableCash;
  const allocationById = new Map<string, number>();

  for (const goal of ordered) {
    const target = Math.max(0, goal.targetAmount);
    const recorded = Math.max(0, goal.currentAmount);
    const stillNeeded = Math.max(0, target - recorded);
    const allocated = roundCurrency(Math.min(stillNeeded, pool));
    allocationById.set(goal.id, allocated);
    pool = roundCurrency(Math.max(0, pool - allocated));
  }

  const toResult = (goal: GoalFundingInput, checkingAllocation: number): GoalFundingResult => {
    const target = Math.max(0, goal.targetAmount);
    const recorded = Math.max(0, goal.currentAmount);
    const funded = roundCurrency(Math.min(target, recorded + checkingAllocation));
    const progressPct = target > 0 ? Math.min(100, roundCurrency((funded / target) * 100)) : 0;

    return {
      id: goal.id,
      name: goal.name,
      targetAmount: target,
      recordedAmount: recorded,
      checkingAllocation,
      effectiveAmount: funded,
      progressPct,
      remaining: roundCurrency(Math.max(0, target - funded)),
      coveredByChecking: checkingAllocation > 0 && funded > recorded,
      fullyFunded: funded >= target && target > 0,
    };
  };

  const results = [
    ...ordered.map((goal) => toResult(goal, allocationById.get(goal.id) ?? 0)),
    ...debtGoals.map((goal) => toResult(goal, 0)),
    ...lifeGoals.map((goal) => toResult(goal, 0)),
  ];

  // Keep original goal order for UI when possible
  const byId = new Map(results.map((goal) => [goal.id, goal]));
  const goals = params.goals
    .map((goal) => byId.get(goal.id))
    .filter((goal): goal is GoalFundingResult => Boolean(goal));

  const allocatedTotal = roundCurrency(
    goals.reduce((sum, goal) => sum + goal.checkingAllocation, 0),
  );

  return {
    checkingCash: roundCurrency(checkingCash),
    protectedBuffer,
    allocatableCash,
    allocatedTotal,
    unallocatedCash: roundCurrency(Math.max(0, allocatableCash - allocatedTotal)),
    goals,
  };
}
