import { prisma } from "@/lib/prisma";
import { decrypt, encrypt, isTokenDecryptError } from "@/lib/encryption";

export const GOOGLE_CALENDAR_READONLY_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
export const GOOGLE_CALENDAR_EVENTS_SCOPE = "https://www.googleapis.com/auth/calendar.events";
export const GOOGLE_CALENDAR_OAUTH_STATE_COOKIE = "google_calendar_oauth_state";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars";

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type GoogleCalendarApiEvent = {
  id?: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  start?: {
    date?: string;
    dateTime?: string;
    timeZone?: string;
  };
  end?: {
    date?: string;
    dateTime?: string;
    timeZone?: string;
  };
};

export type CreateGoogleCalendarEventInput = {
  summary: string;
  start: string;
  end: string;
  allDay?: boolean;
  timeZone?: string;
  location?: string | null;
  description?: string | null;
};

export type GoogleCalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string | null;
  allDay: boolean;
  location: string | null;
  description: string | null;
  htmlLink: string | null;
};

export type GoogleCalendarStatus = {
  connected: boolean;
  connectAvailable: boolean;
  status: "active" | "needs_reconnect" | "not_connected";
  connectedAt: string | null;
  lastSyncAt: string | null;
};

function getGoogleCalendarCredentials() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Google Calendar OAuth is not configured.");
  }

  return { clientId, clientSecret };
}

function scopesFrom(scope: string | undefined, fallback = [GOOGLE_CALENDAR_EVENTS_SCOPE]) {
  return scope?.split(" ").filter(Boolean) ?? fallback;
}

function hasCalendarEventWriteScope(scopes: string[]) {
  return scopes.includes(GOOGLE_CALENDAR_EVENTS_SCOPE) || scopes.includes("https://www.googleapis.com/auth/calendar");
}

function expiresAtFrom(expiresIn: number | undefined) {
  if (!expiresIn) return null;
  return new Date(Date.now() + Math.max(0, expiresIn - 60) * 1000);
}

function tryDecryptToken(ciphertext: string) {
  try {
    return decrypt(ciphertext);
  } catch (error) {
    if (isTokenDecryptError(error)) return null;
    throw error;
  }
}

async function markGoogleCalendarNeedsReconnect(userId: string) {
  await prisma.googleCalendarConnection.update({
    where: { userId },
    data: { status: "needs_reconnect" },
  });
}

async function purgeUnreadableGoogleCalendarConnection(userId: string) {
  await prisma.googleCalendarConnection.deleteMany({ where: { userId } });
}

async function handleUnreadableCalendarTokens(userId: string): Promise<null> {
  await purgeUnreadableGoogleCalendarConnection(userId);
  return null;
}

export function isGoogleCalendarConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export async function getGoogleCalendarStatus(userId: string): Promise<GoogleCalendarStatus> {
  const connection = await prisma.googleCalendarConnection.findUnique({ where: { userId } });
  if (!connection) {
    return {
      connected: false,
      connectAvailable: isGoogleCalendarConfigured(),
      status: "not_connected",
      connectedAt: null,
      lastSyncAt: null,
    };
  }

  const hasWriteScope = hasCalendarEventWriteScope(connection.scopes);
  const tokensReadable =
    Boolean(tryDecryptToken(connection.encryptedAccessToken)) &&
    (!connection.encryptedRefreshToken || Boolean(tryDecryptToken(connection.encryptedRefreshToken)));

  if (!tokensReadable) {
    await purgeUnreadableGoogleCalendarConnection(userId);
    return {
      connected: false,
      connectAvailable: isGoogleCalendarConfigured(),
      status: "not_connected",
      connectedAt: null,
      lastSyncAt: null,
    };
  }

  const status =
    connection.status === "needs_reconnect" || !hasWriteScope ? "needs_reconnect" : "active";

  return {
    connected: status === "active",
    connectAvailable: isGoogleCalendarConfigured(),
    status,
    connectedAt: connection.connectedAt.toISOString(),
    lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
  };
}

export function getGoogleCalendarRedirectUri(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = (process.env.NEXTAUTH_URL || requestUrl.origin).replace(/\/$/, "");
  const configured = process.env.GOOGLE_CALENDAR_REDIRECT_URI?.trim();

  // Ignore localhost redirect URIs in production — common Vercel misconfig when .env is copied verbatim.
  if (
    configured &&
    !(process.env.NODE_ENV === "production" && configured.includes("localhost"))
  ) {
    return configured;
  }

  return `${origin}/api/integrations/google-calendar/callback`;
}

export function buildGoogleCalendarAuthUrl(state: string, redirectUri: string) {
  const { clientId } = getGoogleCalendarCredentials();
  const url = new URL(GOOGLE_AUTH_URL);

  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_CALENDAR_EVENTS_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);

  return url;
}

export async function exchangeGoogleCalendarCode(code: string, redirectUri: string) {
  const { clientId, clientSecret } = getGoogleCalendarCredentials();
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const token = (await response.json().catch(() => null)) as GoogleTokenResponse | null;
  if (!response.ok || !token?.access_token) {
    throw new Error("Google Calendar authorization failed.");
  }

  return token;
}

export async function saveGoogleCalendarConnection(userId: string, token: GoogleTokenResponse) {
  if (!token.access_token) {
    throw new Error("Google Calendar authorization did not return an access token.");
  }

  const existing = await prisma.googleCalendarConnection.findUnique({ where: { userId } });
  const reusableRefreshToken =
    existing?.encryptedRefreshToken && tryDecryptToken(existing.encryptedRefreshToken)
      ? existing.encryptedRefreshToken
      : null;
  const encryptedRefreshToken = token.refresh_token
    ? encrypt(token.refresh_token)
    : reusableRefreshToken;

  // Access token alone is enough to create/read events for ~1 hour.
  // needs_reconnect only when we truly have nothing usable.
  const status =
    encryptedRefreshToken || token.access_token ? "active" : "needs_reconnect";

  await prisma.googleCalendarConnection.upsert({
    where: { userId },
    create: {
      userId,
      encryptedAccessToken: encrypt(token.access_token),
      encryptedRefreshToken,
      accessTokenExpiresAt: expiresAtFrom(token.expires_in),
      scopes: scopesFrom(token.scope),
      status,
      connectedAt: new Date(),
    },
    update: {
      encryptedAccessToken: encrypt(token.access_token),
      encryptedRefreshToken,
      accessTokenExpiresAt: expiresAtFrom(token.expires_in),
      scopes: scopesFrom(token.scope),
      status,
      connectedAt: new Date(),
    },
  });
}

async function refreshGoogleCalendarAccessToken(
  userId: string,
  encryptedRefreshToken: string,
  fallbackScopes: string[],
) {
  const refreshToken = tryDecryptToken(encryptedRefreshToken);
  if (!refreshToken) {
    return handleUnreadableCalendarTokens(userId);
  }

  const { clientId, clientSecret } = getGoogleCalendarCredentials();
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const token = (await response.json().catch(() => null)) as GoogleTokenResponse | null;
  if (!response.ok || !token?.access_token) {
    await markGoogleCalendarNeedsReconnect(userId);
    throw new Error("Google Calendar needs to be reconnected.");
  }

  await prisma.googleCalendarConnection.update({
    where: { userId },
    data: {
      encryptedAccessToken: encrypt(token.access_token),
      accessTokenExpiresAt: expiresAtFrom(token.expires_in),
      scopes: scopesFrom(token.scope, fallbackScopes),
      status: "active",
    },
  });

  return token.access_token;
}

async function getActiveGoogleCalendarAccessToken(userId: string) {
  const connection = await prisma.googleCalendarConnection.findUnique({ where: { userId } });
  if (!connection) return null;

  const expiresAt = connection.accessTokenExpiresAt?.getTime();
  if (expiresAt && expiresAt > Date.now() + 60_000) {
    const accessToken = tryDecryptToken(connection.encryptedAccessToken);
    if (!accessToken) {
      return handleUnreadableCalendarTokens(userId);
    }
    if (connection.status !== "active") {
      await prisma.googleCalendarConnection.update({
        where: { userId },
        data: { status: "active" },
      });
    }
    return accessToken;
  }

  if (!connection.encryptedRefreshToken) {
    await markGoogleCalendarNeedsReconnect(userId);
    return null;
  }

  return refreshGoogleCalendarAccessToken(userId, connection.encryptedRefreshToken, connection.scopes);
}

function normalizeCalendarEvent(event: GoogleCalendarApiEvent): GoogleCalendarEvent | null {
  const start = event.start?.dateTime ?? event.start?.date;
  if (!event.id || !start || event.status === "cancelled") return null;

  return {
    id: event.id,
    title: event.summary?.trim() || "Busy",
    start,
    end: event.end?.dateTime ?? event.end?.date ?? null,
    allDay: Boolean(event.start?.date),
    location: event.location?.trim() || null,
    description: event.description?.trim() || null,
    htmlLink: event.htmlLink ?? null,
  };
}

export async function fetchUpcomingGoogleCalendarEvents(
  userId: string,
  options: {
    timeMin: Date;
    timeMax: Date;
    maxResults?: number;
  },
) {
  const accessToken = await getActiveGoogleCalendarAccessToken(userId);
  if (!accessToken) {
    return {
      ...(await getGoogleCalendarStatus(userId)),
      events: [] as GoogleCalendarEvent[],
    };
  }

  const url = new URL(`${GOOGLE_CALENDAR_EVENTS_URL}/primary/events`);
  url.searchParams.set("timeMin", options.timeMin.toISOString());
  url.searchParams.set("timeMax", options.timeMax.toISOString());
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", String(options.maxResults ?? 10));
  url.searchParams.set("fields", "items(id,status,summary,description,location,htmlLink,start,end)");

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.status === 401 || response.status === 403) {
    await prisma.googleCalendarConnection.update({
      where: { userId },
      data: { status: "needs_reconnect" },
    });
    throw new Error("Google Calendar needs to be reconnected.");
  }

  if (!response.ok) {
    throw new Error("Could not load Google Calendar events.");
  }

  const data = (await response.json()) as { items?: GoogleCalendarApiEvent[] };
  await prisma.googleCalendarConnection.update({
    where: { userId },
    data: { lastSyncAt: new Date(), status: "active" },
  });

  return {
    ...(await getGoogleCalendarStatus(userId)),
    events: (data.items ?? []).map(normalizeCalendarEvent).filter((event): event is GoogleCalendarEvent => Boolean(event)),
  };
}

export async function createGoogleCalendarEvent(userId: string, input: CreateGoogleCalendarEventInput) {
  const connection = await prisma.googleCalendarConnection.findUnique({ where: { userId } });
  if (!connection) {
    throw new Error("Connect Google Calendar on Overview before I can create events.");
  }

  if (!hasCalendarEventWriteScope(connection.scopes)) {
    await prisma.googleCalendarConnection.update({
      where: { userId },
      data: { status: "needs_reconnect" },
    });
    throw new Error("Reconnect Google Calendar so I can create events, not just read them.");
  }

  const accessToken = await getActiveGoogleCalendarAccessToken(userId);
  if (!accessToken) {
    const status = await getGoogleCalendarStatus(userId);
    throw new Error(
      status.status === "not_connected"
        ? "Connect Google Calendar on Overview before I can create events."
        : "Reconnect Google Calendar on Overview — the saved token expired or needs fresh approval.",
    );
  }

  const eventBody = input.allDay
    ? {
        summary: input.summary,
        location: input.location ?? undefined,
        description: input.description ?? undefined,
        start: { date: input.start },
        end: { date: input.end },
      }
    : {
        summary: input.summary,
        location: input.location ?? undefined,
        description: input.description ?? undefined,
        start: { dateTime: input.start, timeZone: input.timeZone },
        end: { dateTime: input.end, timeZone: input.timeZone },
      };

  const response = await fetch(`${GOOGLE_CALENDAR_EVENTS_URL}/primary/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(eventBody),
  });

  if (response.status === 401 || response.status === 403) {
    await prisma.googleCalendarConnection.update({
      where: { userId },
      data: { status: "needs_reconnect" },
    });
    throw new Error("Google Calendar needs to be reconnected before I can create events.");
  }

  if (!response.ok) {
    throw new Error("Google Calendar could not create that event.");
  }

  const event = (await response.json()) as GoogleCalendarApiEvent;
  await prisma.googleCalendarConnection.update({
    where: { userId },
    data: { lastSyncAt: new Date(), status: "active" },
  });

  return normalizeCalendarEvent(event);
}

export async function disconnectGoogleCalendar(userId: string) {
  await prisma.googleCalendarConnection.deleteMany({ where: { userId } });
}
