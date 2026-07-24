-- Hands-free drive play: auto-start continuous Learning queue.
ALTER TABLE "LearningPlanSettings" ADD COLUMN "autoStartYoutube" BOOLEAN NOT NULL DEFAULT true;
