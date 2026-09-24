import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { decrypt, encrypt, isTokenDecryptError } from "@/lib/encryption";

/** Read existing Drive files (search / list / export). Narrower than full `drive`. */
export const GOOGLE_DRIVE_READONLY_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
export const GOOGLE_DRIVE_OAUTH_STATE_COOKIE = "google_drive_oauth_state";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";

const EXPORT_MIME: Record<string, string> = {
  "application/vnd.google-apps.document": "text/markdown",
  "application/vnd.google-apps.spreadsheet": "text/csv",
  "application/vnd.google-apps.presentation": "text/plain",
};

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type GoogleDriveApiFile = {
  id?: string;
  name?: string;
  mimeType?: string;
  modifiedTime?: string;
  webViewLink?: string;
  iconLink?: string;
  size?: string;
  parents?: string[];
};

export type GoogleDriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string | null;
  webViewLink: string | null;
  size: number | null;
};

export type GoogleDriveStatus = {
  connected: boolean;
  connectAvailable: boolean;
  status: "active" | "needs_reconnect" | "not_connected";
  connectedAt: string | null;
  lastSyncAt: string | null;
};

function oauthStateSecret() {
  return process.env.NEXTAUTH_SECRET || process.env.TOKEN_ENCRYPTION_KEY || "";
}

export function createGoogleDriveOAuthState() {
  const nonce = randomBytes(24).toString("hex");
  const secret = oauthStateSecret();
  if (!secret) return nonce;
  const signature = createHmac("sha256", secret).update(nonce).digest("hex");
  return `${nonce}.${signature}`;
}

export function verifyGoogleDriveOAuthState(state: string | null | undefined) {
  if (!state) return false;

  const secret = oauthStateSecret();
  if (!secret) return false;

  const dot = state.lastIndexOf(".");
  if (dot <= 0) return false;

  const nonce = state.slice(0, dot);
  const signature = state.slice(dot + 1);
  const expected = createHmac("sha256", secret).update(nonce).digest("hex");

  try {
    return timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

function getGoogleDriveCredentials() {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_SECRET || process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Google Drive OAuth is not configured.");
  }

  return { clientId, clientSecret };
}

function scopesFrom(scope: string | undefined, fallback = [GOOGLE_DRIVE_READONLY_SCOPE]) {
  return scope?.split(" ").filter(Boolean) ?? fallback;
}

function hasDriveReadonlyScope(scopes: string[]) {
  return (
    scopes.includes(GOOGLE_DRIVE_READONLY_SCOPE) ||
    scopes.includes("https://www.googleapis.com/auth/drive") ||
    scopes.includes("https://www.googleapis.com/auth/drive.file")
  );
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

async function markGoogleDriveNeedsReconnect(userId: string) {
  await prisma.googleDriveConnection.update({
    where: { userId },
    data: { status: "needs_reconnect" },
  });
}

async function purgeUnreadableGoogleDriveConnection(userId: string) {
  await prisma.googleDriveConnection.deleteMany({ where: { userId } });
}

async function handleUnreadableDriveTokens(userId: string): Promise<null> {
  await purgeUnreadableGoogleDriveConnection(userId);
  return null;
}

export function isGoogleDriveConfigured() {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_SECRET || process.env.GOOGLE_CLIENT_SECRET;
  return Boolean(clientId && clientSecret);
}

export async function getGoogleDriveStatus(userId: string): Promise<GoogleDriveStatus> {
  const connection = await prisma.googleDriveConnection.findUnique({ where: { userId } });
  if (!connection) {
    return {
      connected: false,
      connectAvailable: isGoogleDriveConfigured(),
      status: "not_connected",
      connectedAt: null,
      lastSyncAt: null,
    };
  }

  const hasScope = hasDriveReadonlyScope(connection.scopes);
  const tokensReadable =
    Boolean(tryDecryptToken(connection.encryptedAccessToken)) &&
    (!connection.encryptedRefreshToken || Boolean(tryDecryptToken(connection.encryptedRefreshToken)));

  if (!tokensReadable) {
    await purgeUnreadableGoogleDriveConnection(userId);
    return {
      connected: false,
      connectAvailable: isGoogleDriveConfigured(),
      status: "not_connected",
      connectedAt: null,
      lastSyncAt: null,
    };
  }

  const status =
    connection.status === "needs_reconnect" || !hasScope ? "needs_reconnect" : "active";

  return {
    connected: status === "active",
    connectAvailable: isGoogleDriveConfigured(),
    status,
    connectedAt: connection.connectedAt.toISOString(),
    lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
  };
}

export function getGoogleDriveRedirectUri(request: Request) {
  const requestUrl = new URL(request.url);
  const configured = process.env.GOOGLE_DRIVE_REDIRECT_URI?.trim();

  if (
    configured &&
    !(process.env.NODE_ENV === "production" && configured.includes("localhost"))
  ) {
    return configured;
  }

  const requestOrigin = requestUrl.origin.replace(/\/$/, "");
  const nextAuthOrigin = process.env.NEXTAUTH_URL?.replace(/\/$/, "");
  const origin =
    process.env.NODE_ENV === "production" && nextAuthOrigin?.includes("localhost")
      ? requestOrigin
      : nextAuthOrigin || requestOrigin;

  return `${origin}/api/integrations/google-drive/callback`;
}

export function buildGoogleDriveAuthUrl(
  state: string,
  redirectUri: string,
  options?: { forceConsent?: boolean },
) {
  const { clientId } = getGoogleDriveCredentials();
  const url = new URL(GOOGLE_AUTH_URL);

  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_DRIVE_READONLY_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  if (options?.forceConsent) {
    url.searchParams.set("prompt", "consent");
  }

  return url;
}

export async function exchangeGoogleDriveCode(code: string, redirectUri: string) {
  const { clientId, clientSecret } = getGoogleDriveCredentials();
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
    const detail =
      token?.error_description?.trim() ||
      token?.error?.trim() ||
      `HTTP ${response.status}`;
    throw new Error(`Google Drive authorization failed: ${detail}`);
  }

  return token;
}

export async function saveGoogleDriveConnection(userId: string, token: GoogleTokenResponse) {
  if (!token.access_token) {
    throw new Error("Google Drive authorization did not return an access token.");
  }

  const existing = await prisma.googleDriveConnection.findUnique({ where: { userId } });
  const reusableRefreshToken =
    existing?.encryptedRefreshToken && tryDecryptToken(existing.encryptedRefreshToken)
      ? existing.encryptedRefreshToken
      : null;
  const encryptedRefreshToken = token.refresh_token
    ? encrypt(token.refresh_token)
    : reusableRefreshToken;

  const status = encryptedRefreshToken || token.access_token ? "active" : "needs_reconnect";

  await prisma.googleDriveConnection.upsert({
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

async function refreshGoogleDriveAccessToken(
  userId: string,
  encryptedRefreshToken: string,
  fallbackScopes: string[],
) {
  const refreshToken = tryDecryptToken(encryptedRefreshToken);
  if (!refreshToken) {
    return handleUnreadableDriveTokens(userId);
  }

  const { clientId, clientSecret } = getGoogleDriveCredentials();
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
    await markGoogleDriveNeedsReconnect(userId);
    throw new Error("Google Drive needs to be reconnected.");
  }

  await prisma.googleDriveConnection.update({
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

async function getActiveGoogleDriveAccessToken(userId: string) {
  const connection = await prisma.googleDriveConnection.findUnique({ where: { userId } });
  if (!connection) return null;

  const expiresAt = connection.accessTokenExpiresAt?.getTime();
  if (expiresAt && expiresAt > Date.now() + 60_000) {
    const accessToken = tryDecryptToken(connection.encryptedAccessToken);
    if (!accessToken) {
      return handleUnreadableDriveTokens(userId);
    }
    if (connection.status !== "active") {
      await prisma.googleDriveConnection.update({
        where: { userId },
        data: { status: "active" },
      });
    }
    return accessToken;
  }

  if (!connection.encryptedRefreshToken) {
    await markGoogleDriveNeedsReconnect(userId);
    return null;
  }

  return refreshGoogleDriveAccessToken(userId, connection.encryptedRefreshToken, connection.scopes);
}

function normalizeDriveFile(file: GoogleDriveApiFile): GoogleDriveFile | null {
  if (!file.id || !file.name) return null;
  const size = file.size ? Number(file.size) : null;
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType ?? "application/octet-stream",
    modifiedTime: file.modifiedTime ?? null,
    webViewLink: file.webViewLink ?? null,
    size: Number.isFinite(size) ? size : null,
  };
}

async function driveFetchWithAuth(
  userId: string,
  url: URL | string,
  init?: RequestInit,
): Promise<Response> {
  const accessToken = await getActiveGoogleDriveAccessToken(userId);
  if (!accessToken) {
    throw new Error("Google Drive needs to be reconnected.");
  }

  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (response.status !== 401 && response.status !== 403) {
    return response;
  }

  const connection = await prisma.googleDriveConnection.findUnique({ where: { userId } });
  if (!connection?.encryptedRefreshToken) {
    await markGoogleDriveNeedsReconnect(userId);
    throw new Error("Google Drive needs to be reconnected.");
  }

  try {
    const refreshed = await refreshGoogleDriveAccessToken(
      userId,
      connection.encryptedRefreshToken,
      connection.scopes,
    );
    if (!refreshed) {
      throw new Error("Google Drive needs to be reconnected.");
    }
    const retry = await fetch(url, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${refreshed}`,
      },
    });
    if (retry.status === 401 || retry.status === 403) {
      await markGoogleDriveNeedsReconnect(userId);
      throw new Error("Google Drive needs to be reconnected.");
    }
    return retry;
  } catch (error) {
    if (error instanceof Error && error.message.includes("reconnected")) throw error;
    await markGoogleDriveNeedsReconnect(userId);
    throw new Error("Google Drive needs to be reconnected.");
  }
}

export async function listRecentGoogleDriveFiles(
  userId: string,
  options?: { maxResults?: number },
) {
  const accessToken = await getActiveGoogleDriveAccessToken(userId);
  if (!accessToken) {
    return {
      ...(await getGoogleDriveStatus(userId)),
      files: [] as GoogleDriveFile[],
    };
  }

  const url = new URL(GOOGLE_DRIVE_FILES_URL);
  url.searchParams.set("pageSize", String(options?.maxResults ?? 20));
  url.searchParams.set("orderBy", "modifiedTime desc");
  url.searchParams.set("spaces", "drive");
  url.searchParams.set("q", "trashed = false");
  url.searchParams.set(
    "fields",
    "files(id,name,mimeType,modifiedTime,webViewLink,size,parents)",
  );

  const response = await driveFetchWithAuth(userId, url);

  if (!response.ok) {
    throw new Error("Could not load Google Drive files.");
  }

  const data = (await response.json()) as { files?: GoogleDriveApiFile[] };
  await prisma.googleDriveConnection.update({
    where: { userId },
    data: { lastSyncAt: new Date(), status: "active" },
  });

  return {
    ...(await getGoogleDriveStatus(userId)),
    files: (data.files ?? [])
      .map(normalizeDriveFile)
      .filter((file): file is GoogleDriveFile => Boolean(file)),
  };
}

export async function searchGoogleDriveFiles(
  userId: string,
  query: string,
  options?: { maxResults?: number },
) {
  const trimmed = query.trim();
  if (!trimmed) {
    return listRecentGoogleDriveFiles(userId, options);
  }

  const accessToken = await getActiveGoogleDriveAccessToken(userId);
  if (!accessToken) {
    return {
      ...(await getGoogleDriveStatus(userId)),
      files: [] as GoogleDriveFile[],
    };
  }

  const escaped = trimmed.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const url = new URL(GOOGLE_DRIVE_FILES_URL);
  url.searchParams.set("pageSize", String(options?.maxResults ?? 20));
  url.searchParams.set("spaces", "drive");
  url.searchParams.set("q", `name contains '${escaped}' and trashed = false`);
  url.searchParams.set(
    "fields",
    "files(id,name,mimeType,modifiedTime,webViewLink,size,parents)",
  );

  const response = await driveFetchWithAuth(userId, url);

  if (!response.ok) {
    throw new Error("Could not search Google Drive.");
  }

  const data = (await response.json()) as { files?: GoogleDriveApiFile[] };
  await prisma.googleDriveConnection.update({
    where: { userId },
    data: { lastSyncAt: new Date(), status: "active" },
  });

  return {
    ...(await getGoogleDriveStatus(userId)),
    files: (data.files ?? [])
      .map(normalizeDriveFile)
      .filter((file): file is GoogleDriveFile => Boolean(file)),
  };
}

export async function readGoogleDriveFileContent(userId: string, fileId: string) {
  const id = fileId.trim();
  if (!id) {
    throw new Error("I need a Google Drive file id to read.");
  }

  const metaUrl = new URL(`${GOOGLE_DRIVE_FILES_URL}/${encodeURIComponent(id)}`);
  metaUrl.searchParams.set("fields", "id,name,mimeType,modifiedTime,webViewLink,size");

  const metaResponse = await driveFetchWithAuth(userId, metaUrl);
  if (metaResponse.status === 404) {
    throw new Error("That Google Drive file was not found.");
  }
  if (!metaResponse.ok) {
    throw new Error("Could not load that Google Drive file.");
  }

  const meta = (await metaResponse.json()) as GoogleDriveApiFile;
  const file = normalizeDriveFile(meta);
  if (!file) {
    throw new Error("Could not load that Google Drive file.");
  }

  const exportMime = EXPORT_MIME[file.mimeType];
  let contentUrl: string;
  if (exportMime) {
    contentUrl = `${GOOGLE_DRIVE_FILES_URL}/${encodeURIComponent(id)}/export?mimeType=${encodeURIComponent(exportMime)}`;
  } else if (file.mimeType.startsWith("text/") || file.mimeType === "application/json") {
    contentUrl = `${GOOGLE_DRIVE_FILES_URL}/${encodeURIComponent(id)}?alt=media`;
  } else {
    return {
      file,
      content: null as string | null,
      note: "Binary or unsupported type — open in Drive instead of inlining here.",
    };
  }

  const contentResponse = await driveFetchWithAuth(userId, contentUrl);
  if (!contentResponse.ok) {
    throw new Error("Could not read that Google Drive file.");
  }

  const raw = await contentResponse.text();
  // Cap so coach / API responses stay usable on phone.
  const maxChars = 80_000;
  const content = raw.length > maxChars ? `${raw.slice(0, maxChars)}\n\n…[truncated]` : raw;

  await prisma.googleDriveConnection.update({
    where: { userId },
    data: { lastSyncAt: new Date(), status: "active" },
  });

  return { file, content, note: null as string | null };
}

export async function disconnectGoogleDrive(userId: string) {
  await prisma.googleDriveConnection.deleteMany({ where: { userId } });
}
