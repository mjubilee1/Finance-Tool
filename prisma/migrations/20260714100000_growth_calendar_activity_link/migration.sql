-- AlterTable
ALTER TABLE "GrowthActivity" ADD COLUMN "sourceCalendarEventId" TEXT;

-- CreateIndex
CREATE INDEX "GrowthActivity_userId_sourceCalendarEventId_idx" ON "GrowthActivity"("userId", "sourceCalendarEventId");
