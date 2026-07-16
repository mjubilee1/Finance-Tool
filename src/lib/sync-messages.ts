export type SyncApiResponse = {
  error?: string;
  skipped?: number;
  added?: number;
  modified?: number;
  removed?: number;
  skipReasons?: string[];
  syncedItems?: number;
  itemIssues?: Array<{
    plaidItemId: string;
    institutionName: string | null;
    status: string;
    errorCode: string | null;
    errorMessage: string | null;
  }>;
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
  const changed = added + modified + removed;

  if (skipped > 0 && changed === 0) {
    const reason = data.skipReasons?.[0];
    if (reason?.toLowerCase().includes("limit")) {
      return { tone: "warning", message: reason };
    }
    if (reason?.toLowerCase().includes("already running")) {
      return { tone: "info", message: reason };
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
    return { tone: "success", message: `Transactions synced (${parts.join(", ")}).` };
  }

  if (skipped === 0) {
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
    throw new Error(data.error ?? "Failed to sync transactions.");
  }

  return data;
}

export { postPlaidSync };
