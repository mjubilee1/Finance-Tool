-- Calorie experiment: weekly budget + daily logs (3–4 week cut trial).
CREATE TABLE "CalorieExperiment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Calorie experiment',
    "startDate" TEXT NOT NULL,
    "durationWeeks" INTEGER NOT NULL DEFAULT 4,
    "monWedTarget" INTEGER NOT NULL DEFAULT 2250,
    "thuSunTarget" INTEGER NOT NULL DEFAULT 2600,
    "weeklyBudget" INTEGER NOT NULL DEFAULT 17150,
    "status" TEXT NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalorieExperiment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CalorieDayLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "calories" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalorieDayLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CalorieExperiment_userId_status_idx" ON "CalorieExperiment"("userId", "status");
CREATE INDEX "CalorieExperiment_userId_startDate_idx" ON "CalorieExperiment"("userId", "startDate");
CREATE INDEX "CalorieDayLog_experimentId_date_idx" ON "CalorieDayLog"("experimentId", "date");
CREATE INDEX "CalorieDayLog_userId_date_idx" ON "CalorieDayLog"("userId", "date");
CREATE UNIQUE INDEX "CalorieDayLog_userId_date_key" ON "CalorieDayLog"("userId", "date");

ALTER TABLE "CalorieExperiment" ADD CONSTRAINT "CalorieExperiment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalorieDayLog" ADD CONSTRAINT "CalorieDayLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalorieDayLog" ADD CONSTRAINT "CalorieDayLog_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "CalorieExperiment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
