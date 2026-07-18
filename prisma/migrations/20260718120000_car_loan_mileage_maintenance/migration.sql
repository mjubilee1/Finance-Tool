-- CreateTable (for environments that never received CarProfile via db push)
CREATE TABLE IF NOT EXISTS "CarProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "paymentMonthly" DOUBLE PRECISION NOT NULL DEFAULT 513,
    "paymentNextDue" TEXT NOT NULL,
    "insuranceMonthly" DOUBLE PRECISION NOT NULL DEFAULT 352,
    "insuranceNextDue" TEXT NOT NULL,
    "loanAmount" DOUBLE PRECISION NOT NULL DEFAULT 26436,
    "loanBalance" DOUBLE PRECISION NOT NULL DEFAULT 26436,
    "loanTermMonths" INTEGER NOT NULL DEFAULT 42,
    "loanStartDate" TEXT NOT NULL DEFAULT '2026-07-01',
    "payoffTargetMonthly" DOUBLE PRECISION NOT NULL DEFAULT 800,
    "odometerMiles" DOUBLE PRECISION NOT NULL DEFAULT 20340,
    "odometerAsOf" TEXT NOT NULL DEFAULT '2026-07-18',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CarProfile_userId_key" ON "CarProfile"("userId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CarProfile_userId_fkey'
  ) THEN
    ALTER TABLE "CarProfile"
      ADD CONSTRAINT "CarProfile_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AlterTable (existing CarProfile rows from earlier db push)
ALTER TABLE "CarProfile" ADD COLUMN IF NOT EXISTS "loanAmount" DOUBLE PRECISION NOT NULL DEFAULT 26436;
ALTER TABLE "CarProfile" ADD COLUMN IF NOT EXISTS "loanBalance" DOUBLE PRECISION NOT NULL DEFAULT 26436;
ALTER TABLE "CarProfile" ADD COLUMN IF NOT EXISTS "loanTermMonths" INTEGER NOT NULL DEFAULT 42;
ALTER TABLE "CarProfile" ADD COLUMN IF NOT EXISTS "loanStartDate" TEXT NOT NULL DEFAULT '2026-07-01';
ALTER TABLE "CarProfile" ADD COLUMN IF NOT EXISTS "payoffTargetMonthly" DOUBLE PRECISION NOT NULL DEFAULT 800;
ALTER TABLE "CarProfile" ADD COLUMN IF NOT EXISTS "odometerMiles" DOUBLE PRECISION NOT NULL DEFAULT 20340;
ALTER TABLE "CarProfile" ADD COLUMN IF NOT EXISTS "odometerAsOf" TEXT NOT NULL DEFAULT '2026-07-18';

-- CreateTable
CREATE TABLE IF NOT EXISTS "CarMaintenanceLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "carProfileId" TEXT NOT NULL,
    "serviceType" TEXT NOT NULL,
    "serviceDate" TEXT NOT NULL,
    "odometerMiles" DOUBLE PRECISION,
    "cost" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarMaintenanceLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CarMaintenanceLog_userId_serviceDate_idx" ON "CarMaintenanceLog"("userId", "serviceDate");
CREATE INDEX IF NOT EXISTS "CarMaintenanceLog_carProfileId_serviceDate_idx" ON "CarMaintenanceLog"("carProfileId", "serviceDate");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CarMaintenanceLog_userId_fkey'
  ) THEN
    ALTER TABLE "CarMaintenanceLog"
      ADD CONSTRAINT "CarMaintenanceLog_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CarMaintenanceLog_carProfileId_fkey'
  ) THEN
    ALTER TABLE "CarMaintenanceLog"
      ADD CONSTRAINT "CarMaintenanceLog_carProfileId_fkey"
      FOREIGN KEY ("carProfileId") REFERENCES "CarProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
