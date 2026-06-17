-- AlterTable
ALTER TABLE "FinancialAccount" ADD COLUMN IF NOT EXISTS "isPrimary" BOOLEAN NOT NULL DEFAULT false;
