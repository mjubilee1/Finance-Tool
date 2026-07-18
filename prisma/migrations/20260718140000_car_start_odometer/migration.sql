-- Ownership-start odometer for lifespan / maintenance schedule tracking
ALTER TABLE "CarProfile" ADD COLUMN IF NOT EXISTS "startOdometerMiles" DOUBLE PRECISION NOT NULL DEFAULT 20323;

-- Align current-odometer default with ownership start (20,323 mi)
ALTER TABLE "CarProfile" ALTER COLUMN "odometerMiles" SET DEFAULT 20323;
