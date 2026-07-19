import { prisma } from "@/lib/prisma";
import { currentGoalMonthKey, sumContributionsForMonth } from "@/lib/debt-paydown";

export type GoalWithMonthPaid<T extends { id: string }> = T & {
  thisMonthPaid: number;
  monthKey: string;
};

/** Attach this-month contribution totals to a list of goals. */
export async function attachGoalMonthPaid<T extends { id: string }>(
  userId: string,
  goals: T[],
  monthKey = currentGoalMonthKey(),
): Promise<Array<GoalWithMonthPaid<T>>> {
  if (goals.length === 0) return [];

  try {
    const contributions = await prisma.goalContribution.findMany({
      where: {
        userId,
        goalId: { in: goals.map((goal) => goal.id) },
        monthKey,
      },
      select: { goalId: true, amount: true, monthKey: true },
    });

    const byGoal = new Map<string, Array<{ amount: number; monthKey: string }>>();
    for (const row of contributions) {
      const list = byGoal.get(row.goalId) ?? [];
      list.push({ amount: row.amount, monthKey: row.monthKey });
      byGoal.set(row.goalId, list);
    }

    return goals.map((goal) => ({
      ...goal,
      monthKey,
      thisMonthPaid: sumContributionsForMonth(byGoal.get(goal.id) ?? [], monthKey),
    }));
  } catch (error) {
    // GoalContribution table may be missing until migrate deploy finishes.
    console.error("GoalContribution unavailable; returning zero month paid:", error);
    return goals.map((goal) => ({
      ...goal,
      monthKey,
      thisMonthPaid: 0,
    }));
  }
}
