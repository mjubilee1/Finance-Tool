/** Bank institution helpers for Chase (primary) vs Capital One (secondary). */

export function isCapitalOneInstitution(name: string | null | undefined) {
  return Boolean(name && /capital\s*one/i.test(name));
}

export function isChaseInstitution(name: string | null | undefined) {
  return Boolean(name && /\bchase\b/i.test(name));
}

export type CheckingInstitutionKey = "chase" | "capital_one" | "other";

export function classifyInstitution(
  name: string | null | undefined,
): CheckingInstitutionKey {
  if (isChaseInstitution(name)) return "chase";
  if (isCapitalOneInstitution(name)) return "capital_one";
  return "other";
}

export const CHECKING_INSTITUTION_LABELS: Record<CheckingInstitutionKey, string> = {
  chase: "Chase",
  capital_one: "Capital One",
  other: "Other",
};

/** Prefer checking-like depository; exclude clear savings/CDs. */
export function isCheckingLikeAccount(account: {
  type: string;
  subtype?: string | null;
}) {
  if (account.type !== "depository") return false;
  const subtype = (account.subtype ?? "").toLowerCase();
  if (!subtype) return true;
  if (subtype.includes("saving")) return false;
  if (subtype.includes("cd") || subtype.includes("certificate")) return false;
  return true;
}
