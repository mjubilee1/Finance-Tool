-- CreateTable
CREATE TABLE "FinancialEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DOUBLE PRECISION,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialTrendsSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expectedMonthlyRent" DOUBLE PRECISION NOT NULL DEFAULT 2650,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialTrendsSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinancialEvent_userId_date_idx" ON "FinancialEvent"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialTrendsSettings_userId_key" ON "FinancialTrendsSettings"("userId");

-- AddForeignKey
ALTER TABLE "FinancialEvent" ADD CONSTRAINT "FinancialEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTrendsSettings" ADD CONSTRAINT "FinancialTrendsSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
