-- CreateTable
CREATE TABLE "GrowthContactNote" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT,
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrowthContactNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GrowthContactNote_contactId_createdAt_idx" ON "GrowthContactNote"("contactId", "createdAt");

-- CreateIndex
CREATE INDEX "GrowthContactNote_userId_idx" ON "GrowthContactNote"("userId");

-- AddForeignKey
ALTER TABLE "GrowthContactNote" ADD CONSTRAINT "GrowthContactNote_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "GrowthContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowthContactNote" ADD CONSTRAINT "GrowthContactNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate existing flat notes into the first timestamped entry
INSERT INTO "GrowthContactNote" ("id", "contactId", "userId", "body", "images", "createdAt")
SELECT
  gen_random_uuid()::text,
  c."id",
  c."userId",
  c."notes",
  ARRAY[]::TEXT[],
  COALESCE(c."updatedAt", c."createdAt", CURRENT_TIMESTAMP)
FROM "GrowthContact" c
WHERE c."notes" IS NOT NULL AND TRIM(c."notes") <> '';
