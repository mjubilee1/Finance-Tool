-- AlterTable
ALTER TABLE "GrowthActivity" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'planned';
ALTER TABLE "GrowthActivity" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 100;
ALTER TABLE "GrowthActivity" ADD COLUMN "timeLabel" TEXT;

-- CreateTable
CREATE TABLE "PlannerDayLayout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "orderJson" TEXT NOT NULL DEFAULT '[]',
    "overridesJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlannerDayLayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlannerDayLayout_userId_date_idx" ON "PlannerDayLayout"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "PlannerDayLayout_userId_date_key" ON "PlannerDayLayout"("userId", "date");

-- AddForeignKey
ALTER TABLE "PlannerDayLayout" ADD CONSTRAINT "PlannerDayLayout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
