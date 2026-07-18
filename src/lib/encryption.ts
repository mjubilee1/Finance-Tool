import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";

type KeyCandidate = {
  source:
    | "TOKEN_ENCRYPTION_KEY"
    | "NEXTAUTH_SECRET"
    | "PLAID_SECRET"
    | "PLAID_PROD_SECRET"
    | "PLAID_TEST_SECRET"
    | "fallback";
  value: string;
};

function collectKeyCandidates(): KeyCandidate[] {
  const candidates: KeyCandidate[] = [];
  const seen = new Set<string>();

  const push = (source: KeyCandidate["source"], value: string | undefined) => {
    if (!value || seen.has(value)) return;
    seen.add(value);
    candidates.push({ source, value });
  };

  push("TOKEN_ENCRYPTION_KEY", process.env.TOKEN_ENCRYPTION_KEY);
  push("NEXTAUTH_SECRET", process.env.NEXTAUTH_SECRET);
  push("PLAID_SECRET", process.env.PLAID_SECRET);
  push("PLAID_PROD_SECRET", process.env.PLAID_PROD_SECRET);
  push("PLAID_TEST_SECRET", process.env.PLAID_TEST_SECRET);
  if (candidates.length === 0) {
    push("fallback", "default_fallback_key_for_dev_only");
  }

  return candidates;
}

/** Primary key used for encrypt/decrypt — same priority as before. */
function primaryKey(): KeyCandidate {
  return collectKeyCandidates()[0]!;
}

function fingerprint(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function getCipherKey(key: string) {
  return crypto.createHash("sha256").update(key).digest();
}

function describeCiphertext(text: string) {
  const parts = text.split(":");
  return {
    partCount: parts.length,
    ivLen: parts[0]?.length ?? 0,
    payloadLen: parts[1]?.length ?? 0,
    tagLen: parts[2]?.length ?? 0,
    totalLen: text.length,
    looksValid: parts.length === 3 && Boolean(parts[0] && parts[1] && parts[2]),
  };
}

function decryptWithKey(text: string, key: string): string {
  const parts = text.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted format");

  const [ivHex, encryptedText, authTagHex] = parts;
  const decipher = crypto.createDecipheriv(ALGORITHM, getCipherKey(key), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));

  let decrypted = decipher.update(encryptedText, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/** Safe snapshot for logs — no secret material. */
export function getEncryptionDiagnostics() {
  const candidates = collectKeyCandidates();
  const primary = candidates[0]!;
  return {
    primarySource: primary.source,
    primaryFingerprint: fingerprint(primary.value),
    candidateSources: candidates.map((c) => c.source),
    candidateFingerprints: candidates.map((c) => ({
      source: c.source,
      fingerprint: fingerprint(c.value),
    })),
    hasTokenEncryptionKey: Boolean(process.env.TOKEN_ENCRYPTION_KEY),
    hasNextAuthSecret: Boolean(process.env.NEXTAUTH_SECRET),
    hasPlaidSecret: Boolean(process.env.PLAID_SECRET),
  };
}

export function isTokenDecryptError(error: unknown) {
  return (
    error instanceof Error &&
    (error.message.includes("Unsupported state or unable to authenticate data") ||
      error.message.includes("Invalid encrypted format") ||
      error.message.includes("TOKEN_DECRYPT_FAILED"))
  );
}

export function tokenDecryptErrorMessage() {
  return "Could not read saved bank credentials. Check server logs for [TOKEN CRYPTO] — compare key fingerprints across environments. Common causes: TOKEN_ENCRYPTION_KEY set in one place but not another, or banks linked under a different key than this deploy uses.";
}

export function calendarTokenDecryptErrorMessage() {
  return "Reconnect Google Calendar on Overview. The saved calendar token can’t be read here — check [TOKEN CRYPTO] logs for key source/fingerprint mismatch.";
}

export function encrypt(text: string): string {
  const { source, value } = primaryKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, getCipherKey(value), iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();

  console.log(
    `[TOKEN CRYPTO] encrypt ok source=${source} fingerprint=${fingerprint(value)}`,
  );

  return `${iv.toString("hex")}:${encrypted}:${authTag.toString("hex")}`;
}

export function decrypt(text: string, context?: { itemId?: string; label?: string }): string {
  const diag = getEncryptionDiagnostics();
  const cipherMeta = describeCiphertext(text);
  const label = context?.label ?? "token";
  const itemId = context?.itemId ?? "unknown";

  try {
    const decrypted = decryptWithKey(text, primaryKey().value);
    return decrypted;
  } catch (primaryErr) {
    const primaryMessage =
      primaryErr instanceof Error ? primaryErr.message : String(primaryErr);

    // Probe alternate known env keys to identify which one originally encrypted.
    const probes: Array<{ source: string; fingerprint: string; ok: boolean; error?: string }> = [];
    let recovered: { source: string; value: string } | null = null;

    for (const candidate of collectKeyCandidates()) {
      try {
        decryptWithKey(text, candidate.value);
        probes.push({
          source: candidate.source,
          fingerprint: fingerprint(candidate.value),
          ok: true,
        });
        if (!recovered && candidate.source !== diag.primarySource) {
          recovered = { source: candidate.source, value: candidate.value };
        }
      } catch (probeErr) {
        probes.push({
          source: candidate.source,
          fingerprint: fingerprint(candidate.value),
          ok: false,
          error: probeErr instanceof Error ? probeErr.message : String(probeErr),
        });
      }
    }

    console.error(
      `[TOKEN CRYPTO] decrypt FAILED label=${label} itemId=${itemId} primarySource=${diag.primarySource} primaryFingerprint=${diag.primaryFingerprint} cipher=${JSON.stringify(cipherMeta)} primaryError=${primaryMessage} probes=${JSON.stringify(probes)} envFlags=${JSON.stringify({
        hasTokenEncryptionKey: diag.hasTokenEncryptionKey,
        hasNextAuthSecret: diag.hasNextAuthSecret,
        hasPlaidSecret: diag.hasPlaidSecret,
      })}`,
    );

    if (recovered) {
      console.warn(
        `[TOKEN CRYPTO] ciphertext decrypts with ${recovered.source} (fingerprint=${fingerprint(recovered.value)}) but primary is ${diag.primarySource}. Align env vars so the same key is primary everywhere, or re-encrypt tokens.`,
      );
      // Recover so sync works while the misconfiguration is fixed.
      return decryptWithKey(text, recovered.value);
    }

    throw new Error(
      `TOKEN_DECRYPT_FAILED: ${primaryMessage} (primary=${diag.primarySource}/${diag.primaryFingerprint})`,
    );
  }
}
