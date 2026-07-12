export type SpendingAlertReason =
  | "uncategorized"
  | "cryptic_name"
  | "large_unknown"
  | "recurring_unknown"
  | "unusually_high";

export type SpendingAlert = {
  id: string;
  name: string;
  merchantName: string | null;
  amount: number;
  date: string;
  accountId: string;
  reason: SpendingAlertReason;
  reasonLabel: string;
  savingsHint: string;
  score: number;
};

export function normalizeMerchantKey(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

type AlertTransaction = {
  id: string;
  name: string;
  merchantName?: string | null;
  amount: number;
  date: string;
  accountId: string;
  pending?: boolean | null;
  categoryPrimary?: string | null;
  categoryDetailed?: string | null;
  customCategory?: string | null;
  isFoodCandidate?: boolean | null;
  isTransportationCandidate?: boolean | null;
  isUtilityCandidate?: boolean | null;
  isTenantPaymentCandidate?: boolean | null;
};

const REASON_COPY: Record<
  SpendingAlertReason,
  { label: string; hint: string; score: number }
> = {
  cryptic_name: {
    label: "Unknown merchant",
    hint: "Cryptic charge — ask the Coach what it is, or cancel if you don't recognize it.",
    score: 45,
  },
  uncategorized: {
    label: "Uncategorized",
    hint: "No category yet — labeling this helps spot leaks faster.",
    score: 30,
  },
  large_unknown: {
    label: "Large charge",
    hint: "Big spend without a clear label — worth confirming before it repeats.",
    score: 35,
  },
  recurring_unknown: {
    label: "Repeats often",
    hint: "Shows up more than once — could be a subscription you forgot about.",
    score: 40,
  },
  unusually_high: {
    label: "Higher than usual",
    hint: "This charge is bigger than your typical spend — confirm it's expected.",
    score: 38,
  },
};

function displayName(transaction: AlertTransaction) {
  return (transaction.merchantName ?? transaction.name).trim();
}

function hasMeaningfulCategory(transaction: AlertTransaction) {
  if (transaction.customCategory?.trim()) return true;
  if (transaction.isFoodCandidate || transaction.isTransportationCandidate) return true;
  if (transaction.isUtilityCandidate || transaction.isTenantPaymentCandidate) return true;

  const category = transaction.categoryPrimary?.toLowerCase() ?? "";
  if (!category || category === "uncategorized" || category === "other") {
    return false;
  }

  return !category.includes("general");
}

function isTransfer(transaction: AlertTransaction) {
  const category = transaction.categoryPrimary?.toLowerCase() ?? "";
  const text = `${transaction.name} ${transaction.merchantName ?? ""}`.toLowerCase();
  return category.includes("transfer") || /\btransfer\b/.test(text);
}

function isCrypticMerchant(name: string) {
  const cleaned = name.trim();
  if (cleaned.length <= 3) return true;

  const compact = cleaned.replace(/[\s*#.-]/g, "");
  if (/^[A-Z0-9]{4,20}$/.test(compact)) return true;

  const words = cleaned.split(/\s+/).filter(Boolean);
  if (
    words.length >= 1 &&
    words.every((word) => word.length <= 8 && word === word.toUpperCase() && /[A-Z]/.test(word))
  ) {
    return true;
  }

  const letters = cleaned.replace(/[^a-zA-Z]/g, "");
  if (letters.length >= 8) {
    const vowels = (letters.match(/[aeiouAEIOU]/g) ?? []).length;
    if (vowels / letters.length < 0.18) return true;
  }

  return false;
}

function countSimilarCharges(transactions: AlertTransaction[], target: AlertTransaction) {
  const key = displayName(target).toLowerCase();
  return transactions.filter((candidate) => {
    if (candidate.amount <= 0) return false;
    return displayName(candidate).toLowerCase() === key;
  }).length;
}

function pickPrimaryReason(
  transaction: AlertTransaction,
  repeatCount: number,
  unusuallyHigh: boolean,
): SpendingAlertReason {
  if (unusuallyHigh) return "unusually_high";
  if (repeatCount >= 2) return "recurring_unknown";
  if (isCrypticMerchant(displayName(transaction))) return "cryptic_name";
  if (transaction.amount >= 75 && !hasMeaningfulCategory(transaction)) return "large_unknown";
  return "uncategorized";
}

function isUnusuallyHigh(transactions: AlertTransaction[], target: AlertTransaction) {
  const amounts = transactions
    .filter((transaction) => transaction.amount > 0 && transaction.id !== target.id)
    .map((transaction) => transaction.amount)
    .sort((a, b) => a - b);

  if (amounts.length < 5) return target.amount >= 150;

  const median = amounts[Math.floor(amounts.length / 2)] ?? 0;
  return target.amount >= Math.max(120, median * 2.5);
}

export function filterDismissedAlerts(
  alerts: SpendingAlert[],
  dismissedMerchantKeys: Set<string>,
) {
  return alerts.filter((alert) => !dismissedMerchantKeys.has(normalizeMerchantKey(displayName(alert))));
}

export function detectSpendingAlerts(
  transactions: AlertTransaction[],
  options?: { limit?: number; minScore?: number; dismissedMerchantKeys?: Set<string> },
): SpendingAlert[] {
  const limit = options?.limit ?? 8;
  const minScore = options?.minScore ?? 30;
  const dismissedMerchantKeys = options?.dismissedMerchantKeys ?? new Set<string>();
  const alerts: SpendingAlert[] = [];

  for (const transaction of transactions) {
    if (transaction.amount <= 0 || transaction.pending || isTransfer(transaction)) {
      continue;
    }

    const merchantKey = normalizeMerchantKey(displayName(transaction));
    if (dismissedMerchantKeys.has(merchantKey)) {
      continue;
    }

    const repeatCount = countSimilarCharges(transactions, transaction);
    const uncategorized = !hasMeaningfulCategory(transaction);
    const cryptic = isCrypticMerchant(displayName(transaction));
    const largeUnknown = transaction.amount >= 75 && uncategorized;
    const recurringUnknown = repeatCount >= 2 && (uncategorized || cryptic);
    const unusuallyHigh = isUnusuallyHigh(transactions, transaction);

    if (!uncategorized && !cryptic && !largeUnknown && !recurringUnknown && !unusuallyHigh) {
      continue;
    }

    const reason = pickPrimaryReason(transaction, repeatCount, unusuallyHigh);
    const copy = REASON_COPY[reason];
    let score = copy.score;

    if (cryptic) score += 15;
    if (largeUnknown) score += Math.min(20, Math.round(transaction.amount / 10));
    if (recurringUnknown) score += 10;
    if (unusuallyHigh) score += 12;
    if (uncategorized) score += 5;

    if (score < minScore) continue;

    alerts.push({
      id: transaction.id,
      name: transaction.name,
      merchantName: transaction.merchantName ?? null,
      amount: transaction.amount,
      date: transaction.date,
      accountId: transaction.accountId,
      reason,
      reasonLabel: copy.label,
      savingsHint: copy.hint,
      score,
    });
  }

  const deduped = new Map<string, SpendingAlert>();
  for (const alert of alerts.sort((a, b) => b.score - a.score)) {
    const key = displayName(alert).toLowerCase();
    const existing = deduped.get(key);
    if (!existing || alert.score > existing.score) {
      deduped.set(key, alert);
    }
  }

  return Array.from(deduped.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function estimateMonthlyLeak(alerts: SpendingAlert[]) {
  return alerts.reduce((sum, alert) => {
    if (alert.reason === "recurring_unknown") {
      return sum + alert.amount;
    }
    return sum + alert.amount * 0.25;
  }, 0);
}
