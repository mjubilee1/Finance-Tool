-- Daily learning intent + pasteable YouTube Premium custom-feed prompt
ALTER TABLE "LearningYoutubeDigest" ADD COLUMN "dailyScript" TEXT;
ALTER TABLE "LearningYoutubeDigest" ADD COLUMN "customFeedPrompt" TEXT;
