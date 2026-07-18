import { prisma } from "@/lib/prisma";

const PROMO_TITLE_RE =
  /promotion project block|extra promotion(?:\s*\/\s*network)?|extra leverage block/i;

type LayoutOverrides = Record<string, unknown>;

function isPromoLayoutKey(key: string) {
  return key === "leverage" || key.endsWith("-promotion");
}

function scrubLayoutJson(orderJson: string, overridesJson: string) {
  let order: string[] = [];
  let overrides: LayoutOverrides = {};

  try {
    const parsed = JSON.parse(orderJson) as unknown;
    if (Array.isArray(parsed)) {
      order = parsed.filter((item): item is string => typeof item === "string");
    }
  } catch {
    order = [];
  }

  try {
    const parsed = JSON.parse(overridesJson) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      overrides = parsed as LayoutOverrides;
    }
  } catch {
    overrides = {};
  }

  const nextOrder = order.filter((ref) => {
    if (ref === "system:leverage") return false;
    if (ref.startsWith("week:") && ref.endsWith("-promotion")) return false;
    return true;
  });

  const nextOverrides: LayoutOverrides = {};
  for (const [key, value] of Object.entries(overrides)) {
    if (isPromoLayoutKey(key)) continue;
    nextOverrides[key] = value;
  }

  const changed =
    nextOrder.length !== order.length ||
    Object.keys(nextOverrides).length !== Object.keys(overrides).length;

  return {
    changed,
    orderJson: JSON.stringify(nextOrder),
    overridesJson: JSON.stringify(nextOverrides),
  };
}

/**
 * One-shot cleanup: remove auto-injected promotion/leverage planner leftovers.
 * Safe to call on Overview load — no-ops once the rows are gone.
 */
export async function cleanupPromotionalProjectBlocks(userId: string) {
  const deletedActivities = await prisma.growthActivity.deleteMany({
    where: {
      userId,
      OR: [
        { title: { contains: "Promotion project", mode: "insensitive" } },
        { title: { contains: "Extra promotion", mode: "insensitive" } },
        { title: { contains: "Extra leverage block", mode: "insensitive" } },
        {
          AND: [
            { category: "promotion" },
            { notes: { contains: "planner:leverage", mode: "insensitive" } },
          ],
        },
        {
          AND: [
            { category: "promotion" },
            { notes: { contains: "-promotion", mode: "insensitive" } },
          ],
        },
      ],
    },
  });

  const layouts = await prisma.plannerDayLayout.findMany({
    where: { userId },
    select: { id: true, orderJson: true, overridesJson: true },
  });

  let layoutsScrubbed = 0;
  for (const layout of layouts) {
    const scrubbed = scrubLayoutJson(layout.orderJson, layout.overridesJson);
    if (!scrubbed.changed) continue;
    await prisma.plannerDayLayout.update({
      where: { id: layout.id },
      data: {
        orderJson: scrubbed.orderJson,
        overridesJson: scrubbed.overridesJson,
      },
    });
    layoutsScrubbed += 1;
  }

  // Drop memories that only existed to reinforce the daily promo rail.
  const memories = await prisma.financialMemory.findMany({
    where: {
      userId,
      OR: [
        { title: { contains: "Promotion project", mode: "insensitive" } },
        { content: { contains: "Promotion project block", mode: "insensitive" } },
        { content: { contains: "Extra promotion / network", mode: "insensitive" } },
      ],
    },
    select: { id: true, title: true, content: true },
  });
  const memoryIds = memories
    .filter((memory) => PROMO_TITLE_RE.test(`${memory.title} ${memory.content}`))
    .map((memory) => memory.id);
  const deletedMemories =
    memoryIds.length > 0
      ? await prisma.financialMemory.deleteMany({ where: { id: { in: memoryIds } } })
      : { count: 0 };

  return {
    deletedActivities: deletedActivities.count,
    layoutsScrubbed,
    deletedMemories: deletedMemories.count,
  };
}
