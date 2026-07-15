import { prisma } from "@/lib/prisma";
import {
  buildLyftPaceSnapshot,
  getLyftMonthRange,
  getLyftWeekRange,
} from "@/lib/lyft";

export async function loadLyftPaceForUser(userId: string, dateIso?: string) {
  const today = dateIso ?? new Date().toISOString().slice(0, 10);
  const week = getLyftWeekRange(today);
  const month = getLyftMonthRange(today);
  const rangeStart = week.startIso < month.startIso ? week.startIso : month.startIso;
  const rangeEnd = week.endIso > month.endIso ? week.endIso : month.endIso;

  const [profile, activities] = await Promise.all([
    prisma.lifeLeverageProfile.findUnique({
      where: { userId },
      select: {
        lyftHourlyNet: true,
        lyftWeeklyProfitTarget: true,
        lyftMonthlyProfitTarget: true,
      },
    }),
    prisma.growthActivity.findMany({
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
    }),
  ]);

  const goals = {
    weeklyProfitTarget: profile?.lyftWeeklyProfitTarget,
    monthlyProfitTarget: profile?.lyftMonthlyProfitTarget,
    lyftHourlyNet: profile?.lyftHourlyNet,
  };

  return buildLyftPaceSnapshot(activities, today, goals);
}
