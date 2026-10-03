import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

export { FINANCIAL_VAULT_TABS, isFinancialVaultTab } from "@/lib/financial-vault-tabs";

export const FINANCIAL_VAULT_COOKIE = "financial_vault_unlock";
/** How long Money stays unlocked after entering the code (browser cookie). */
const VAULT_TTL_MS = 8 * 60 * 60 * 1000;

export function isFinancialVaultConfigured() {
  return Boolean(process.env.FINANCIAL_VAULT_CODE?.trim());
}

function vaultSecret() {
  return (
    process.env.FINANCIAL_VAULT_CODE?.trim() ||
    process.env.NEXTAUTH_SECRET ||
    process.env.TOKEN_ENCRYPTION_KEY ||
    ""
  );
}

function signUnlockPayload(userId: string, expiresAt: number) {
  const secret = vaultSecret();
  const payload = `${userId}.${expiresAt}`;
  const signature = createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

export function verifyFinancialVaultCode(code: string) {
  const expected = process.env.FINANCIAL_VAULT_CODE?.trim();
  if (!expected) return false;

  const a = Buffer.from(code);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;

  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function createFinancialVaultUnlockValue(userId: string) {
  const expiresAt = Date.now() + VAULT_TTL_MS;
  return {
    value: signUnlockPayload(userId, expiresAt),
    expiresAt: new Date(expiresAt),
    maxAgeSeconds: Math.floor(VAULT_TTL_MS / 1000),
  };
}

export function readFinancialVaultUnlockValue(raw: string | undefined, userId: string) {
  if (!raw) return false;

  const parts = raw.split(".");
  if (parts.length !== 3) return false;

  const [cookieUserId, expiresRaw, signature] = parts;
  if (!cookieUserId || !expiresRaw || !signature) return false;
  if (cookieUserId !== userId) return false;

  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || Date.now() >= expiresAt) return false;

  const expected = signUnlockPayload(userId, expiresAt);
  const expectedSig = expected.split(".")[2] ?? "";

  try {
    return timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expectedSig, "hex"));
  } catch {
    return false;
  }
}

/**
 * When vault is configured, Money/Coach financial context requires unlock cookie.
 * When not configured, everything stays open (local/dev without the env var).
 */
export async function isFinancialVaultUnlocked(userId: string) {
  if (!isFinancialVaultConfigured()) return true;

  const jar = await cookies();
  const raw = jar.get(FINANCIAL_VAULT_COOKIE)?.value;
  return readFinancialVaultUnlockValue(raw, userId);
}

export async function getFinancialVaultStatus(userId: string) {
  const configured = isFinancialVaultConfigured();
  const unlocked = configured ? await isFinancialVaultUnlocked(userId) : true;

  return {
    configured,
    unlocked,
    locked: configured && !unlocked,
  };
}
