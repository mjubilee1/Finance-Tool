const REMEMBER_UNTIL_KEY = "app_unlocked_until";
const SESSION_UNLOCK_KEY = "app_unlocked";
const DEFAULT_REMEMBER_DAYS = 30;

export function isDeviceRemembered(): boolean {
  if (typeof window === "undefined") return false;

  const until = localStorage.getItem(REMEMBER_UNTIL_KEY);
  if (!until) return false;

  const expiresAt = Number(until);
  if (!Number.isFinite(expiresAt) || Date.now() >= expiresAt) {
    localStorage.removeItem(REMEMBER_UNTIL_KEY);
    return false;
  }

  return true;
}

export function isSessionUnlocked(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(SESSION_UNLOCK_KEY) === "true";
}

export function isAppUnlocked(): boolean {
  return isSessionUnlocked() || isDeviceRemembered();
}

export function unlockApp(rememberDevice = false, rememberDays = DEFAULT_REMEMBER_DAYS) {
  if (typeof window === "undefined") return;

  sessionStorage.setItem(SESSION_UNLOCK_KEY, "true");

  if (rememberDevice) {
    const expiresAt = Date.now() + rememberDays * 24 * 60 * 60 * 1000;
    localStorage.setItem(REMEMBER_UNTIL_KEY, String(expiresAt));
  }
}

export function clearAppUnlock() {
  if (typeof window === "undefined") return;

  sessionStorage.removeItem(SESSION_UNLOCK_KEY);
  localStorage.removeItem(REMEMBER_UNTIL_KEY);
}
