/** Client-safe local-events types + helpers (no server-only imports). */

export const LOCAL_EVENT_THEMES = [
  "networking",
  "festival",
  "learning_skill",
  "founder_startup",
  "fitness_body",
  "culture_social",
  "real_estate_housing",
  "music_arts",
] as const;

export type LocalEventTheme = (typeof LOCAL_EVENT_THEMES)[number];

export const LOCAL_EVENT_REGIONS = [
  "dmv",
  "baltimore",
  "richmond",
  "virginia_beach",
] as const;

export type LocalEventRegion = (typeof LOCAL_EVENT_REGIONS)[number];

/** Drive distance from Oxon Hill home base. */
export const LOCAL_EVENT_DISTANCE_TIERS = [
  "nearby", // Oxon Hill / National Harbor / PG / DC / close NoVa — evening OK
  "regional", // Baltimore / deeper NoVa — prefer Thu–Sun
  "stretch", // Richmond / Virginia Beach — weekend day-trip or overnight
] as const;

export type LocalEventDistanceTier = (typeof LOCAL_EVENT_DISTANCE_TIERS)[number];

export const LOCAL_EVENT_DAY_FITS = [
  "evening",
  "wfh_flex",
  "weekend",
  "weekend_trip",
] as const;

export type LocalEventDayFit = (typeof LOCAL_EVENT_DAY_FITS)[number];

export const LOCAL_EVENT_STATUSES = [
  "new",
  "interested",
  "planned",
  "dismissed",
  "attended",
] as const;

export type LocalEventStatus = (typeof LOCAL_EVENT_STATUSES)[number];

export const LOCAL_EVENT_CONFIDENCE = ["confirmed", "directional"] as const;
export type LocalEventConfidence = (typeof LOCAL_EVENT_CONFIDENCE)[number];

export const MAX_LOCAL_EVENT_ITEMS = 8;

export function isLocalEventTheme(value: string): value is LocalEventTheme {
  return (LOCAL_EVENT_THEMES as readonly string[]).includes(value);
}

export function isLocalEventRegion(value: string): value is LocalEventRegion {
  return (LOCAL_EVENT_REGIONS as readonly string[]).includes(value);
}

export function isLocalEventDistanceTier(value: string): value is LocalEventDistanceTier {
  return (LOCAL_EVENT_DISTANCE_TIERS as readonly string[]).includes(value);
}

export function isLocalEventDayFit(value: string): value is LocalEventDayFit {
  return (LOCAL_EVENT_DAY_FITS as readonly string[]).includes(value);
}

export function isLocalEventStatus(value: string): value is LocalEventStatus {
  return (LOCAL_EVENT_STATUSES as readonly string[]).includes(value);
}

export function isLocalEventConfidence(value: string): value is LocalEventConfidence {
  return (LOCAL_EVENT_CONFIDENCE as readonly string[]).includes(value);
}

export const LOCAL_EVENT_THEME_LABELS: Record<LocalEventTheme, string> = {
  networking: "Networking",
  festival: "Festival",
  learning_skill: "Learning / skill",
  founder_startup: "Founder / startup",
  fitness_body: "Fitness / body",
  culture_social: "Culture / social",
  real_estate_housing: "Real estate",
  music_arts: "Music / arts",
};

export const LOCAL_EVENT_REGION_LABELS: Record<LocalEventRegion, string> = {
  dmv: "DMV",
  baltimore: "Baltimore",
  richmond: "Richmond",
  virginia_beach: "Virginia Beach",
};

export const LOCAL_EVENT_DISTANCE_LABELS: Record<LocalEventDistanceTier, string> = {
  nearby: "Nearby",
  regional: "Regional drive",
  stretch: "Weekend stretch",
};

export function themeLabel(theme: string) {
  return isLocalEventTheme(theme)
    ? LOCAL_EVENT_THEME_LABELS[theme]
    : theme.replaceAll("_", " ");
}

export function regionLabel(region: string) {
  return isLocalEventRegion(region)
    ? LOCAL_EVENT_REGION_LABELS[region]
    : region.replaceAll("_", " ");
}

export function distanceLabel(tier: string) {
  return isLocalEventDistanceTier(tier)
    ? LOCAL_EVENT_DISTANCE_LABELS[tier]
    : tier.replaceAll("_", " ");
}
