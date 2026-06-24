export type ChargeReviewDisposition =
  | "expected"
  | "one_time"
  | "not_concern"
  | "will_cancel";

export const CHARGE_REVIEW_MEMORY_TYPE = "CHARGE_REVIEWED";

export const DISPOSITION_LABELS: Record<ChargeReviewDisposition, string> = {
  expected: "Expected — I know this charge",
  one_time: "One-time purchase",
  not_concern: "Not a concern",
  will_cancel: "Planning to cancel",
};

export function normalizeMerchantKey(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function getChargeReviewMemoryTitle(merchantLabel: string) {
  return `Charge reviewed: ${normalizeMerchantKey(merchantLabel)}`;
}

export function buildChargeReviewMemoryContent(params: {
  merchantLabel: string;
  amount: number;
  date: string;
  disposition: ChargeReviewDisposition;
  note?: string;
}) {
  const { merchantLabel, amount, date, disposition, note } = params;
  const lines = [
    `User reviewed the charge "${merchantLabel}" for $${amount.toFixed(2)} on ${date}.`,
    `Disposition: ${DISPOSITION_LABELS[disposition]}.`,
    "Do not flag this merchant as a mystery or leak in Spending radar unless the amount or pattern changes materially.",
  ];

  if (note?.trim()) {
    lines.push(`User note: ${note.trim()}`);
  }

  return lines.join(" ");
}

export function getDismissedMerchantKeys(
  memories: Array<{ title: string; type: string }>,
): Set<string> {
  const keys = new Set<string>();

  for (const memory of memories) {
    if (memory.type !== CHARGE_REVIEW_MEMORY_TYPE && !memory.title.startsWith("Charge reviewed:")) {
      continue;
    }

    const key = memory.title.replace(/^Charge reviewed:\s*/i, "").trim().toLowerCase();
    if (key) {
      keys.add(key);
    }
  }

  return keys;
}

export function dispositionCustomCategory(disposition: ChargeReviewDisposition) {
  switch (disposition) {
    case "expected":
      return "Reviewed — expected";
    case "one_time":
      return "Reviewed — one-time";
    case "will_cancel":
      return "Reviewed — cancel planned";
    default:
      return "Reviewed — not a concern";
  }
}
