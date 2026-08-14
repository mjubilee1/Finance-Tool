import assert from "node:assert/strict";
import test from "node:test";
import { buildCashFlowProjection, type ProjectionTransaction } from "./projection-service.ts";

test("compounds MoM habits and lands recurring cash flow on expected dates", () => {
  const transactions: ProjectionTransaction[] = [];
  const monthlySpend = [100, 110, 121, 133.1, 146.41, 161.05];

  monthlySpend.forEach((spend, index) => {
    const month = String(index + 2).padStart(2, "0");
    transactions.push(
      {
        id: `spend-${month}`,
        date: `2026-${month}-10`,
        amount: spend,
        name: "Variable shopping",
      },
      {
        id: `income-${month}`,
        date: `2026-${month}-05`,
        amount: -1000,
        name: "Side income",
      },
    );
  });

  const projection = buildCashFlowProjection({
    transactions,
    recurringPatterns: [
      {
        normalizedName: "mortgage",
        averageAmount: 200,
        frequency: "monthly",
        lastSeen: "2026-08-01",
        confidenceScore: 0.95,
        direction: "expense",
      },
      {
        normalizedName: "payroll",
        averageAmount: -500,
        frequency: "weekly",
        lastSeen: "2026-08-14",
        confidenceScore: 0.98,
        direction: "income",
      },
    ],
    currentBalance: 1000,
    referenceDate: "2026-08-14",
    horizonDays: 40,
  });

  assert.equal(projection.assumptions.completedMonthsAnalyzed, 6);
  assert.ok(projection.assumptions.spendMonthlyRate > 0);
  assert.equal(projection.assumptions.recurringExpenseCount, 1);
  assert.equal(projection.assumptions.recurringIncomeCount, 1);

  const firstPaycheck = projection.points.find((point) => point.date === "2026-08-21");
  assert.equal(firstPaycheck?.cumulativeRecurringIncome, 500);

  const beforeMortgage = projection.points.find((point) => point.date === "2026-08-31");
  const mortgageDay = projection.points.find((point) => point.date === "2026-09-01");
  assert.equal(beforeMortgage?.cumulativeRecurringSpend, 0);
  assert.equal(mortgageDay?.cumulativeRecurringSpend, 200);
});
