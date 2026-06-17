import crypto from "crypto";

// Use a dedicated key when set. Falls back to NEXTAUTH_SECRET for older setups.
const ENCRYPTION_KEY =
  process.env.TOKEN_ENCRYPTION_KEY ||
  process.env.NEXTAUTH_SECRET ||
  process.env.PLAID_SECRET ||
  "default_fallback_key_for_dev_only";
const ALGORITHM = "aes-256-gcm";

export function isTokenDecryptError(error: unknown) {
  return (
    error instanceof Error &&
    (error.message.includes("Unsupported state or unable to authenticate data") ||
      error.message.includes("Invalid encrypted format"))
  );
}

export function tokenDecryptErrorMessage() {
  return "Could not read saved bank credentials. This usually means the bank was linked in a different environment (e.g. production) than the one you're using now, or NEXTAUTH_SECRET / TOKEN_ENCRYPTION_KEY differs between them. Use the same encryption key everywhere that shares one database, or reconnect banks from this environment.";
}

function getCipherKey(key: string) {
  return crypto.createHash("sha256").update(key).digest();
}

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, getCipherKey(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();
  
  return `${iv.toString("hex")}:${encrypted}:${authTag.toString("hex")}`;
}

export function decrypt(text: string): string {
  const parts = text.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted format");
  
  const [ivHex, encryptedText, authTagHex] = parts;
  const decipher = crypto.createDecipheriv(ALGORITHM, getCipherKey(ENCRYPTION_KEY), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  
  let decrypted = decipher.update(encryptedText, "hex", "utf8");
  decrypted += decipher.final("utf8");
  
  return decrypted;
}
