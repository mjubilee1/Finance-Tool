-- Local events digest (DMV / Baltimore / Richmond / Virginia Beach)
CREATE TABLE "LocalEventDigest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "radarTitle" TEXT NOT NULL,
    "radarWhy" TEXT NOT NULL,
    "radarAction" TEXT NOT NULL,
    "focusGuardrail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocalEventDigest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LocalEventItem" (
    "id" TEXT NOT NULL,
    "digestId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "whyItMatters" TEXT NOT NULL,
    "theme" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "distanceTier" TEXT NOT NULL,
    "city" TEXT,
    "venue" TEXT,
    "startsOn" TEXT,
    "endsOn" TEXT,
    "dayFit" TEXT NOT NULL,
    "driveMinutes" INTEGER,
    "sourceLabel" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "relevanceScore" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "confidence" TEXT NOT NULL DEFAULT 'confirmed',
    "status" TEXT NOT NULL DEFAULT 'new',
    "loggedActivityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocalEventItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LocalEventDigest_userId_date_key" ON "LocalEventDigest"("userId", "date");
CREATE INDEX "LocalEventDigest_userId_date_idx" ON "LocalEventDigest"("userId", "date");
CREATE INDEX "LocalEventItem_digestId_status_idx" ON "LocalEventItem"("digestId", "status");
CREATE INDEX "LocalEventItem_digestId_startsOn_idx" ON "LocalEventItem"("digestId", "startsOn");

ALTER TABLE "LocalEventDigest" ADD CONSTRAINT "LocalEventDigest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LocalEventItem" ADD CONSTRAINT "LocalEventItem_digestId_fkey" FOREIGN KEY ("digestId") REFERENCES "LocalEventDigest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
