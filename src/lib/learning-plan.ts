export const LEARNING_CATEGORIES = [
  { id: "startup_product", label: "Startup and Product" },
  { id: "ai", label: "AI" },
  { id: "sales_marketing", label: "Sales and Marketing" },
  { id: "finance_investing", label: "Finance and Investing" },
  { id: "leadership", label: "Leadership" },
  { id: "real_estate", label: "Real Estate" },
  { id: "emerging_tech", label: "Emerging Technology" },
  { id: "founder_stories", label: "Founder Stories" },
] as const;

export type LearningCategoryId = (typeof LEARNING_CATEGORIES)[number]["id"];

export const LEARNING_PRIORITIES = ["high", "medium", "low"] as const;
export type LearningPriority = (typeof LEARNING_PRIORITIES)[number];

export const LEARNING_STATUSES = ["saved", "in_progress", "completed", "skipped"] as const;
export type LearningStatus = (typeof LEARNING_STATUSES)[number];

export type CategoryPercentages = Record<LearningCategoryId, number>;

export const DEFAULT_WEEKLY_HOURS = 10;

/**
 * Founder / entrepreneur learning mix — heavy on AI, emerging tech, startup,
 * B2B sales; light real estate (property path stays in Goals/Events, not drive YouTube).
 */
export const DEFAULT_CATEGORY_PERCENTAGES: CategoryPercentages = {
  ai: 22,
  emerging_tech: 18,
  startup_product: 18,
  sales_marketing: 14,
  founder_stories: 12,
  leadership: 8,
  finance_investing: 5,
  real_estate: 3,
};

/** Tie-break order when ranking categories for daily YouTube focus rotation. */
export const FOUNDER_LEARNING_PRIORITY: LearningCategoryId[] = [
  "ai",
  "emerging_tech",
  "startup_product",
  "sales_marketing",
  "founder_stories",
  "leadership",
  "finance_investing",
  "real_estate",
];

export function founderPriorityIndex(id: LearningCategoryId): number {
  const idx = FOUNDER_LEARNING_PRIORITY.indexOf(id);
  return idx >= 0 ? idx : FOUNDER_LEARNING_PRIORITY.length;
}

/** True when the saved mix is the old even 12.5% split (or empty). */
export function isLegacyEvenLearningMix(raw: unknown): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return true;
  const record = raw as Record<string, unknown>;
  const values = LEARNING_CATEGORIES.map((cat) => {
    const num = typeof record[cat.id] === "number" ? (record[cat.id] as number) : Number(record[cat.id]);
    return Number.isFinite(num) ? num : null;
  });
  if (values.some((v) => v == null)) return false;
  return values.every((v) => Math.abs((v as number) - 12.5) < 0.35);
}

/**
 * Normalize percentages; auto-upgrade legacy even splits to the founder default mix.
 */
export function resolveLearningPercentages(raw: unknown): CategoryPercentages {
  if (isLegacyEvenLearningMix(raw)) {
    return { ...DEFAULT_CATEGORY_PERCENTAGES };
  }
  return normalizeCategoryPercentages(raw);
}

export type LearningPlanSettingsLike = {
  id: string;
  weeklyHours: number;
  categoryPercentages: CategoryPercentages;
  autoQueueYoutube: boolean;
  /** Auto-open continuous play for drive-time (hands-free after one unlock if needed). */
  autoStartYoutube: boolean;
};

export type LearningContentItemLike = {
  id: string;
  title: string;
  url: string;
  category: LearningCategoryId;
  durationMinutes: number;
  priority: LearningPriority;
  status: LearningStatus;
  source: string;
  externalId: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CategoryHoursRow = {
  id: LearningCategoryId;
  label: string;
  percent: number;
  hours: number;
};

export type LearningProgress = {
  plannedHours: number;
  completedHours: number;
  completedItems: number;
  progressPercent: number;
};

export function isLearningCategoryId(value: string): value is LearningCategoryId {
  return LEARNING_CATEGORIES.some((c) => c.id === value);
}

export function isLearningPriority(value: string): value is LearningPriority {
  return (LEARNING_PRIORITIES as readonly string[]).includes(value);
}

export function isLearningStatus(value: string): value is LearningStatus {
  return (LEARNING_STATUSES as readonly string[]).includes(value);
}

export function categoryLabel(id: string): string {
  return LEARNING_CATEGORIES.find((c) => c.id === id)?.label ?? id.replaceAll("_", " ");
}

export function priorityLabel(priority: LearningPriority): string {
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

export function statusLabel(status: LearningStatus): string {
  switch (status) {
    case "in_progress":
      return "In Progress";
    case "saved":
      return "Saved";
    case "completed":
      return "Completed";
    case "skipped":
      return "Skipped";
    default:
      return status;
  }
}

/** Normalize raw JSON into a full percentages map with finite numbers ≥ 0. */
export function normalizeCategoryPercentages(raw: unknown): CategoryPercentages {
  const result = { ...DEFAULT_CATEGORY_PERCENTAGES };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return result;
  }
  const record = raw as Record<string, unknown>;
  for (const cat of LEARNING_CATEGORIES) {
    const value = record[cat.id];
    const num = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(num) && num >= 0) {
      result[cat.id] = Math.round(num * 10) / 10;
    }
  }
  return result;
}

export function sumPercentages(percentages: CategoryPercentages): number {
  return LEARNING_CATEGORIES.reduce((sum, cat) => sum + (percentages[cat.id] ?? 0), 0);
}

/** True when total is within 0.1 of 100 (float tolerance). */
export function percentagesAreValid(percentages: CategoryPercentages): boolean {
  return Math.abs(sumPercentages(percentages) - 100) < 0.1;
}

export function computeCategoryHours(
  weeklyHours: number,
  percentages: CategoryPercentages
): CategoryHoursRow[] {
  const hours = Number.isFinite(weeklyHours) && weeklyHours > 0 ? weeklyHours : 0;
  return LEARNING_CATEGORIES.map((cat) => {
    const percent = percentages[cat.id] ?? 0;
    return {
      id: cat.id,
      label: cat.label,
      percent,
      hours: Math.round(((hours * percent) / 100) * 100) / 100,
    };
  });
}

export function computeLearningProgress(
  weeklyHours: number,
  items: Pick<LearningContentItemLike, "status" | "durationMinutes">[]
): LearningProgress {
  const plannedHours =
    Number.isFinite(weeklyHours) && weeklyHours > 0 ? weeklyHours : 0;
  const completed = items.filter((item) => item.status === "completed");
  const completedMinutes = completed.reduce(
    (sum, item) => sum + Math.max(0, item.durationMinutes || 0),
    0
  );
  const completedHours = Math.round((completedMinutes / 60) * 100) / 100;
  const progressPercent =
    plannedHours > 0
      ? Math.min(100, Math.round((completedHours / plannedHours) * 100))
      : completed.length > 0
        ? 100
        : 0;

  return {
    plannedHours,
    completedHours,
    completedItems: completed.length,
    progressPercent,
  };
}

export function youtubeVideoIdFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) {
      const id = parsed.pathname.replace(/^\//, "").slice(0, 11);
      return id.length >= 8 ? id : null;
    }
    if (parsed.hostname.includes("youtube.com")) {
      const v = parsed.searchParams.get("v");
      if (v && v.length >= 8) return v.slice(0, 11);
      const embed = /\/embed\/([A-Za-z0-9_-]{8,})/.exec(parsed.pathname);
      if (embed) return embed[1].slice(0, 11);
    }
  } catch {
    return null;
  }
  return null;
}

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

/** Opens YouTube ready to play (browser / YouTube app may still require a tap). */
export function youtubeAutoplayUrl(videoId: string): string {
  const url = new URL("https://www.youtube.com/watch");
  url.searchParams.set("v", videoId);
  url.searchParams.set("autoplay", "1");
  return url.toString();
}

/**
 * In-app embed URL. Uses playsinline so iOS stays in the webview instead of
 * handing off to the YouTube app (and its related-video autoplay).
 * rel=0 reduces cross-channel recommendations after the video ends.
 */
export function youtubeEmbedUrl(
  videoId: string,
  options?: { autoplay?: boolean; enableJsApi?: boolean }
): string {
  const url = new URL(`https://www.youtube.com/embed/${encodeURIComponent(videoId)}`);
  url.searchParams.set("playsinline", "1");
  url.searchParams.set("rel", "0");
  url.searchParams.set("modestbranding", "1");
  if (options?.autoplay !== false) {
    url.searchParams.set("autoplay", "1");
  }
  if (options?.enableJsApi !== false) {
    url.searchParams.set("enablejsapi", "1");
    if (typeof window !== "undefined" && window.location?.origin) {
      url.searchParams.set("origin", window.location.origin);
    }
  }
  return url.toString();
}

export function serializeSettings(row: {
  id: string;
  weeklyHours: number;
  categoryPercentages: unknown;
  autoQueueYoutube?: boolean;
  autoStartYoutube?: boolean;
}): LearningPlanSettingsLike {
  return {
    id: row.id,
    weeklyHours: row.weeklyHours,
    categoryPercentages: resolveLearningPercentages(row.categoryPercentages),
    autoQueueYoutube: row.autoQueueYoutube !== false,
    autoStartYoutube: row.autoStartYoutube !== false,
  };
}

export function serializeContentItem(row: {
  id: string;
  title: string;
  url: string;
  category: string;
  durationMinutes: number;
  priority: string;
  status: string;
  source?: string | null;
  externalId?: string | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): LearningContentItemLike {
  return {
    id: row.id,
    title: row.title,
    url: row.url,
    category: isLearningCategoryId(row.category) ? row.category : "ai",
    durationMinutes: row.durationMinutes,
    priority: isLearningPriority(row.priority) ? row.priority : "medium",
    status: isLearningStatus(row.status) ? row.status : "saved",
    source: row.source || "manual",
    externalId: row.externalId ?? null,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
