-- Permanent YouTube watch history for Learning (no repeat on regenerate).
CREATE TABLE "LearningWatchedVideo" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "title" TEXT,
    "watchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearningWatchedVideo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LearningWatchedVideo_userId_videoId_key" ON "LearningWatchedVideo"("userId", "videoId");
CREATE INDEX "LearningWatchedVideo_userId_watchedAt_idx" ON "LearningWatchedVideo"("userId", "watchedAt");

ALTER TABLE "LearningWatchedVideo" ADD CONSTRAINT "LearningWatchedVideo_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
