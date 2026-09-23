-- Builder-first contact types, heat tags, and a dated next step.
ALTER TABLE "GrowthContact" ADD COLUMN IF NOT EXISTS "nextActionDate" TEXT;
ALTER TABLE "GrowthContact" ADD COLUMN IF NOT EXISTS "asksOffers" TEXT;

-- Old buckets → builder / personal lanes
UPDATE "GrowthContact"
SET "relationshipType" = CASE lower(trim(coalesce("relationshipType", '')))
  WHEN 'founder' THEN 'founder'
  WHEN 'investor' THEN 'investor'
  WHEN 'colleague' THEN 'operator_buyer'
  WHEN 'tenant' THEN 'operator_buyer'
  WHEN 'peer' THEN 'tech_peer'
  WHEN 'mentor' THEN 'connector'
  WHEN 'social' THEN 'social'
  WHEN 'dating' THEN 'dating'
  WHEN 'family' THEN 'family'
  WHEN 'other' THEN 'unlabeled'
  WHEN 'unlabeled' THEN 'unlabeled'
  WHEN '' THEN 'unlabeled'
  ELSE coalesce(nullif(trim("relationshipType"), ''), 'unlabeled')
END;

-- fading → quiet
UPDATE "GrowthContact"
SET "status" = 'quiet'
WHERE lower(trim(coalesce("status", ''))) = 'fading';

-- Heat from last contact (leave explicit dormant alone)
UPDATE "GrowthContact"
SET "status" = CASE
  WHEN lower(trim(coalesce("status", ''))) = 'dormant' THEN 'dormant'
  WHEN "lastContactDate" IS NULL OR trim("lastContactDate") = '' THEN
    CASE
      WHEN "relationshipType" IN (
        'founder', 'operator_buyer', 'investor', 'tech_peer',
        'connector', 'media_events', 'candidate'
      ) THEN 'warm'
      ELSE 'quiet'
    END
  WHEN "lastContactDate" >= to_char(CURRENT_DATE - INTERVAL '14 days', 'YYYY-MM-DD') THEN 'active'
  WHEN "lastContactDate" >= to_char(CURRENT_DATE - INTERVAL '30 days', 'YYYY-MM-DD') THEN 'warm'
  WHEN "lastContactDate" >= to_char(CURRENT_DATE - INTERVAL '90 days', 'YYYY-MM-DD') THEN 'quiet'
  ELSE 'dormant'
END
WHERE lower(trim(coalesce("status", ''))) <> 'dormant'
   OR "status" IS NULL;

-- Kick the builder chase list: one line due this week if they have no next step yet
UPDATE "GrowthContact"
SET
  "suggestedNextAction" = CASE "relationshipType"
    WHEN 'founder' THEN 'Log their stage + what they need help with'
    WHEN 'operator_buyer' THEN 'Ask what they are buying / piloting next'
    WHEN 'connector' THEN 'Ask who they would intro you to this week'
    ELSE 'Send one focused follow-up'
  END,
  "nextActionDate" = to_char(CURRENT_DATE, 'YYYY-MM-DD')
WHERE "relationshipType" IN ('founder', 'operator_buyer', 'connector')
  AND "status" IN ('active', 'warm', 'quiet')
  AND ("suggestedNextAction" IS NULL OR trim("suggestedNextAction") = '')
  AND ("nextActionDate" IS NULL OR trim("nextActionDate") = '');

CREATE INDEX IF NOT EXISTS "GrowthContact_userId_relationshipType_idx"
  ON "GrowthContact"("userId", "relationshipType");

CREATE INDEX IF NOT EXISTS "GrowthContact_userId_lastContactDate_idx"
  ON "GrowthContact"("userId", "lastContactDate");
