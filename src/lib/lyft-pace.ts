import { prisma } from "@/lib/prisma";
import {
  buildLyftPaceSnapshot,
  getLyftMonthRange,
  getLyftWeekRange,
} from "@/lib/lyft";

type LyftPaceGoals = {
  weeklyProfitTarget?: number | null;
  monthlyProfitTarget?: number | null;
  lyftHourlyNet?: number | null;
};

async function loadLyftGoals(userId: string): Promise<LyftPaceGoals> {
  try {
    const profile = await prisma.lifeLeverageProfile.findUnique({
      where: { userId },
      select: {
        lyftHourlyNet: true,
        lyftWeeklyProfitTarget: true,
        lyftMonthlyProfitTarget: true,
      },
    });
    return {
      weeklyProfitTarget: profile?.lyftWeeklyProfitTarget,
      monthlyProfitTarget: profile?.lyftMonthlyProfitTarget,
      lyftHourlyNet: profile?.lyftHourlyNet,
    };
  } catch (error) {
    // New profit-target columns may not exist until migrate deploy finishes.
    console.error("Lyft profit targets unavailable; falling back to hourly only:", error);
    try {
      const profile = await prisma.lifeLeverageProfile.findUnique({
        where: { userId },
        select: { lyftHourlyNet: true },
      });
      return { lyftHourlyNet: profile?.lyftHourlyNet };
    } catch (legacyError) {
      console.error("Lyft profile unavailable; using default goal band:", legacyError);
      return {};
    }
  }
}

async function loadLyftActivities(userId: string, rangeStart: string, rangeEnd: string) {
  try {
    return await prisma.growthActivity.findMany({
      where: {
        userId,
        date: { gte: rangeStart, lte: rangeEnd },
        OR: [
          { category: "lyft" },
          { title: { contains: "lyft", mode: "insensitive" } },
          { notes: { contains: "lyft", mode: "insensitive" } },
        ],
      },
      select: {
        date: true,
        category: true,
        title: true,
        notes: true,
        status: true,
      },
      orderBy: { date: "asc" },
    });
  } catch (error) {
    console.error("Lyft activity query failed; empty week board:", error);
    return [];
  }
}

/** Always returns a board snapshot so Overview/Lyft tabs never go blank. */
export async function loadLyftPaceForUser(userId: string, dateIso?: string) {
  const today = dateIso ?? new Date().toISOString().slice(0, 10);
  const week = getLyftWeekRange(today);
  const month = getLyftMonthRange(today);
  const rangeStart = week.startIso < month.startIso ? week.startIso : month.startIso;
  const rangeEnd = week.endIso > month.endIso ? week.endIso : month.endIso;

  try {
    const [goals, activities] = await Promise.all([
      loadLyftGoals(userId),
      loadLyftActivities(userId, rangeStart, rangeEnd),
    ]);
    return buildLyftPaceSnapshot(activities, today, goals);
  } catch (error) {
    console.error("Lyft pace snapshot failed; returning empty board:", error);
    return buildLyftPaceSnapshot([], today);
  }
}
