export type ParsedPlaidError = {
  errorType?: string;
  errorCode?: string;
  errorMessage?: string;
  displayMessage?: string;
};

const LOGIN_REQUIRED_CODES = new Set([
  "ITEM_LOGIN_REQUIRED",
  "OAUTH_INVALID_TOKEN",
]);

const REVOKED_CODES = new Set([
  "USER_PERMISSION_REVOKED",
  "ITEM_NOT_FOUND",
  "INVALID_ACCESS_TOKEN",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parsePlaidError(error: unknown): ParsedPlaidError | null {
  if (!isRecord(error)) return null;

  const response = isRecord(error.response) ? error.response : null;
  const data = response && isRecord(response.data) ? response.data : error;

  const errorCode = typeof data.error_code === "string" ? data.error_code : undefined;
  const errorType = typeof data.error_type === "string" ? data.error_type : undefined;
  const errorMessage = typeof data.error_message === "string" ? data.error_message : undefined;
  const displayMessage =
    typeof data.display_message === "string" ? data.display_message : undefined;

  if (!errorCode && !errorMessage) return null;

  return { errorType, errorCode, errorMessage, displayMessage };
}

export function isPlaidLoginRequired(error: unknown) {
  const parsed = parsePlaidError(error);
  return parsed?.errorCode ? LOGIN_REQUIRED_CODES.has(parsed.errorCode) : false;
}

export function isPlaidAccessRevoked(error: unknown) {
  const parsed = parsePlaidError(error);
  return parsed?.errorCode ? REVOKED_CODES.has(parsed.errorCode) : false;
}

export function plaidErrorUserMessage(error: unknown, institutionName?: string | null) {
  const parsed = parsePlaidError(error);
  const bank = institutionName ?? "your bank";

  if (parsed?.errorCode && LOGIN_REQUIRED_CODES.has(parsed.errorCode)) {
    return `${bank} needs you to sign in again. Tap Reconnect to restore sync.`;
  }

  if (parsed?.errorCode && REVOKED_CODES.has(parsed.errorCode)) {
    return `${bank} access was revoked. Reconnect to link it again.`;
  }

  if (parsed?.displayMessage) return parsed.displayMessage;
  if (parsed?.errorMessage) return parsed.errorMessage;

  return `Could not sync ${bank}. Try reconnecting the account.`;
}
