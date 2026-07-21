-- CreateTable
CREATE TABLE IF NOT EXISTS "HomeProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mortgageMonthly" DOUBLE PRECISION NOT NULL DEFAULT 2659,
    "mortgageNextDue" TEXT NOT NULL,
    "propertyLabel" TEXT NOT NULL DEFAULT 'Oxon Hill row home',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomeProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "HomeProfile_userId_key" ON "HomeProfile"("userId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'HomeProfile_userId_fkey'
  ) THEN
    ALTER TABLE "HomeProfile"
      ADD CONSTRAINT "HomeProfile_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "HomeTenant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "homeProfileId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "unitLabel" TEXT NOT NULL,
    "expectedRent" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "moveInDate" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomeTenant_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "HomeTenant_userId_status_idx" ON "HomeTenant"("userId", "status");
CREATE INDEX IF NOT EXISTS "HomeTenant_homeProfileId_status_idx" ON "HomeTenant"("homeProfileId", "status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'HomeTenant_userId_fkey'
  ) THEN
    ALTER TABLE "HomeTenant"
      ADD CONSTRAINT "HomeTenant_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'HomeTenant_homeProfileId_fkey'
  ) THEN
    ALTER TABLE "HomeTenant"
      ADD CONSTRAINT "HomeTenant_homeProfileId_fkey"
      FOREIGN KEY ("homeProfileId") REFERENCES "HomeProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "HomeRentPayment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "homeProfileId" TEXT NOT NULL,
    "tenantId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "paidOn" TEXT NOT NULL,
    "periodLabel" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomeRentPayment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "HomeRentPayment_userId_paidOn_idx" ON "HomeRentPayment"("userId", "paidOn");
CREATE INDEX IF NOT EXISTS "HomeRentPayment_homeProfileId_paidOn_idx" ON "HomeRentPayment"("homeProfileId", "paidOn");
CREATE INDEX IF NOT EXISTS "HomeRentPayment_tenantId_paidOn_idx" ON "HomeRentPayment"("tenantId", "paidOn");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'HomeRentPayment_userId_fkey'
  ) THEN
    ALTER TABLE "HomeRentPayment"
      ADD CONSTRAINT "HomeRentPayment_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'HomeRentPayment_homeProfileId_fkey'
  ) THEN
    ALTER TABLE "HomeRentPayment"
      ADD CONSTRAINT "HomeRentPayment_homeProfileId_fkey"
      FOREIGN KEY ("homeProfileId") REFERENCES "HomeProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'HomeRentPayment_tenantId_fkey'
  ) THEN
    ALTER TABLE "HomeRentPayment"
      ADD CONSTRAINT "HomeRentPayment_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "HomeTenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "HomeMaintenanceLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "homeProfileId" TEXT NOT NULL,
    "issueType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "issueDate" TEXT NOT NULL,
    "resolvedDate" TEXT,
    "cost" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomeMaintenanceLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "HomeMaintenanceLog_userId_issueDate_idx" ON "HomeMaintenanceLog"("userId", "issueDate");
CREATE INDEX IF NOT EXISTS "HomeMaintenanceLog_homeProfileId_status_idx" ON "HomeMaintenanceLog"("homeProfileId", "status");
CREATE INDEX IF NOT EXISTS "HomeMaintenanceLog_homeProfileId_issueDate_idx" ON "HomeMaintenanceLog"("homeProfileId", "issueDate");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'HomeMaintenanceLog_userId_fkey'
  ) THEN
    ALTER TABLE "HomeMaintenanceLog"
      ADD CONSTRAINT "HomeMaintenanceLog_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'HomeMaintenanceLog_homeProfileId_fkey'
  ) THEN
    ALTER TABLE "HomeMaintenanceLog"
      ADD CONSTRAINT "HomeMaintenanceLog_homeProfileId_fkey"
      FOREIGN KEY ("homeProfileId") REFERENCES "HomeProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
