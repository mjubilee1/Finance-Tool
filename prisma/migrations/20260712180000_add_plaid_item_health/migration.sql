-- Track Plaid item health so stale logins can be repaired via update mode.
ALTER TABLE "PlaidItem" ADD COLUMN "errorCode" TEXT;
ALTER TABLE "PlaidItem" ADD COLUMN "errorMessage" TEXT;
ALTER TABLE "PlaidItem" ADD COLUMN "lastSyncedAt" TIMESTAMP(3);
ALTER TABLE "PlaidItem" ADD COLUMN "statusUpdatedAt" TIMESTAMP(3);
