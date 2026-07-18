export type SyncApiResponse = {
  error?: string;
  code?: string;
  skipped?: number;
  failed?: number;
  added?: number;
  modified?: number;
  removed?: number;
  skipReasons?: string[];
  syncedItems?: number;
  cleanedStaleLinks?: number;
  crypto?: {
    primarySource?: string;
    primaryFingerprint?: string;
    candidateFingerprints?: Array<{ source: string; fingerprint: string }>;
    hasTokenEncryptionKey?: boolean;
    hasNextAuthSecret?: boolean;
    hasPlaidSecret?: boolean;
  };
};

export type SyncFeedbackTone = "success" | "info" | "warning" | "error";

export function getSyncFeedback(data: SyncApiResponse): {
  tone: SyncFeedbackTone;
  message: string;
} | null {
  const added = data.added ?? 0;
  const modified = data.modified ?? 0;
  const removed = data.removed ?? 0;
  const skipped = data.skipped ?? 0;
  const failed = data.failed ?? 0;
  const changed = added + modified + removed;
  const reconnectHint = data.skipReasons?.find((reason) =>
    reason.toLowerCase().includes("needs reconnect"),
  );

  if (data.cleanedStaleLinks && data.cleanedStaleLinks > 0 && !reconnectHint) {
    // fall through — still report sync result below
  }

  if (reconnectHint && changed === 0) {
    return {
      tone: "warning",
      message:
        (data.cleanedStaleLinks ?? 0) > 0
          ? `Removed duplicate bank links. ${reconnectHint}`
          : reconnectHint,
    };
  }

  if (skipped > 0 && changed === 0) {
    const reason = data.skipReasons?.[0];
    if (reason?.toLowerCase().includes("limit")) {
      return { tone: "warning", message: reason };
    }
    if (reason?.toLowerCase().includes("already running")) {
      return { tone: "info", message: reason };
    }
    if (reason?.toLowerCase().includes("needs reconnect")) {
      return {
        tone: "warning",
        message: reason,
      };
    }
    if (reason) {
      return { tone: "info", message: reason };
    }
    return { tone: "info", message: "Sync skipped — your stored transactions are unchanged." };
  }

  if (changed > 0) {
    const parts: string[] = [];
    if (added > 0) parts.push(`${added} new`);
    if (modified > 0) parts.push(`${modified} updated`);
    if (removed > 0) parts.push(`${removed} removed`);
    const base = `Transactions synced (${parts.join(", ")}).`;
    if (reconnectHint) {
      return { tone: "warning", message: `${base} ${reconnectHint}` };
    }
    if ((data.cleanedStaleLinks ?? 0) > 0) {
      return { tone: "success", message: `${base} Cleared duplicate bank links.` };
    }
    return { tone: "success", message: base };
  }

  if (failed > 0 && reconnectHint) {
    return { tone: "warning", message: reconnectHint };
  }

  if (skipped === 0) {
    if ((data.cleanedStaleLinks ?? 0) > 0) {
      return { tone: "success", message: "Cleared duplicate bank links. Transactions are up to date." };
    }
    return { tone: "success", message: "Transactions are up to date." };
  }

  return null;
}

export function syncFeedbackClassName(tone: SyncFeedbackTone) {
  switch (tone) {
    case "success":
      return "text-teal-700";
    case "warning":
      return "text-amber-700";
    case "error":
      return "text-rose-600";
    default:
      return "text-slate-600";
  }
}

async function postPlaidSync(bypassCooldown = false) {
  const response = await fetch("/api/plaid/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bypassCooldown }),
  });
  const data = (await response.json().catch(() => ({}))) as SyncApiResponse & {
    error?: string;
    code?: string;
  };

  if (!response.ok) {
    if (data.code === "TOKEN_DECRYPT_FAILED" && data.crypto) {
      const fp = data.crypto.primaryFingerprint ?? "?";
      const src = data.crypto.primarySource ?? "?";
      const candidates = (data.crypto.candidateFingerprints ?? [])
        .map((c) => `${c.source}:${c.fingerprint}`)
        .join(", ");
      throw new Error(
        `${data.error ?? "Could not read saved bank credentials."} [crypto ${src}/${fp}${candidates ? ` | ${candidates}` : ""}]`,
      );
    }
    throw new Error(data.error ?? "Failed to sync transactions.");
  }

  return data;
}

export { postPlaidSync };
