-- Planned monthly contribution on goals (debt paydown / savings velocity).
-- Schema had this field since GoalContribution landed, but the SQL migration
-- never added the column — every FinancialGoal findMany then 500'd coach chat.
ALTER TABLE "FinancialGoal" ADD COLUMN IF NOT EXISTS "monthlyContribution" DOUBLE PRECISION;
