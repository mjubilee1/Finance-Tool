/** Client-safe Growth contact constants (no Prisma / server imports). */
export const MAX_NOTE_IMAGES = 3;

export const CONTACT_TYPE_OPTIONS = [
  "unlabeled",
  "family",
  "peer",
  "social",
  "dating",
  "mentor",
  "founder",
  "investor",
  "colleague",
  "tenant",
  "other",
] as const;

export type ContactTypeOption = (typeof CONTACT_TYPE_OPTIONS)[number];
