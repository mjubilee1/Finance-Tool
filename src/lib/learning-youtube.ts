import "server-only";

import { DateTime } from "luxon";
import {
  DEFAULT_CATEGORY_PERCENTAGES,
  DEFAULT_WEEKLY_HOURS,
  isLearningCategoryId,
  normalizeCategoryPercentages,
  type CategoryPercentages,
  type LearningCategoryId,
  youtubeAutoplayUrl,
  youtubeWatchUrl,
} from "@/lib/learning-plan";
import { prisma } from "@/lib/prisma";
import { USER_TIME_ZONE } from "@/lib/user-timezone";

export const YOUTUBE_CHANNEL_ALLOWLIST = [
  {
    label: "Y Combinator",
    channelId: "UCcefcZRL2oaA_uBNeo5UOWg",
    category: "startup_product" as LearningCategoryId,
    defaultMinutes: 25,
  },
  {
    label: "a16z",
    channelId: "UC9cn0TuPq4dnbTY-CBsm8XA",
    category: "startup_product" as LearningCategoryId,
    defaultMinutes: 20,
  },
  {
    label: "Acquired",
    channelId: "UCyFqFYfTW2VoIQKylJ04Rtw",
    category: "founder_stories" as LearningCategoryId,
    defaultMinutes: 90,
  },
  {
    label: "My First Million",
    channelId: "UCyaN6mg5u8Cjy2ZI4ikWaug",
    category: "founder_stories" as LearningCategoryId,
    defaultMinutes: 55,
  },
  {
    label: "Lex Fridman",
    channelId: "UCSHZKyawb77ixDdsGog4iWA",
    category: "ai" as LearningCategoryId,
    defaultMinutes: 90,
  },
  {
    label: "Two Minute Papers",
    channelId: "UCbfYPyITQ-7l4upoX8nvctg",
    category: "ai" as LearningCategoryId,
    defaultMinutes: 6,
  },
  {
    label: "Fireship",
    channelId: "UCsBjURrPoezykLs9EqgamOA",
    category: "emerging_tech" as LearningCategoryId,
    defaultMinutes: 8,
  },
  {
    label: "TED",
    channelId: "UCAuUUnT6oDeKwE6v1NGQxug",
    category: "leadership" as LearningCategoryId,
    defaultMinutes: 15,
  },
  {
    label: "The Diary Of A CEO",
    channelId: "UCGq-a57w-aPwyi3pW7XLiHw",
    category: "leadership" as LearningCategoryId,
    defaultMinutes: 70,
  },
  {
    label: "GaryVee",
    channelId: "UCctXZhXmG-kf3tlIXgVZUlw",
    category: "sales_marketing" as LearningCategoryId,
    defaultMinutes: 20,
  },
  {
    label: "The Plain Bagel",
    channelId: "UCFCEuCsyWP0YkP3CZ3Mr01Q",
    category: "finance_investing" as LearningCategoryId,
    defaultMinutes: 15,
  },
  {
    label: "BiggerPockets",
    channelId: "UCVWDbXqQ8cupuVpotWNt2eg",
    category: "real_estate" as LearningCategoryId,
    defaultMinutes: 25,
  },
] as const;

type ChannelVideo = {
  videoId: string;
  title: string;
  url: string;
  publishedAt: string;
  channelLabel: string;
  category: LearningCategoryId;
  durationMinutes: number;
};

export type LearningYoutubePickLike = {
  id: string;
  videoId: string;
  title: string;
  url: string;
  autoplayUrl: string;
  channelLabel: string;
  category: LearningCategoryId;
  durationMinutes: number;
  summary: string | null;
  relevanceScore: number;
  status: string;
  queuedItemId: string | null;
};

export type LearningYoutubeDigestLike = {
  id: string;
  date: string;
  autoQueued: boolean;
  picks: LearningYoutubePickLike[];
  createdAt: string;
  updatedAt: string;
};

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .trim();
}

function extractTag(block: string, tag: string) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = re.exec(block);
  return match ? decodeXml(match[1]) : "";
}

async function fetchChannelVideos(
  channel: (typeof YOUTUBE_CHANNEL_ALLOWLIST)[number]
): Promise<ChannelVideo[]> {
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channel.channelId}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(feedUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "LifeOS-Learning/1.0; personal YouTube digest",
        Accept: "application/atom+xml,application/xml,text/xml",
      },
    });
    if (!response.ok) return [];
    const xml = await response.text();
    const entries = xml.match(/<entry>[\s\S]*?<\/entry>/gi) ?? [];
    const videos: ChannelVideo[] = [];

    for (const entry of entries.slice(0, 8)) {
      const videoId =
        extractTag(entry, "yt:videoId") ||
        /videoId[>=\s"]+([A-Za-z0-9_-]{11})/i.exec(entry)?.[1] ||
        "";
      const title = extractTag(entry, "title");
      const publishedAt = extractTag(entry, "published") || extractTag(entry, "updated");
      if (!videoId || videoId.length < 8 || !title) continue;

      const durationAttr = /duration="(\d+)"/i.exec(entry)?.[1];
      const durationSeconds = durationAttr ? Number(durationAttr) : NaN;
      const durationMinutes = Number.isFinite(durationSeconds)
        ? Math.max(1, Math.round(durationSeconds / 60))
        : channel.defaultMinutes;

      videos.push({
        videoId,
        title: title.slice(0, 180),
        url: youtubeWatchUrl(videoId),
        publishedAt,
        channelLabel: channel.label,
        category: channel.category,
        durationMinutes,
      });
    }

    return videos;
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

/** Allocate ~daily pick count by category mix; prefer higher % topics. */
export function allocateDailyPickSlots(
  percentages: CategoryPercentages,
  totalSlots = 5
): LearningCategoryId[] {
  const weighted = Object.entries(percentages)
    .filter((entry): entry is [LearningCategoryId, number] => isLearningCategoryId(entry[0]))
    .map(([id, percent]) => ({ id, percent: Math.max(0, percent) }))
    .filter((row) => row.percent > 0)
    .sort((a, b) => b.percent - a.percent);

  if (weighted.length === 0) {
    return Array.from({ length: totalSlots }, () => "ai" as LearningCategoryId);
  }

  const slots: LearningCategoryId[] = [];
  let remaining = totalSlots;

  // Guarantee at least one slot for top categories until filled.
  for (const row of weighted) {
    if (remaining <= 0) break;
    const share = Math.max(1, Math.round((row.percent / 100) * totalSlots));
    const take = Math.min(share, remaining);
    for (let i = 0; i < take; i++) slots.push(row.id);
    remaining -= take;
  }

  while (slots.length < totalSlots) {
    slots.push(weighted[slots.length % weighted.length].id);
  }

  return slots.slice(0, totalSlots);
}

function pickVideosForSlots(
  slots: LearningCategoryId[],
  pool: ChannelVideo[],
  excludeVideoIds: Set<string>
): ChannelVideo[] {
  const byCategory = new Map<LearningCategoryId, ChannelVideo[]>();
  for (const video of pool) {
    if (excludeVideoIds.has(video.videoId)) continue;
    const list = byCategory.get(video.category) ?? [];
    list.push(video);
    byCategory.set(video.category, list);
  }
  for (const list of byCategory.values()) {
    list.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  }

  const used = new Set<string>();
  const picks: ChannelVideo[] = [];

  for (const category of slots) {
    const list = byCategory.get(category) ?? [];
    const next = list.find((video) => !used.has(video.videoId));
    if (!next) continue;
    used.add(next.videoId);
    picks.push(next);
  }

  // Fill leftovers from newest overall if a category was dry.
  if (picks.length < slots.length) {
    const leftovers = pool
      .filter((video) => !used.has(video.videoId) && !excludeVideoIds.has(video.videoId))
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    for (const video of leftovers) {
      if (picks.length >= slots.length) break;
      used.add(video.videoId);
      picks.push(video);
    }
  }

  return picks;
}

export function serializeYoutubePick(row: {
  id: string;
  videoId: string;
  title: string;
  url: string;
  channelLabel: string;
  category: string;
  durationMinutes: number;
  summary: string | null;
  relevanceScore: number;
  status: string;
  queuedItemId: string | null;
}): LearningYoutubePickLike {
  return {
    id: row.id,
    videoId: row.videoId,
    title: row.title,
    url: row.url,
    autoplayUrl: youtubeAutoplayUrl(row.videoId),
    channelLabel: row.channelLabel,
    category: isLearningCategoryId(row.category) ? row.category : "ai",
    durationMinutes: row.durationMinutes,
    summary: row.summary,
    relevanceScore: row.relevanceScore,
    status: row.status,
    queuedItemId: row.queuedItemId,
  };
}

export function serializeYoutubeDigest(digest: {
  id: string;
  date: string;
  autoQueued: boolean;
  createdAt: Date;
  updatedAt: Date;
  picks: Parameters<typeof serializeYoutubePick>[0][];
}): LearningYoutubeDigestLike {
  return {
    id: digest.id,
    date: digest.date,
    autoQueued: digest.autoQueued,
    picks: digest.picks.map(serializeYoutubePick),
    createdAt: digest.createdAt.toISOString(),
    updatedAt: digest.updatedAt.toISOString(),
  };
}

export async function getYoutubeDigestForDate(userId: string, date: string) {
  return prisma.learningYoutubeDigest.findUnique({
    where: { userId_date: { userId, date } },
    include: { picks: { orderBy: { relevanceScore: "desc" } } },
  });
}

/** Video ids already watched or already in the learning system — never re-pick these. */
export async function getExcludedYoutubeVideoIds(userId: string): Promise<Set<string>> {
  const [watched, content, picks] = await Promise.all([
    prisma.learningWatchedVideo.findMany({
      where: { userId },
      select: { videoId: true },
    }),
    prisma.learningContentItem.findMany({
      where: { userId, externalId: { not: null } },
      select: { externalId: true },
    }),
    prisma.learningYoutubePick.findMany({
      where: { digest: { userId } },
      select: { videoId: true },
    }),
  ]);

  const exclude = new Set<string>();
  for (const row of watched) {
    if (row.videoId) exclude.add(row.videoId);
  }
  for (const row of content) {
    if (row.externalId) exclude.add(row.externalId);
  }
  for (const row of picks) {
    if (row.videoId) exclude.add(row.videoId);
  }
  return exclude;
}

/**
 * Record a finished watch: permanent video-id history, mark queue item completed,
 * and mark today's pick as played when linked.
 */
export async function recordLearningVideoWatched(
  userId: string,
  input: {
    videoId: string;
    title?: string | null;
    queueItemId?: string | null;
    pickId?: string | null;
  }
) {
  const videoId = input.videoId.trim();
  if (!videoId || videoId.length < 8) {
    throw new Error("Invalid video id");
  }

  const title = input.title?.trim().slice(0, 200) || null;

  await prisma.learningWatchedVideo.upsert({
    where: { userId_videoId: { userId, videoId } },
    create: { userId, videoId, title },
    update: {
      title: title ?? undefined,
      watchedAt: new Date(),
    },
  });

  let queueItemId = input.queueItemId?.trim() || null;
  if (!queueItemId) {
    const byExternal = await prisma.learningContentItem.findFirst({
      where: { userId, externalId: videoId },
      select: { id: true },
    });
    queueItemId = byExternal?.id ?? null;
  }

  if (queueItemId) {
    const existing = await prisma.learningContentItem.findFirst({
      where: { id: queueItemId, userId },
    });
    if (existing) {
      await prisma.learningContentItem.update({
        where: { id: existing.id },
        data: {
          status: "completed",
          completedAt: existing.completedAt ?? new Date(),
        },
      });
    }
  }

  let pickId = input.pickId?.trim() || null;
  if (pickId) {
    const pick = await prisma.learningYoutubePick.findFirst({
      where: { id: pickId, digest: { userId } },
    });
    if (pick) {
      await prisma.learningYoutubePick.update({
        where: { id: pick.id },
        data: { status: "played" },
      });
    }
  } else {
    await prisma.learningYoutubePick.updateMany({
      where: {
        videoId,
        digest: { userId },
        status: { not: "played" },
      },
      data: { status: "played" },
    });
  }

  return { videoId, queueItemId };
}

async function queuePickToLearning(
  userId: string,
  pick: {
    id: string;
    videoId: string;
    title: string;
    url: string;
    category: string;
    durationMinutes: number;
  }
) {
  const existing = await prisma.learningContentItem.findFirst({
    where: { userId, externalId: pick.videoId },
  });
  if (existing) {
    await prisma.learningYoutubePick.update({
      where: { id: pick.id },
      data: { status: "queued", queuedItemId: existing.id },
    });
    return existing;
  }

  const item = await prisma.learningContentItem.create({
    data: {
      userId,
      title: pick.title.slice(0, 200),
      url: youtubeAutoplayUrl(pick.videoId),
      category: isLearningCategoryId(pick.category) ? pick.category : "ai",
      durationMinutes: pick.durationMinutes,
      priority: "medium",
      status: "saved",
      source: "youtube_daily",
      externalId: pick.videoId,
    },
  });

  await prisma.learningYoutubePick.update({
    where: { id: pick.id },
    data: { status: "queued", queuedItemId: item.id },
  });

  return item;
}

export async function queueYoutubePicks(
  userId: string,
  pickIds?: string[]
): Promise<{ queued: number; digest: LearningYoutubeDigestLike | null }> {
  const today = DateTime.now().setZone(USER_TIME_ZONE).toISODate()!;
  const digest = await getYoutubeDigestForDate(userId, today);
  if (!digest) {
    return { queued: 0, digest: null };
  }

  const targets = digest.picks.filter((pick) => {
    if (pick.status === "queued") return false;
    if (pickIds && pickIds.length > 0) return pickIds.includes(pick.id);
    return pick.status === "suggested";
  });

  let queued = 0;
  for (const pick of targets) {
    await queuePickToLearning(userId, pick);
    queued += 1;
  }

  const updated = await prisma.learningYoutubeDigest.update({
    where: { id: digest.id },
    data: { autoQueued: digest.autoQueued || queued > 0 },
    include: { picks: { orderBy: { relevanceScore: "desc" } } },
  });

  return { queued, digest: serializeYoutubeDigest(updated) };
}

export async function generateDailyYoutubeDigest(
  userId: string,
  options?: { force?: boolean }
) {
  const today = DateTime.now().setZone(USER_TIME_ZONE).toISODate()!;
  const existing = await getYoutubeDigestForDate(userId, today);

  if (existing && !options?.force) {
    return {
      digest: serializeYoutubeDigest(existing),
      refreshed: false,
      alreadyFresh: true,
    };
  }

  const settings = await prisma.learningPlanSettings.findUnique({
    where: { userId },
  });
  const percentages = normalizeCategoryPercentages(
    settings?.categoryPercentages ?? DEFAULT_CATEGORY_PERCENTAGES
  );
  const weeklyHours = settings?.weeklyHours ?? DEFAULT_WEEKLY_HOURS;
  const dailyHours = Math.max(0.5, weeklyHours / 7);
  // Roughly 1 pick per ~20–25 minutes of daily drive budget, capped 3–6.
  const slotCount = Math.min(6, Math.max(3, Math.round((dailyHours * 60) / 25)));

  const feeds = await Promise.all(
    YOUTUBE_CHANNEL_ALLOWLIST.map((channel) => fetchChannelVideos(channel))
  );
  const pool = feeds.flat();

  // Permanent exclusion: watched history + anything already queued/shown.
  const exclude = await getExcludedYoutubeVideoIds(userId);

  const slots = allocateDailyPickSlots(percentages, slotCount);
  const selected = pickVideosForSlots(slots, pool, exclude);

  if (existing) {
    await prisma.learningYoutubePick.deleteMany({ where: { digestId: existing.id } });
    await prisma.learningYoutubeDigest.delete({ where: { id: existing.id } });
  }

  const digest = await prisma.learningYoutubeDigest.create({
    data: {
      userId,
      date: today,
      autoQueued: false,
      picks: {
        create: selected.map((video, index) => ({
          videoId: video.videoId,
          title: video.title,
          url: video.url,
          channelLabel: video.channelLabel,
          category: video.category,
          durationMinutes: video.durationMinutes,
          summary: `${video.channelLabel} · drive-time pick for ${video.category.replaceAll("_", " ")}`,
          relevanceScore: Math.max(1, 10 - index),
          status: "suggested",
        })),
      },
    },
    include: { picks: { orderBy: { relevanceScore: "desc" } } },
  });

  let autoQueued = false;
  if (settings?.autoQueueYoutube !== false && digest.picks.length > 0) {
    await queueYoutubePicks(
      userId,
      digest.picks.map((pick) => pick.id)
    );
    autoQueued = true;
  }

  const finalDigest = await getYoutubeDigestForDate(userId, today);
  return {
    digest: finalDigest ? serializeYoutubeDigest(finalDigest) : serializeYoutubeDigest(digest),
    refreshed: true,
    alreadyFresh: false,
    autoQueued,
  };
}
