/**
 * One-off / ops helper: remove auto-injected "Promotion project block" leftovers.
 *
 * Usage:
 *   npx tsx scripts/cleanup-promotion-blocks.ts
 *   npx tsx scripts/cleanup-promotion-blocks.ts mjubil96@gmail.com
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PROMO_TITLE_RE =
  /promotion project block|extra promotion(?:\s*\/\s*network)?|extra leverage block/i;

function isPromoLayoutKey(key: string) {
  return key === "leverage" || key.endsWith("-promotion");
}

function scrubLayoutJson(orderJson: string, overridesJson: string) {
  let order: string[] = [];
  let overrides: Record<string, unknown> = {};

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
      overrides = parsed as Record<string, unknown>;
    }
  } catch {
    overrides = {};
  }

  const nextOrder = order.filter((ref) => {
    if (ref === "system:leverage") return false;
    if (ref.startsWith("week:") && ref.endsWith("-promotion")) return false;
    return true;
  });

  const nextOverrides: Record<string, unknown> = {};
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

async function cleanupForUser(userId: string) {
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

async function main() {
  const emailArg = process.argv[2]?.trim().toLowerCase();
  const users = emailArg
    ? await prisma.user.findMany({
        where: { email: { equals: emailArg, mode: "insensitive" } },
        select: { id: true, email: true },
      })
    : await prisma.user.findMany({ select: { id: true, email: true } });

  if (users.length === 0) {
    console.error(emailArg ? `No user found for ${emailArg}` : "No users found.");
    process.exit(1);
  }

  for (const user of users) {
    const result = await cleanupForUser(user.id);
    console.log(
      `${user.email ?? user.id}: activities=${result.deletedActivities} layouts=${result.layoutsScrubbed} memories=${result.deletedMemories}`,
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
