-- Store Trell's connected Google Calendar tokens separately from app login.
CREATE TABLE "GoogleCalendarConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL DEFAULT 'primary',
    "encryptedAccessToken" TEXT NOT NULL,
    "encryptedRefreshToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "scopes" TEXT[] NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleCalendarConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GoogleCalendarConnection_userId_key" ON "GoogleCalendarConnection"("userId");
CREATE INDEX "GoogleCalendarConnection_userId_status_idx" ON "GoogleCalendarConnection"("userId", "status");

ALTER TABLE "GoogleCalendarConnection" ADD CONSTRAINT "GoogleCalendarConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
