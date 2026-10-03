-- CreateTable
CREATE TABLE "DailyPlanningSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastEmailDate" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyPlanningSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutineScheduleItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "weekdays" INTEGER[],
    "startTime" TEXT NOT NULL,
    "endTime" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoutineScheduleItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyPlanningSettings_userId_key" ON "DailyPlanningSettings"("userId");

-- CreateIndex
CREATE INDEX "RoutineScheduleItem_userId_active_idx" ON "RoutineScheduleItem"("userId", "active");

-- AddForeignKey
ALTER TABLE "DailyPlanningSettings" ADD CONSTRAINT "DailyPlanningSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineScheduleItem" ADD CONSTRAINT "RoutineScheduleItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
