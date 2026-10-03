-- CreateTable
CREATE TABLE "OperatingSystem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unstable',
    "currentState" TEXT NOT NULL,
    "targetState" TEXT NOT NULL,
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "nextAction" TEXT,
    "blocker" TEXT,
    "deadline" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperatingSystem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatingSystemUpdate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "progress" DOUBLE PRECISION NOT NULL,
    "currentState" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperatingSystemUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrowthWin" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "impact" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrowthWin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OperatingSystem_userId_isArchived_status_idx" ON "OperatingSystem"("userId", "isArchived", "status");

-- CreateIndex
CREATE INDEX "OperatingSystem_userId_domain_idx" ON "OperatingSystem"("userId", "domain");

-- CreateIndex
CREATE INDEX "OperatingSystemUpdate_systemId_createdAt_idx" ON "OperatingSystemUpdate"("systemId", "createdAt");

-- CreateIndex
CREATE INDEX "OperatingSystemUpdate_userId_createdAt_idx" ON "OperatingSystemUpdate"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "GrowthWin_userId_date_idx" ON "GrowthWin"("userId", "date");

-- CreateIndex
CREATE INDEX "GrowthWin_userId_domain_idx" ON "GrowthWin"("userId", "domain");

-- AddForeignKey
ALTER TABLE "OperatingSystem" ADD CONSTRAINT "OperatingSystem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatingSystemUpdate" ADD CONSTRAINT "OperatingSystemUpdate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatingSystemUpdate" ADD CONSTRAINT "OperatingSystemUpdate_systemId_fkey" FOREIGN KEY ("systemId") REFERENCES "OperatingSystem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowthWin" ADD CONSTRAINT "GrowthWin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
