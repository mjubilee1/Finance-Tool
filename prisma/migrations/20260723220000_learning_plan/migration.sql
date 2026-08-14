-- Learning Plan: drive-time topic mix + content queue.
CREATE TABLE "LearningPlanSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weeklyHours" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "categoryPercentages" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningPlanSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LearningContentItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'saved',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningContentItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LearningPlanSettings_userId_key" ON "LearningPlanSettings"("userId");
CREATE INDEX "LearningContentItem_userId_status_idx" ON "LearningContentItem"("userId", "status");
CREATE INDEX "LearningContentItem_userId_category_idx" ON "LearningContentItem"("userId", "category");
CREATE INDEX "LearningContentItem_userId_createdAt_idx" ON "LearningContentItem"("userId", "createdAt");

ALTER TABLE "LearningPlanSettings" ADD CONSTRAINT "LearningPlanSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LearningContentItem" ADD CONSTRAINT "LearningContentItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
