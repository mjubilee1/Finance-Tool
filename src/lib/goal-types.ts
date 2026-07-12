/** Money goals use checking coverage + dollar targets. Life goals track progress 0–100%. */

export const MONEY_GOAL_TYPES = ["savings", "debt_payoff"] as const;
export const LIFE_GOAL_TYPES = [
  "learning",
  "personal",
  "career",
  "fitness",
  "documents",
  "other",
] as const;

export type MoneyGoalType = (typeof MONEY_GOAL_TYPES)[number];
export type LifeGoalType = (typeof LIFE_GOAL_TYPES)[number];
export type GoalType = MoneyGoalType | LifeGoalType;

export const GOAL_TYPE_OPTIONS: Array<{ value: GoalType; label: string; group: "money" | "life" }> = [
  { value: "savings", label: "Save money", group: "money" },
  { value: "debt_payoff", label: "Pay down debt", group: "money" },
  { value: "learning", label: "Learning / skill", group: "life" },
  { value: "personal", label: "Personal / habit", group: "life" },
  { value: "career", label: "Career / leverage", group: "life" },
  { value: "fitness", label: "Body / fitness", group: "life" },
  { value: "documents", label: "Admin / documents", group: "life" },
  { value: "other", label: "Other life goal", group: "life" },
];

export function isMoneyGoalType(category?: string | null): boolean {
  return MONEY_GOAL_TYPES.includes((category ?? "savings") as MoneyGoalType);
}

export function isLifeGoalType(category?: string | null): boolean {
  return !isMoneyGoalType(category);
}

export function goalTypeLabel(category?: string | null): string {
  const match = GOAL_TYPE_OPTIONS.find((option) => option.value === category);
  if (match) return match.label;
  return isMoneyGoalType(category) ? "Money" : "Life";
}

/** Life goals store progress as currentAmount / 100. */
export const LIFE_GOAL_PROGRESS_TARGET = 100;
