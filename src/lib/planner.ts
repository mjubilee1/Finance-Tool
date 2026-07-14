import { prisma } from "@/lib/prisma";
import { GROWTH_DOMAINS } from "@/lib/growth-agent";
import type { TodayPlanBlockKey } from "@/lib/today-plan";
import { storeFinancialMemories } from "@/lib/financial-memory";

export type PlannerItemStatus = "planned" | "done" | "skipped" | "hidden";

export type PlannerBlockOverride = {
  status?: PlannerItemStatus;
  label?: string | null;
  timeLabel?: string | null;
  notes?: string | null;
};

export type PlannerDayLayoutData = {
  order: string[];
  overrides: Record<string, PlannerBlockOverride>;
};

export const PLANNER_SYSTEM_KEYS = ["lyft", "gym", "leverage", "joy"] as const;
export type PlannerSystemKey = (typeof PLANNER_SYSTEM_KEYS)[number];

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && ISO_DATE_RE.test(value);
}

export function isPlannerStatus(value: unknown): value is PlannerItemStatus {
  return value === "planned" || value === "done" || value === "skipped" || value === "hidden";
}

export function isPlannerSystemKey(value: unknown): value is PlannerSystemKey {
  return typeof value === "string" && (PLANNER_SYSTEM_KEYS as readonly string[]).includes(value);
}

export function userPlanRef(id: string) {
  return `user:${id}`;
}

export function systemPlanRef(key: string) {
  return `system:${key}`;
}

export function calendarPlanRef(id: string) {
  return `calendar:${id}`;
}

export function weekPlanRef(id: string) {
  return `week:${id}`;
}

export function parsePlannerRef(ref: string): { type: "user" | "system" | "calendar" | "week"; id: string } | null {
  const idx = ref.indexOf(":");
  if (idx <= 0) return null;
  const type = ref.slice(0, idx);
  const id = ref.slice(idx + 1);
  if (!id) return null;
  if (type === "user" || type === "system" || type === "calendar" || type === "week") {
    return { type, id };
  }
  return null;
}

function parseOrderJson(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string" && item.length > 0);
  } catch {
    return [];
  }
}

function parseOverridesJson(raw: string | null | undefined): Record<string, PlannerBlockOverride> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const result: Record<string, PlannerBlockOverride> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const row = value as Record<string, unknown>;
      result[key] = {
        status: isPlannerStatus(row.status) ? row.status : undefined,
        label: typeof row.label === "string" ? row.label : row.label === null ? null : undefined,
        timeLabel:
          typeof row.timeLabel === "string" ? row.timeLabel : row.timeLabel === null ? null : undefined,
        notes: typeof row.notes === "string" ? row.notes : row.notes === null ? null : undefined,
      };
    }
    return result;
  } catch {
    return {};
  }
}

export async function getPlannerDayLayout(
  userId: string,
  date: string,
): Promise<PlannerDayLayoutData> {
  try {
    const row = await prisma.plannerDayLayout.findUnique({
      where: { userId_date: { userId, date } },
    });
    return {
      order: parseOrderJson(row?.orderJson),
      overrides: parseOverridesJson(row?.overridesJson),
    };
  } catch (error) {
    console.error("PlannerDayLayout unavailable; using empty layout:", error);
    return { order: [], overrides: {} };
  }
}

export async function getPlannerDayLayouts(
  userId: string,
  startDate: string,
  endDate: string,
): Promise<Map<string, PlannerDayLayoutData>> {
  try {
    const rows = await prisma.plannerDayLayout.findMany({
      where: {
        userId,
        date: { gte: startDate, lte: endDate },
      },
    });
    const map = new Map<string, PlannerDayLayoutData>();
    for (const row of rows) {
      map.set(row.date, {
        order: parseOrderJson(row.orderJson),
        overrides: parseOverridesJson(row.overridesJson),
      });
    }
    return map;
  } catch (error) {
    console.error("PlannerDayLayout range unavailable; using empty layouts:", error);
    return new Map();
  }
}

type LegacyGrowthActivityRow = {
  id: string;
  userId: string;
  date: string;
  domain: string;
  category: string;
  title: string;
  notes: string | null;
  leverage: string;
  minutesSpent: number | null;
  impactScore: number;
  sourceCalendarEventId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Load growth activities even when planner columns/migration are not applied yet. */
export async function loadGrowthActivitiesForDate(userId: string, date: string) {
  try {
    return await prisma.growthActivity.findMany({
      where: { userId, date },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
  } catch (error) {
    console.error("GrowthActivity planner fields unavailable; legacy load:", error);
    const rows = await prisma.$queryRaw<LegacyGrowthActivityRow[]>`
      SELECT id, "userId", date, domain, category, title, notes, leverage,
             "minutesSpent", "impactScore", "sourceCalendarEventId", "createdAt", "updatedAt"
      FROM "GrowthActivity"
      WHERE "userId" = ${userId} AND date = ${date}
      ORDER BY "createdAt" ASC
    `;
    return rows.map((row) => ({
      ...row,
      status: "planned",
      sortOrder: 100,
      timeLabel: null as string | null,
    }));
  }
}

export async function loadUserPlanActivitiesBetween(
  userId: string,
  startDate: string,
  endDate: string,
) {
  try {
    return await prisma.growthActivity.findMany({
      where: {
        userId,
        category: "user_plan",
        date: { gte: startDate, lte: endDate },
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        date: true,
        title: true,
        domain: true,
        notes: true,
        minutesSpent: true,
        status: true,
        sortOrder: true,
        timeLabel: true,
      },
    });
  } catch (error) {
    console.error("user_plan activities with planner fields unavailable; legacy load:", error);
    const rows = await prisma.$queryRaw<
      Array<{
        id: string;
        date: string;
        title: string;
        domain: string;
        notes: string | null;
        minutesSpent: number | null;
      }>
    >`
      SELECT id, date, title, domain, notes, "minutesSpent"
      FROM "GrowthActivity"
      WHERE "userId" = ${userId}
        AND category = 'user_plan'
        AND date >= ${startDate}
        AND date <= ${endDate}
      ORDER BY "createdAt" ASC
    `;
    return rows.map((row) => ({
      ...row,
      status: "planned",
      sortOrder: 100,
      timeLabel: null as string | null,
    }));
  }
}

async function upsertPlannerDayLayout(
  userId: string,
  date: string,
  data: { order?: string[]; overrides?: Record<string, PlannerBlockOverride> },
) {
  const existing = await prisma.plannerDayLayout.findUnique({
    where: { userId_date: { userId, date } },
  });
  const nextOrder = data.order ?? parseOrderJson(existing?.orderJson);
  const nextOverrides = data.overrides ?? parseOverridesJson(existing?.overridesJson);

  return prisma.plannerDayLayout.upsert({
    where: { userId_date: { userId, date } },
    create: {
      userId,
      date,
      orderJson: JSON.stringify(nextOrder),
      overridesJson: JSON.stringify(nextOverrides),
    },
    update: {
      orderJson: JSON.stringify(nextOrder),
      overridesJson: JSON.stringify(nextOverrides),
    },
  });
}

export function applyCustomOrder<T extends { ref: string; sortKey: number }>(
  items: T[],
  order: string[],
): T[] {
  if (!order.length) {
    return [...items].sort((a, b) => a.sortKey - b.sortKey);
  }

  const byRef = new Map(items.map((item) => [item.ref, item]));
  const used = new Set<string>();
  const ordered: T[] = [];

  for (const ref of order) {
    const item = byRef.get(ref);
    if (!item || used.has(ref)) continue;
    ordered.push(item);
    used.add(ref);
  }

  const remaining = items
    .filter((item) => !used.has(item.ref))
    .sort((a, b) => a.sortKey - b.sortKey);
  return [...ordered, ...remaining];
}

export async function createPlannerItem(
  userId: string,
  input: {
    date: string;
    title: string;
    domain?: string;
    notes?: string | null;
    minutesSpent?: number | null;
    timeLabel?: string | null;
    status?: PlannerItemStatus;
  },
) {
  const domain = input.domain?.trim() || "personal";
  if (!(GROWTH_DOMAINS as readonly string[]).includes(domain)) {
    throw new Error("Invalid domain");
  }
  if (!isIsoDate(input.date)) {
    throw new Error("Invalid date");
  }

  const title = input.title.trim().slice(0, 160);
  if (!title) {
    throw new Error("Title is required");
  }

  const sameDay = await prisma.growthActivity.findMany({
    where: { userId, date: input.date, category: "user_plan" },
    select: { sortOrder: true },
    orderBy: { sortOrder: "desc" },
    take: 1,
  });
  const nextSort = (sameDay[0]?.sortOrder ?? 100) + 10;
  const status = input.status && isPlannerStatus(input.status) ? input.status : "planned";

  const activity = await prisma.growthActivity.create({
    data: {
      userId,
      date: input.date,
      domain,
      category: "user_plan",
      title,
      notes: input.notes?.trim() || null,
      minutesSpent: input.minutesSpent ?? null,
      timeLabel: input.timeLabel?.trim() || null,
      status: status === "hidden" ? "planned" : status,
      sortOrder: nextSort,
      leverage: "long_term_leverage",
      impactScore: 5,
    },
  });

  const layout = await getPlannerDayLayout(userId, input.date);
  const ref = userPlanRef(activity.id);
  if (!layout.order.includes(ref)) {
    await upsertPlannerDayLayout(userId, input.date, {
      order: [...layout.order, ref],
      overrides: layout.overrides,
    });
  }

  return activity;
}

export async function updatePlannerItem(
  userId: string,
  id: string,
  input: {
    title?: string;
    domain?: string;
    notes?: string | null;
    minutesSpent?: number | null;
    timeLabel?: string | null;
    status?: PlannerItemStatus;
    date?: string;
    sortOrder?: number;
  },
) {
  const existing = await prisma.growthActivity.findFirst({
    where: { id, userId, category: "user_plan" },
  });
  if (!existing) {
    throw new Error("Planner item not found");
  }

  const data: {
    title?: string;
    domain?: string;
    notes?: string | null;
    minutesSpent?: number | null;
    timeLabel?: string | null;
    status?: string;
    date?: string;
    sortOrder?: number;
  } = {};

  if (typeof input.title === "string") {
    const title = input.title.trim().slice(0, 160);
    if (!title) throw new Error("Title is required");
    data.title = title;
  }
  if (typeof input.domain === "string") {
    if (!(GROWTH_DOMAINS as readonly string[]).includes(input.domain)) {
      throw new Error("Invalid domain");
    }
    data.domain = input.domain;
  }
  if (input.notes !== undefined) {
    data.notes = input.notes?.trim() || null;
  }
  if (input.minutesSpent !== undefined) {
    data.minutesSpent = input.minutesSpent;
  }
  if (input.timeLabel !== undefined) {
    data.timeLabel = input.timeLabel?.trim() || null;
  }
  if (input.status !== undefined) {
    if (!isPlannerStatus(input.status) || input.status === "hidden") {
      throw new Error("Invalid status");
    }
    data.status = input.status;
  }
  if (input.date !== undefined) {
    if (!isIsoDate(input.date)) throw new Error("Invalid date");
    data.date = input.date;
  }
  if (typeof input.sortOrder === "number" && Number.isFinite(input.sortOrder)) {
    data.sortOrder = Math.round(input.sortOrder);
  }

  const updated = await prisma.growthActivity.update({
    where: { id: existing.id },
    data,
  });

  if (data.status === "skipped") {
    const reason = (data.notes ?? existing.notes)?.trim();
    if (reason) {
      await storeFinancialMemories(
        userId,
        [
          {
            title: `Skipped plan item ${updated.date}`,
            content: `User skipped custom plan item "${updated.title}" on ${updated.date}. Reason: ${reason}. Use this when coaching schedule tradeoffs.`,
            importanceScore: 0.8,
          },
        ],
        {
          source: "planner",
          type: "PLANNER_SKIP",
          limit: 1,
          minImportance: 0.5,
        },
      );
    }
  }

  if (data.date && data.date !== existing.date) {
    const fromLayout = await getPlannerDayLayout(userId, existing.date);
    const toLayout = await getPlannerDayLayout(userId, data.date);
    const ref = userPlanRef(existing.id);
    await upsertPlannerDayLayout(userId, existing.date, {
      order: fromLayout.order.filter((item) => item !== ref),
      overrides: fromLayout.overrides,
    });
    if (!toLayout.order.includes(ref)) {
      await upsertPlannerDayLayout(userId, data.date, {
        order: [...toLayout.order, ref],
        overrides: toLayout.overrides,
      });
    }
  }

  return updated;
}

export async function deletePlannerItem(userId: string, id: string) {
  const existing = await prisma.growthActivity.findFirst({
    where: { id, userId, category: "user_plan" },
  });
  if (!existing) {
    throw new Error("Planner item not found");
  }

  await prisma.growthActivity.delete({ where: { id: existing.id } });

  const layout = await getPlannerDayLayout(userId, existing.date);
  const ref = userPlanRef(existing.id);
  if (layout.order.includes(ref)) {
    await upsertPlannerDayLayout(userId, existing.date, {
      order: layout.order.filter((item) => item !== ref),
      overrides: layout.overrides,
    });
  }

  return { success: true as const, date: existing.date };
}

export async function setSystemBlockOverride(
  userId: string,
  date: string,
  blockKey: string,
  patch: PlannerBlockOverride,
) {
  if (!isIsoDate(date)) throw new Error("Invalid date");
  if (!blockKey.trim()) throw new Error("blockKey is required");

  const layout = await getPlannerDayLayout(userId, date);
  const prev = layout.overrides[blockKey] ?? {};
  const nextOverride: PlannerBlockOverride = {
    ...prev,
    ...patch,
  };
  if (patch.status === undefined && prev.status) nextOverride.status = prev.status;

  const overrides = { ...layout.overrides, [blockKey]: nextOverride };
  await upsertPlannerDayLayout(userId, date, {
    order: layout.order,
    overrides,
  });

  // Keep Growth metrics sharp when completing a core today block.
  if (isPlannerSystemKey(blockKey)) {
    if (patch.status === "done" || patch.status === "skipped") {
      await ensureSystemBlockActivity(userId, date, blockKey, patch.status, nextOverride);
    } else if (patch.status === "planned") {
      await clearSystemBlockActivity(userId, date, blockKey);
    }
  }

  if (patch.status === "skipped" && nextOverride.notes?.trim()) {
    await storeFinancialMemories(
      userId,
      [
        {
          title: `Skipped planner block ${date}`,
          content: `User skipped "${nextOverride.label?.trim() || blockKey}" on ${date}. Reason: ${nextOverride.notes.trim()}. Use this when coaching schedule tradeoffs and what to protect next.`,
          importanceScore: 0.82,
        },
      ],
      {
        source: "planner",
        type: "PLANNER_SKIP",
        limit: 1,
        minImportance: 0.5,
      },
    );
  } else if (patch.status === "done") {
    await storeFinancialMemories(
      userId,
      [
        {
          title: `Completed planner block ${date}`,
          content: `User completed "${nextOverride.label?.trim() || blockKey}" on ${date}. Credit the win and keep compounding around what worked.`,
          importanceScore: 0.7,
        },
      ],
      {
        source: "planner",
        type: "PLANNER_DONE",
        limit: 1,
        minImportance: 0.5,
      },
    );
  }

  return nextOverride;
}

async function clearSystemBlockActivity(userId: string, date: string, blockKey: TodayPlanBlockKey) {
  await prisma.growthActivity.deleteMany({
    where: {
      userId,
      date,
      notes: { contains: `planner:${blockKey}` },
    },
  });
}

async function ensureSystemBlockActivity(
  userId: string,
  date: string,
  blockKey: TodayPlanBlockKey,
  status: "done" | "skipped",
  override: PlannerBlockOverride,
) {
  const defaults: Record<
    TodayPlanBlockKey,
    { domain: string; category: string; label: string; leverage: string }
  > = {
    lyft: { domain: "financial", category: "lyft", label: "Lyft", leverage: "immediate_income" },
    gym: { domain: "fitness", category: "gym", label: "Gym", leverage: "long_term_leverage" },
    leverage: {
      domain: "career",
      category: "build",
      label: "Leverage block",
      leverage: "long_term_leverage",
    },
    joy: { domain: "personal", category: "joy", label: "Recovery / joy", leverage: "long_term_leverage" },
  };
  const meta = defaults[blockKey];
  const existing = await prisma.growthActivity.findFirst({
    where: {
      userId,
      date,
      category: meta.category,
      OR: [
        { title: { contains: meta.label, mode: "insensitive" } },
        { notes: { contains: `planner:${blockKey}`, mode: "insensitive" } },
      ],
    },
  });

  const title =
    status === "skipped"
      ? `Skipped ${override.label?.trim() || meta.label}`
      : override.label?.trim() || meta.label;
  const notes =
    status === "skipped"
      ? override.notes?.trim() || `Skipped from planner. planner:${blockKey}`
      : override.notes?.trim() || `Completed from planner. planner:${blockKey}`;

  if (existing) {
    await prisma.growthActivity.update({
      where: { id: existing.id },
      data: {
        title,
        notes,
        status,
        minutesSpent: status === "skipped" ? 0 : existing.minutesSpent,
      },
    });
    return;
  }

  await prisma.growthActivity.create({
    data: {
      userId,
      date,
      domain: meta.domain,
      category: meta.category,
      title,
      notes,
      status,
      leverage: meta.leverage,
      minutesSpent: status === "skipped" ? 0 : null,
      impactScore: status === "skipped" ? 3 : 6,
      sortOrder: 50,
    },
  });
}

export async function reorderPlannerDay(userId: string, date: string, order: string[]) {
  if (!isIsoDate(date)) throw new Error("Invalid date");
  if (!Array.isArray(order) || order.some((item) => typeof item !== "string")) {
    throw new Error("order must be an array of refs");
  }

  const layout = await getPlannerDayLayout(userId, date);
  const cleaned = order.filter((ref) => Boolean(parsePlannerRef(ref)));
  await upsertPlannerDayLayout(userId, date, {
    order: cleaned,
    overrides: layout.overrides,
  });

  // Keep user_plan sortOrder aligned for week views that sort by it.
  let index = 0;
  for (const ref of cleaned) {
    const parsed = parsePlannerRef(ref);
    if (!parsed || parsed.type !== "user") continue;
    await prisma.growthActivity.updateMany({
      where: { id: parsed.id, userId, category: "user_plan" },
      data: { sortOrder: (index + 1) * 10 },
    });
    index += 1;
  }

  return cleaned;
}

export function serializeUserPlanBlock(activity: {
  id: string;
  title: string;
  domain: string;
  minutesSpent: number | null;
  notes: string | null;
  status: string;
  sortOrder: number;
  timeLabel: string | null;
  date: string;
}) {
  return {
    id: activity.id,
    title: activity.title,
    domain: activity.domain,
    minutesSpent: activity.minutesSpent,
    notes: activity.notes,
    status: (isPlannerStatus(activity.status) ? activity.status : "planned") as Exclude<
      PlannerItemStatus,
      "hidden"
    >,
    sortOrder: activity.sortOrder,
    timeLabel: activity.timeLabel,
    date: activity.date,
    ref: userPlanRef(activity.id),
  };
}
