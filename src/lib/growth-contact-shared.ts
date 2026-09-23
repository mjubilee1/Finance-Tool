/** Client-safe Growth contact constants (no Prisma / server imports). */
export const MAX_NOTE_IMAGES = 3;

/** Builder leverage first — YC / startup compounding. */
export const BUILDER_CONTACT_TYPES = [
  "founder",
  "operator_buyer",
  "investor",
  "tech_peer",
  "connector",
  "media_events",
  "candidate",
] as const;

/** Personal lanes — kept separate from builder chase lists. */
export const PERSONAL_CONTACT_TYPES = ["dating", "social", "family"] as const;

export const CONTACT_TYPE_OPTIONS = [
  ...BUILDER_CONTACT_TYPES,
  ...PERSONAL_CONTACT_TYPES,
  "unlabeled",
] as const;

export type ContactTypeOption = (typeof CONTACT_TYPE_OPTIONS)[number];

export const CONTACT_TYPE_LABELS: Record<ContactTypeOption, string> = {
  founder: "Founders",
  operator_buyer: "Operators / buyers",
  investor: "Investors / angels",
  tech_peer: "Technical peers",
  connector: "Connectors",
  media_events: "Media / events",
  candidate: "Candidates",
  dating: "Dating",
  social: "Social",
  family: "Family",
  unlabeled: "Unsorted",
};

export const CONTACT_STATUS_OPTIONS = ["active", "warm", "quiet", "dormant"] as const;
export type ContactStatusOption = (typeof CONTACT_STATUS_OPTIONS)[number];

export const CONTACT_STATUS_LABELS: Record<ContactStatusOption, string> = {
  active: "Active",
  warm: "Warm",
  quiet: "Quiet",
  dormant: "Dormant",
};

/** Weekly Top 10: people who can unlock a pilot, intro, or collab this month. */
export const TOP10_CONTACT_TYPES = ["founder", "operator_buyer", "connector"] as const;

const TYPE_ALIASES: Record<string, ContactTypeOption> = {
  founder: "founder",
  founders: "founder",
  operator: "operator_buyer",
  operator_buyer: "operator_buyer",
  operatorbuyer: "operator_buyer",
  buyer: "operator_buyer",
  colleague: "operator_buyer",
  tenant: "operator_buyer",
  investor: "investor",
  angel: "investor",
  peer: "tech_peer",
  tech_peer: "tech_peer",
  techpeer: "tech_peer",
  engineer: "tech_peer",
  mentor: "connector",
  connector: "connector",
  media: "media_events",
  media_events: "media_events",
  events: "media_events",
  candidate: "candidate",
  dating: "dating",
  social: "social",
  family: "family",
  unlabeled: "unlabeled",
  other: "unlabeled",
  personal: "family",
};

const STATUS_ALIASES: Record<string, ContactStatusOption> = {
  active: "active",
  warm: "warm",
  quiet: "quiet",
  fading: "quiet",
  dormant: "dormant",
};

export function normalizeContactType(value: string | null | undefined): ContactTypeOption {
  if (!value?.trim()) return "unlabeled";
  const key = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return TYPE_ALIASES[key] ?? "unlabeled";
}

export function normalizeContactStatus(value: string | null | undefined): ContactStatusOption {
  if (!value?.trim()) return "active";
  const key = value.trim().toLowerCase();
  return STATUS_ALIASES[key] ?? "active";
}

export function contactTypeLabel(value: string | null | undefined) {
  return CONTACT_TYPE_LABELS[normalizeContactType(value)];
}

export function contactStatusLabel(value: string | null | undefined) {
  return CONTACT_STATUS_LABELS[normalizeContactStatus(value)];
}

export function isBuilderContactType(value: string | null | undefined) {
  const type = normalizeContactType(value);
  return (BUILDER_CONTACT_TYPES as readonly string[]).includes(type);
}

export function isPersonalContactType(value: string | null | undefined) {
  const type = normalizeContactType(value);
  return (PERSONAL_CONTACT_TYPES as readonly string[]).includes(type);
}

/** Types that should stay warm — builder network + dating-with-intent. */
export function isLeverageContactType(value: string | null | undefined) {
  const type = normalizeContactType(value);
  return isBuilderContactType(type) || type === "dating";
}

export function isTop10ContactType(value: string | null | undefined) {
  const type = normalizeContactType(value);
  return (TOP10_CONTACT_TYPES as readonly string[]).includes(type);
}
