export type GoalSuggestion = {
  /** create = new goal; update = add savings / raise target on an existing goal */
  action?: "create" | "update";
  /** Existing goal id when action is update (preferred) */
  goalId?: string | null;
  /** Match existing goal by name when id unknown */
  matchName?: string | null;
  name: string;
  type: string;
  reason: string;
  targetAmount?: number | null;
  targetDate?: string | null;
  priority?: 1 | 2 | 3;
  monthlyRedirect?: number | null;
  /** Dollars to add to currentAmount on update (or seed on create) */
  addAmount?: number | null;
};

const MONEY_TYPES = new Set(["savings", "debt_payoff"]);
const LIFE_TYPES = new Set([
  "learning",
  "personal",
  "career",
  "fitness",
  "documents",
  "other",
]);

function parseOptionalMoney(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

export function parseGoalSuggestion(value: unknown): GoalSuggestion | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.name !== "string" || !raw.name.trim()) return null;
  if (typeof raw.reason !== "string" || !raw.reason.trim()) return null;
  const type =
    typeof raw.type === "string" && (MONEY_TYPES.has(raw.type) || LIFE_TYPES.has(raw.type))
      ? raw.type
      : "savings";

  const priorityRaw = Number(raw.priority);
  const priority =
    priorityRaw === 1 || priorityRaw === 2 || priorityRaw === 3 ? priorityRaw : 2;
  const action = raw.action === "update" ? "update" : "create";

  return {
    action,
    goalId: typeof raw.goalId === "string" && raw.goalId.trim() ? raw.goalId.trim() : null,
    matchName:
      typeof raw.matchName === "string" && raw.matchName.trim()
        ? raw.matchName.trim()
        : null,
    name: raw.name.trim().slice(0, 120),
    type,
    reason: raw.reason.trim().slice(0, 400),
    targetAmount: parseOptionalMoney(raw.targetAmount),
    targetDate:
      typeof raw.targetDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.targetDate)
        ? raw.targetDate
        : null,
    priority,
    monthlyRedirect: parseOptionalMoney(raw.monthlyRedirect),
    addAmount: parseOptionalMoney(raw.addAmount),
  };
}

/** Prompt rules so the coach proposes goals without flooding the list. */
export const GOAL_SUGGESTION_RULES = `
GOAL SUGGESTIONS (optional, rare):
- You may propose at most ONE goalSuggestion — never auto-create/update without the user confirming in the UI.
- Prefer action "update" when an active goal already matches **by the same name** (addAmount / monthlyRedirect onto that goal) instead of creating a duplicate. Never point goalId at a different goal (e.g. house) when the suggestion is about something else (e.g. Canva → card).
- goalId and matchName must refer to the goal named in "name". If unsure which id, omit goalId and use exact matchName equal to that goal's name — or use action "create".
- Prefer redirecting freed cash (canceled subscription, leftover after buffer) toward the highest-APR credit card or an existing near-term money goal — do NOT invent a new trip/house goal if those already exist or are far away.
- Respect timelines: near-term funded/covered trips stay covered; far house goals should not vacuum every new $15 — point surplus at high-APR debt or the soonest underfunded goal.
- For debt_payoff creates: set monthlyRedirect (monthly principal plan beyond minimums) and a sensible targetAmount. Progress starts at $0 until principal is logged.
- For updates: set action "update", goalId from FINANCIAL GOALS when known (or matchName), and addAmount (principal paid this month) / monthlyRedirect.
- Never spam goals. Skip if equivalent exists and you're not adding to it, if the win is tiny one-off fun, or you already suggested something similar.
- If unsure, omit goalSuggestion (null) and just explain the money move in the message.
`;
