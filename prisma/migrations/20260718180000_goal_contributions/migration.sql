-- Monthly principal / progress logs for debt paydown (and other money goals)
CREATE TABLE IF NOT EXISTS "GoalContribution" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "monthKey" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoalContribution_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "GoalContribution_goalId_monthKey_idx" ON "GoalContribution"("goalId", "monthKey");
CREATE INDEX IF NOT EXISTS "GoalContribution_userId_monthKey_idx" ON "GoalContribution"("userId", "monthKey");

ALTER TABLE "GoalContribution" DROP CONSTRAINT IF EXISTS "GoalContribution_userId_fkey";
ALTER TABLE "GoalContribution" ADD CONSTRAINT "GoalContribution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GoalContribution" DROP CONSTRAINT IF EXISTS "GoalContribution_goalId_fkey";
ALTER TABLE "GoalContribution" ADD CONSTRAINT "GoalContribution_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "FinancialGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
