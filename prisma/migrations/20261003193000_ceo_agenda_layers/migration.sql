-- CreateTable
CREATE TABLE "AgendaSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "primaryVenture" TEXT NOT NULL DEFAULT 'Nearby',
    "secondaryVenture" TEXT NOT NULL DEFAULT 'OnLocalAI',
    "lyftDailyTarget" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "lyftMorningStart" TEXT NOT NULL DEFAULT '05:00',
    "lyftMorningEnd" TEXT NOT NULL DEFAULT '12:00',
    "gymWeeklyTarget" INTEGER NOT NULL DEFAULT 3,
    "morningBriefingTime" TEXT NOT NULL DEFAULT '08:48',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgendaSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentGrowthBlock" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "calendarEventId" TEXT,
    "blockType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentGrowthBlock_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "LocalEventItem"
ADD COLUMN "plannedStart" TIMESTAMP(3),
ADD COLUMN "plannedEnd" TIMESTAMP(3),
ADD COLUMN "calendarEventId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "AgendaSettings_userId_key" ON "AgendaSettings"("userId");
CREATE UNIQUE INDEX "AgentGrowthBlock_userId_externalId_key" ON "AgentGrowthBlock"("userId", "externalId");
CREATE INDEX "AgentGrowthBlock_userId_startsAt_idx" ON "AgentGrowthBlock"("userId", "startsAt");

-- AddForeignKey
ALTER TABLE "AgendaSettings" ADD CONSTRAINT "AgendaSettings_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentGrowthBlock" ADD CONSTRAINT "AgentGrowthBlock_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
