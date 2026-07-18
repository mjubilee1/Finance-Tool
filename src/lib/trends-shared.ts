/**
 * Client-safe trend theme helpers and constants.
 * Keep Prisma/OpenAI/network logic out of this file so client components
 * (TrendsView) never pull server modules into the browser bundle.
 */

export const TECH_TREND_THEMES = [
  "ai_models",
  "labs",
  "infra",
  "startup",
  "hardware_software",
] as const;

/** Housing / rates / markets — not tech. Shown on the DMV page with local life. */
export const MONEY_TREND_THEMES = ["markets", "real_estate"] as const;

export const DMV_TREND_THEMES = ["dmv_state"] as const;

export const TREND_THEMES = [
  ...TECH_TREND_THEMES,
  ...MONEY_TREND_THEMES,
  ...DMV_TREND_THEMES,
] as const;

export const MAX_TECH_TREND_ITEMS = 4;
export const MAX_DMV_TREND_ITEMS = 3;

export function isDmvTrendTheme(theme: string) {
  return (DMV_TREND_THEMES as readonly string[]).includes(theme);
}

export function isMoneyTrendTheme(theme: string) {
  return (MONEY_TREND_THEMES as readonly string[]).includes(theme);
}

export function isTechTrendTheme(theme: string) {
  return (TECH_TREND_THEMES as readonly string[]).includes(theme);
}

/** DMV page = local politics + housing/rates (not AI). */
export function isDmvPageTheme(theme: string) {
  return isDmvTrendTheme(theme) || isMoneyTrendTheme(theme);
}

export type TrendTheme = (typeof TREND_THEMES)[number];

export const TREND_ITEM_STATUSES = ["new", "noted", "parked", "dismissed"] as const;
export type TrendItemStatus = (typeof TREND_ITEM_STATUSES)[number];
