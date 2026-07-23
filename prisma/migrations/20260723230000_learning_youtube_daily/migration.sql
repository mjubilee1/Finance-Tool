-- Daily YouTube learning picks + auto-queue settings.
ALTER TABLE "LearningPlanSettings" ADD COLUMN "autoQueueYoutube" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "LearningContentItem" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "LearningContentItem" ADD COLUMN "externalId" TEXT;

CREATE INDEX "LearningContentItem_userId_externalId_idx" ON "LearningContentItem"("userId", "externalId");

CREATE TABLE "LearningYoutubeDigest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "autoQueued" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningYoutubeDigest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LearningYoutubePick" (
    "id" TEXT NOT NULL,
    "digestId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "channelLabel" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "summary" TEXT,
    "relevanceScore" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "status" TEXT NOT NULL DEFAULT 'suggested',
    "queuedItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningYoutubePick_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LearningYoutubeDigest_userId_date_key" ON "LearningYoutubeDigest"("userId", "date");
CREATE INDEX "LearningYoutubeDigest_userId_date_idx" ON "LearningYoutubeDigest"("userId", "date");
CREATE INDEX "LearningYoutubePick_digestId_status_idx" ON "LearningYoutubePick"("digestId", "status");
CREATE INDEX "LearningYoutubePick_videoId_idx" ON "LearningYoutubePick"("videoId");

ALTER TABLE "LearningYoutubeDigest" ADD CONSTRAINT "LearningYoutubeDigest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LearningYoutubePick" ADD CONSTRAINT "LearningYoutubePick_digestId_fkey" FOREIGN KEY ("digestId") REFERENCES "LearningYoutubeDigest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
