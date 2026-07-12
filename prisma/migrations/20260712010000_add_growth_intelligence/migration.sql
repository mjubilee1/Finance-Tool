-- CreateTable
CREATE TABLE "GrowthActivity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "leverage" TEXT NOT NULL DEFAULT 'long_term_leverage',
    "minutesSpent" INTEGER,
    "impactScore" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrowthActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrowthContact" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relationshipType" TEXT,
    "trustLevel" INTEGER NOT NULL DEFAULT 3,
    "sharedInterests" TEXT,
    "collaborationPotential" INTEGER NOT NULL DEFAULT 3,
    "lastContactDate" TEXT,
    "suggestedNextAction" TEXT,
    "mutualValue" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrowthContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrowthSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "compoundingScore" DOUBLE PRECISION NOT NULL,
    "careerScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "startupScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "financialScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "socialScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fitnessScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "personalScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bottlenecks" TEXT[],
    "improving" BOOLEAN NOT NULL DEFAULT false,
    "metricsJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrowthSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrowthRecommendation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "whyItMatters" TEXT NOT NULL,
    "longTermBenefit" TEXT NOT NULL,
    "timeRequiredMinutes" INTEGER NOT NULL DEFAULT 60,
    "opportunityCost" TEXT NOT NULL,
    "relatedGoals" TEXT[],
    "relatedPeople" TEXT[],
    "nextActions" TEXT[],
    "leverageType" TEXT NOT NULL DEFAULT 'long_term_leverage',
    "domain" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrowthRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyGrowthReview" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekStart" TEXT NOT NULL,
    "whatWorked" TEXT[],
    "whatDidnt" TEXT[],
    "biggestReturn" TEXT,
    "timeWasted" TEXT,
    "stopDoing" TEXT[],
    "doMore" TEXT[],
    "relationshipsImproved" TEXT[],
    "goalsBehind" TEXT[],
    "biggestBottleneck" TEXT,
    "adjustments" TEXT[],
    "compoundingScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyGrowthReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrowthOpportunity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "domain" TEXT,
    "relatedPeople" TEXT[],
    "urgency" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'open',
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrowthOpportunity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GrowthActivity_userId_date_idx" ON "GrowthActivity"("userId", "date");

-- CreateIndex
CREATE INDEX "GrowthContact_userId_status_idx" ON "GrowthContact"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "GrowthSnapshot_userId_date_key" ON "GrowthSnapshot"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "GrowthRecommendation_userId_date_key" ON "GrowthRecommendation"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyGrowthReview_userId_weekStart_key" ON "WeeklyGrowthReview"("userId", "weekStart");

-- CreateIndex
CREATE INDEX "GrowthOpportunity_userId_status_idx" ON "GrowthOpportunity"("userId", "status");

-- AddForeignKey
ALTER TABLE "GrowthActivity" ADD CONSTRAINT "GrowthActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowthContact" ADD CONSTRAINT "GrowthContact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowthSnapshot" ADD CONSTRAINT "GrowthSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowthRecommendation" ADD CONSTRAINT "GrowthRecommendation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyGrowthReview" ADD CONSTRAINT "WeeklyGrowthReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowthOpportunity" ADD CONSTRAINT "GrowthOpportunity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
