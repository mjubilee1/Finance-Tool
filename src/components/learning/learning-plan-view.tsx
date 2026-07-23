"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  Check,
  Cpu,
  ExternalLink,
  Loader2,
  MapPin,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  Video,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import {
  DEFAULT_CATEGORY_PERCENTAGES,
  DEFAULT_WEEKLY_HOURS,
  LEARNING_CATEGORIES,
  LEARNING_PRIORITIES,
  LEARNING_STATUSES,
  categoryLabel,
  priorityLabel,
  statusLabel,
  youtubeVideoIdFromUrl,
  type CategoryHoursRow,
  type CategoryPercentages,
  type LearningCategoryId,
  type LearningContentItemLike,
  type LearningPlanSettingsLike,
  type LearningPriority,
  type LearningProgress,
  type LearningStatus,
} from "@/lib/learning-plan";
import {
  YoutubePlayerModal,
  type YoutubePlayerTarget,
} from "@/components/learning/youtube-player-modal";
import { TrendsErrorBoundary } from "@/components/trends/trends-error-boundary";

const TrendsView = dynamic(
  () => import("@/components/trends/trends-view").then((m) => m.TrendsView),
  {
    loading: () => (
      <div className="flex items-center justify-center py-16 text-[var(--muted)] gap-2">
        <Loader2 className="animate-spin" size={18} />
        Loading digest…
      </div>
    ),
  }
);

type LearningSubView = "plan" | "youtube" | "queue" | "tech" | "dmv";

type LearningBundle = {
  settings: LearningPlanSettingsLike;
  items: LearningContentItemLike[];
  categoryHours: CategoryHoursRow[];
  progress: LearningProgress;
  percentagesValid: boolean;
  percentTotal: number;
  categories: { id: LearningCategoryId; label: string }[];
};

type YoutubePick = {
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

type YoutubeDigestResponse = {
  digest: {
    id: string;
    date: string;
    autoQueued: boolean;
    picks: YoutubePick[];
  } | null;
  refreshed?: boolean;
  alreadyFresh?: boolean;
  autoQueued?: boolean;
};

type AddForm = {
  title: string;
  url: string;
  category: LearningCategoryId;
  durationMinutes: string;
  priority: LearningPriority;
  status: LearningStatus;
};

const SUB_NAV: { id: LearningSubView; label: string; Icon: typeof BookOpen }[] = [
  { id: "plan", label: "Plan", Icon: BookOpen },
  { id: "youtube", label: "YouTube", Icon: Video },
  { id: "queue", label: "Queue", Icon: Plus },
  { id: "tech", label: "Tech news", Icon: Cpu },
  { id: "dmv", label: "DMV news", Icon: MapPin },
];

const emptyForm = (): AddForm => ({
  title: "",
  url: "",
  category: "startup_product",
  durationMinutes: "30",
  priority: "medium",
  status: "saved",
});

async function fetchLearningPlan(): Promise<LearningBundle> {
  const res = await fetch("/api/learning-plan");
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || "Failed to load learning plan");
  }
  return res.json();
}

function formatHours(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function LearningPlanView({
  onOpenGrowth,
  initialSubView = "plan",
}: {
  onOpenGrowth?: () => void;
  initialSubView?: LearningSubView;
}) {
  const queryClient = useQueryClient();
  const [subView, setSubView] = useState<LearningSubView>(initialSubView);
  const [localPercents, setLocalPercents] = useState<CategoryPercentages | null>(null);
  const [weeklyHoursInput, setWeeklyHoursInput] = useState<string | null>(null);
  const [form, setForm] = useState<AddForm>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [playerSession, setPlayerSession] = useState<{
    playlist: YoutubePlayerTarget[];
    startIndex: number;
  } | null>(null);

  function openYoutubePlaylist(playlist: YoutubePlayerTarget[], startIndex = 0) {
    if (playlist.length === 0) return;
    setPlayerSession({
      playlist,
      startIndex: Math.min(Math.max(0, startIndex), playlist.length - 1),
    });
  }

  async function recordVideoWatched(video: YoutubePlayerTarget) {
    await fetch("/api/learning-plan/youtube/watched", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        videoId: video.videoId,
        title: video.title,
        queueItemId: video.queueItemId ?? undefined,
        pickId: video.pickId ?? undefined,
      }),
    });
    void queryClient.invalidateQueries({ queryKey: ["learning-plan"] });
    void queryClient.invalidateQueries({ queryKey: ["learning-youtube"] });
  }

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["learning-plan"],
    queryFn: fetchLearningPlan,
  });

  const {
    data: youtubeData,
    isLoading: youtubeLoading,
    error: youtubeError,
    refetch: refetchYoutube,
    isFetching: youtubeFetching,
  } = useQuery({
    queryKey: ["learning-youtube"],
    queryFn: async (): Promise<YoutubeDigestResponse> => {
      const res = await fetch("/api/learning-plan/youtube");
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Failed to load YouTube picks");
      }
      return res.json();
    },
    enabled: subView === "youtube" || subView === "plan" || subView === "queue",
    staleTime: 5 * 60 * 1000,
  });

  const settingsMutation = useMutation({
    mutationFn: async (payload: {
      weeklyHours?: number;
      categoryPercentages?: Partial<CategoryPercentages>;
      autoQueueYoutube?: boolean;
    }) => {
      const res = await fetch("/api/learning-plan", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "Failed to save");
      return body as LearningBundle;
    },
    onSuccess: (bundle) => {
      queryClient.setQueryData(["learning-plan"], bundle);
      setLocalPercents(null);
      setWeeklyHoursInput(null);
    },
  });

  const youtubeRefreshMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/learning-plan/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "Failed to refresh");
      return body as YoutubeDigestResponse;
    },
    onSuccess: (body) => {
      queryClient.setQueryData(["learning-youtube"], body);
      void queryClient.invalidateQueries({ queryKey: ["learning-plan"] });
    },
  });

  const youtubeQueueMutation = useMutation({
    mutationFn: async (pickIds?: string[]) => {
      const res = await fetch("/api/learning-plan/youtube/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pickIds ? { pickIds } : {}),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "Failed to queue");
      return body as { queued: number; digest: YoutubeDigestResponse["digest"] };
    },
    onSuccess: (body) => {
      if (body.digest) {
        queryClient.setQueryData(["learning-youtube"], {
          digest: body.digest,
          alreadyFresh: true,
        } satisfies YoutubeDigestResponse);
      }
      void queryClient.invalidateQueries({ queryKey: ["learning-plan"] });
    },
  });

  const addMutation = useMutation({
    mutationFn: async (payload: AddForm) => {
      const res = await fetch("/api/learning-plan/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: payload.title,
          url: payload.url,
          category: payload.category,
          durationMinutes: Number(payload.durationMinutes),
          priority: payload.priority,
          status: payload.status,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "Failed to add content");
      return body as { item: LearningContentItemLike };
    },
    onSuccess: () => {
      setForm(emptyForm());
      setFormError(null);
      void queryClient.invalidateQueries({ queryKey: ["learning-plan"] });
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const itemMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/learning-plan/items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "Failed to update");
      return body;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["learning-plan"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/learning-plan/items?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "Failed to delete");
      return body;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["learning-plan"] });
    },
  });

  const percentages =
    localPercents ?? data?.settings.categoryPercentages ?? DEFAULT_CATEGORY_PERCENTAGES;
  const percentTotal = LEARNING_CATEGORIES.reduce(
    (sum, cat) => sum + (percentages[cat.id] ?? 0),
    0
  );
  const percentagesValid = Math.abs(percentTotal - 100) < 0.1;

  const weeklyHoursDisplay =
    weeklyHoursInput ??
    String(data?.settings.weeklyHours ?? DEFAULT_WEEKLY_HOURS);

  const categoryHours = useMemo(() => {
    const hours = Number(weeklyHoursDisplay);
    const safeHours = Number.isFinite(hours) && hours > 0 ? hours : 0;
    return LEARNING_CATEGORIES.map((cat) => {
      const percent = percentages[cat.id] ?? 0;
      return {
        id: cat.id,
        label: cat.label,
        percent,
        hours: Math.round(((safeHours * percent) / 100) * 100) / 100,
      };
    });
  }, [percentages, weeklyHoursDisplay]);

  const filteredItems = useMemo(() => {
    const items = data?.items ?? [];
    return items.filter((item) => {
      if (filterCategory !== "all" && item.category !== filterCategory) return false;
      if (filterStatus !== "all" && item.status !== filterStatus) return false;
      return true;
    });
  }, [data?.items, filterCategory, filterStatus]);

  const unfinishedYoutubeQueue = useMemo(() => {
    const items = data?.items ?? [];
    const playlist: YoutubePlayerTarget[] = [];
    for (const item of items) {
      if (item.status === "completed" || item.status === "skipped") continue;
      const videoId = item.externalId || youtubeVideoIdFromUrl(item.url);
      if (!videoId) continue;
      playlist.push({
        videoId,
        title: item.title,
        queueItemId: item.id,
      });
    }
    return playlist;
  }, [data?.items]);

  const unplayedYoutubePicks = useMemo(() => {
    const picks = youtubeData?.digest?.picks ?? [];
    return picks
      .filter((pick) => pick.status !== "played" && pick.status !== "skipped")
      .map(
        (pick) =>
          ({
            videoId: pick.videoId,
            title: pick.title,
            channelLabel: pick.channelLabel,
            pickId: pick.id,
            queueItemId: pick.queuedItemId,
          }) satisfies YoutubePlayerTarget
      );
  }, [youtubeData?.digest?.picks]);

  const youtubeQueueExhausted =
    (data?.items ?? []).some((item) => youtubeVideoIdFromUrl(item.url) || item.externalId) &&
    unfinishedYoutubeQueue.length === 0;

  const progress = data?.progress;

  const savePercentages = () => {
    if (!localPercents) return;
    settingsMutation.mutate({ categoryPercentages: localPercents });
  };

  const saveWeeklyHours = () => {
    const hours = Number(weeklyHoursInput);
    if (!Number.isFinite(hours) || hours < 0 || hours > 168) return;
    settingsMutation.mutate({ weeklyHours: hours });
  };

  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center py-24 text-[var(--muted)] gap-2">
        <Loader2 className="animate-spin" size={18} />
        Loading learning plan…
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="app-card max-w-3xl mx-auto p-6 space-y-3 text-center">
        <p className="text-[var(--ink)] font-medium">Couldn’t load Learning Plan</p>
        <p className="text-sm text-[var(--muted)]">
          {error instanceof Error ? error.message : "Something went wrong."}
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="app-btn-primary mx-auto"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="app-display text-2xl text-[var(--ink)] tracking-tight">
              Learning Plan
            </h1>
            <p className="mt-1 text-sm text-[var(--muted)] leading-relaxed max-w-xl">
              Shape drive-time learning instead of random recommendations — mix topics,
              queue content, and keep Tech/DMV news in one place.
            </p>
          </div>
          {isFetching && !isLoading ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)]">
              <Loader2 className="animate-spin" size={12} />
              Syncing
            </span>
          ) : null}
        </div>
      </header>

      <nav
        className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1"
        aria-label="Learning Plan sections"
      >
        {SUB_NAV.map(({ id, label, Icon }) => {
          const active = subView === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setSubView(id)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "app-nav-active"
                  : "text-[var(--ink-soft)] hover:bg-[var(--accent-soft)]"
              }`}
              aria-current={active ? "page" : undefined}
            >
              <Icon size={15} className={active ? "text-[var(--accent-strong)]" : ""} />
              {label}
            </button>
          );
        })}
      </nav>

      {subView === "plan" && (
        <div className="space-y-6">
          {/* Progress */}
          <section className="app-card p-5 sm:p-6 space-y-4">
            <div>
              <p className="app-label mb-1">Progress</p>
              <h2 className="text-lg font-semibold text-[var(--ink)] tracking-tight">
                This week’s learning
              </h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                {
                  label: "Planned hours",
                  value: formatHours(progress?.plannedHours ?? 0),
                },
                {
                  label: "Completed hours",
                  value: formatHours(progress?.completedHours ?? 0),
                },
                {
                  label: "Completed items",
                  value: String(progress?.completedItems ?? 0),
                },
                {
                  label: "Progress",
                  value: `${progress?.progressPercent ?? 0}%`,
                },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-xl bg-[color-mix(in_srgb,var(--ink)_5%,transparent)] px-3 py-3 ring-1 ring-[var(--card-border)]"
                >
                  <p className="text-[11px] text-[var(--muted)] font-medium">{stat.label}</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums text-[var(--ink)]">
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>
            <div className="h-2.5 rounded-full bg-[color-mix(in_srgb,var(--ink)_8%,transparent)] overflow-hidden">
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-all duration-500"
                style={{ width: `${Math.min(100, progress?.progressPercent ?? 0)}%` }}
              />
            </div>
          </section>

          {/* Weekly driving time */}
          <section className="app-card p-5 sm:p-6 space-y-4">
            <div>
              <p className="app-label mb-1">Weekly driving time</p>
              <h2 className="text-lg font-semibold text-[var(--ink)] tracking-tight">
                Available learning hours
              </h2>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Commute and drive windows you can put toward the queue.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <label className="flex-1 space-y-1.5">
                <span className="text-xs font-medium text-[var(--muted)]">Hours this week</span>
                <input
                  type="number"
                  min={0}
                  max={168}
                  step={0.5}
                  inputMode="decimal"
                  value={weeklyHoursDisplay}
                  onChange={(e) => setWeeklyHoursInput(e.target.value)}
                  className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--card-solid)] px-3 py-2.5 text-[var(--ink)] tabular-nums outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                />
              </label>
              <button
                type="button"
                disabled={weeklyHoursInput == null || settingsMutation.isPending}
                onClick={saveWeeklyHours}
                className="app-btn-primary disabled:opacity-50"
              >
                {settingsMutation.isPending && weeklyHoursInput != null ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  "Save hours"
                )}
              </button>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-[var(--ink)]">Recommended by topic</p>
              <ul className="divide-y divide-[var(--card-border)] rounded-xl ring-1 ring-[var(--card-border)] overflow-hidden">
                {categoryHours.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center justify-between gap-3 px-3 py-2.5 bg-[var(--card-solid)] text-sm"
                  >
                    <span className="text-[var(--ink-soft)]">{row.label}</span>
                    <span className="tabular-nums font-semibold text-[var(--ink)] shrink-0">
                      {formatHours(row.hours)} hrs
                      <span className="ml-2 text-xs font-normal text-[var(--muted)]">
                        ({formatHours(row.percent)}%)
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* Weekly topic allocation */}
          <section className="app-card p-5 sm:p-6 space-y-4">
            <div>
              <p className="app-label mb-1">Weekly topic allocation</p>
              <h2 className="text-lg font-semibold text-[var(--ink)] tracking-tight">
                Category mix
              </h2>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Percentages should total 100%.
              </p>
            </div>

            {!percentagesValid && (
              <div
                role="alert"
                className="rounded-xl bg-rose-500/10 px-3 py-2.5 text-sm text-rose-800 dark:text-rose-300 ring-1 ring-rose-400/35"
              >
                Total is {formatHours(percentTotal)}% — adjust so it equals 100%.
              </div>
            )}

            <div className="space-y-3">
              {LEARNING_CATEGORIES.map((cat) => (
                <label
                  key={cat.id}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="text-sm text-[var(--ink-soft)] min-w-0 flex-1">
                    {cat.label}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      inputMode="decimal"
                      value={percentages[cat.id]}
                      onChange={(e) => {
                        const next = Number(e.target.value);
                        setLocalPercents({
                          ...percentages,
                          [cat.id]: Number.isFinite(next) ? next : 0,
                        });
                      }}
                      className="w-20 rounded-lg border border-[var(--card-border)] bg-[var(--card-solid)] px-2 py-1.5 text-right text-sm tabular-nums text-[var(--ink)] outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                      aria-label={`${cat.label} percentage`}
                    />
                    <span className="text-xs text-[var(--muted)] w-4">%</span>
                  </div>
                </label>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <p
                className={`text-sm font-semibold tabular-nums ${
                  percentagesValid
                    ? "text-[var(--accent-strong)] dark:text-[var(--accent-bright)]"
                    : "text-rose-600 dark:text-rose-300"
                }`}
              >
                Total: {formatHours(percentTotal)}%
              </p>
              <button
                type="button"
                disabled={!localPercents || settingsMutation.isPending}
                onClick={savePercentages}
                className="app-btn-primary disabled:opacity-50"
              >
                {settingsMutation.isPending && localPercents ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  "Save mix"
                )}
              </button>
            </div>
            {settingsMutation.isError ? (
              <p className="text-sm text-rose-600">
                {settingsMutation.error instanceof Error
                  ? settingsMutation.error.message
                  : "Could not save."}
              </p>
            ) : null}
          </section>
        </div>
      )}

      {subView === "youtube" && (
        <div className="space-y-6">
          <section className="app-card p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="app-label mb-1">Daily YouTube</p>
                <h2 className="text-lg font-semibold text-[var(--ink)] tracking-tight">
                  Drive-time picks for today
                </h2>
                <p className="mt-1 text-xs text-[var(--muted)] max-w-xl">
                  Real videos from founder / AI / sales / finance channels, weighted by your
                  topic mix — not random recommendations.
                </p>
              </div>
              <button
                type="button"
                disabled={youtubeRefreshMutation.isPending}
                onClick={() => youtubeRefreshMutation.mutate()}
                className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-[var(--ink-soft)] ring-1 ring-[var(--card-border)] hover:bg-[var(--accent-soft)] disabled:opacity-50"
              >
                {youtubeRefreshMutation.isPending || youtubeFetching ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <RefreshCw size={14} />
                )}
                Refresh
              </button>
            </div>

            <label className="flex items-start gap-3 rounded-xl bg-[color-mix(in_srgb,var(--ink)_5%,transparent)] px-3 py-3 ring-1 ring-[var(--card-border)]">
              <input
                type="checkbox"
                className="mt-1"
                checked={data?.settings.autoQueueYoutube !== false}
                disabled={settingsMutation.isPending}
                onChange={(e) =>
                  settingsMutation.mutate({ autoQueueYoutube: e.target.checked })
                }
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-[var(--ink)]">
                  Auto-queue daily picks
                </span>
                <span className="block text-xs text-[var(--muted)] mt-0.5">
                  Adds today’s picks to your Learning queue. Continuous play (next video starts
                  when one ends) happens when you hit Play queue / Play here.
                </span>
              </span>
            </label>

            {(youtubeData?.digest?.picks.length ?? 0) > 0 ? (
              <div className="flex flex-wrap gap-2">
                {unplayedYoutubePicks.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => openYoutubePlaylist(unplayedYoutubePicks, 0)}
                    className="app-btn-primary inline-flex items-center gap-2"
                  >
                    <Play size={16} />
                    Play queue
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={youtubeRefreshMutation.isPending}
                    onClick={() => youtubeRefreshMutation.mutate()}
                    className="app-btn-primary inline-flex items-center gap-2 disabled:opacity-50"
                  >
                    {youtubeRefreshMutation.isPending ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <RefreshCw size={16} />
                    )}
                    Regenerate new picks
                  </button>
                )}
                <button
                  type="button"
                  disabled={youtubeQueueMutation.isPending}
                  onClick={() => youtubeQueueMutation.mutate(undefined)}
                  className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-[var(--ink-soft)] ring-1 ring-[var(--card-border)] hover:bg-[var(--accent-soft)] disabled:opacity-50"
                >
                  {youtubeQueueMutation.isPending ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    "Queue all for learning"
                  )}
                </button>
                {youtubeQueueMutation.isSuccess ? (
                  <p className="text-xs self-center text-[var(--accent-strong)]">
                    Queued {youtubeQueueMutation.data.queued} item
                    {youtubeQueueMutation.data.queued === 1 ? "" : "s"}
                  </p>
                ) : null}
              </div>
            ) : null}

            {youtubeRefreshMutation.isError || youtubeQueueMutation.isError ? (
              <p className="text-sm text-rose-600" role="alert">
                {(youtubeRefreshMutation.error || youtubeQueueMutation.error) instanceof Error
                  ? (
                      (youtubeRefreshMutation.error || youtubeQueueMutation.error) as Error
                    ).message
                  : "Something went wrong."}
              </p>
            ) : null}
          </section>

          {youtubeLoading && !youtubeData ? (
            <div className="flex items-center justify-center py-16 text-[var(--muted)] gap-2">
              <Loader2 className="animate-spin" size={18} />
              Curating today’s YouTube picks…
            </div>
          ) : youtubeError && !youtubeData ? (
            <div className="app-card p-6 text-center space-y-3">
              <p className="font-medium text-[var(--ink)]">Couldn’t load YouTube picks</p>
              <p className="text-sm text-[var(--muted)]">
                {youtubeError instanceof Error ? youtubeError.message : "Try again."}
              </p>
              <button
                type="button"
                onClick={() => void refetchYoutube()}
                className="app-btn-primary mx-auto"
              >
                Try again
              </button>
            </div>
          ) : (youtubeData?.digest?.picks.length ?? 0) === 0 ? (
            <div className="app-card p-8 text-center space-y-2">
              <p className="font-medium text-[var(--ink)]">No picks yet</p>
              <p className="text-sm text-[var(--muted)]">
                Hit Refresh to pull today’s videos from your learning channels.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {youtubeData!.digest!.picks.map((pick) => (
                <li key={pick.id} className="app-card p-4 sm:p-5 space-y-3">
                  <div className="space-y-1">
                    <p className="font-semibold text-[var(--ink)] leading-snug">{pick.title}</p>
                    <p className="text-xs text-[var(--muted)]">
                      {pick.channelLabel} · {categoryLabel(pick.category)} ·{" "}
                      {pick.durationMinutes} min
                      {pick.status === "played"
                        ? " · Watched"
                        : pick.status === "queued"
                          ? " · Queued"
                          : ""}
                    </p>
                    {pick.summary ? (
                      <p className="text-sm text-[var(--ink-soft)] leading-relaxed">
                        {pick.summary}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {pick.status === "played" ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-[var(--ink-soft)] ring-1 ring-[var(--card-border)] hover:bg-[var(--accent-soft)]"
                        onClick={() =>
                          openYoutubePlaylist(
                            [
                              {
                                videoId: pick.videoId,
                                title: pick.title,
                                channelLabel: pick.channelLabel,
                                pickId: pick.id,
                                queueItemId: pick.queuedItemId,
                              },
                            ],
                            0
                          )
                        }
                      >
                        <Play size={13} />
                        Replay
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-white bg-[var(--accent)] hover:opacity-90"
                        onClick={() => {
                          const startIndex = unplayedYoutubePicks.findIndex(
                            (row) => row.pickId === pick.id
                          );
                          openYoutubePlaylist(
                            unplayedYoutubePicks.length > 0
                              ? unplayedYoutubePicks
                              : [
                                  {
                                    videoId: pick.videoId,
                                    title: pick.title,
                                    channelLabel: pick.channelLabel,
                                    pickId: pick.id,
                                    queueItemId: pick.queuedItemId,
                                  },
                                ],
                            startIndex >= 0 ? startIndex : 0
                          );
                        }}
                      >
                        <Play size={13} />
                        Play here
                      </button>
                    )}
                    {pick.status === "played" ? null : pick.status !== "queued" ? (
                      <button
                        type="button"
                        disabled={youtubeQueueMutation.isPending}
                        onClick={() => youtubeQueueMutation.mutate([pick.id])}
                        className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-[var(--ink-soft)] ring-1 ring-[var(--card-border)] hover:bg-[var(--accent-soft)] disabled:opacity-50"
                      >
                        <Plus size={13} />
                        Add to queue
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setSubView("queue")}
                        className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-[var(--accent-strong)] hover:bg-[var(--accent-soft)]"
                      >
                        <Check size={13} />
                        In queue
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {subView === "queue" && (
        <div className="space-y-6">
          {unfinishedYoutubeQueue.length > 0 ? (
            <section className="app-card p-5 sm:p-6 space-y-3">
              <div>
                <p className="app-label mb-1">Continuous play</p>
                <h2 className="text-lg font-semibold text-[var(--ink)] tracking-tight">
                  Play the queue straight through
                </h2>
                <p className="mt-1 text-xs text-[var(--muted)] max-w-xl">
                  {unfinishedYoutubeQueue.length} unfinished YouTube item
                  {unfinishedYoutubeQueue.length === 1 ? "" : "s"} — each one marks watched and
                  auto-advances to the next.
                </p>
              </div>
              <button
                type="button"
                onClick={() => openYoutubePlaylist(unfinishedYoutubeQueue, 0)}
                className="app-btn-primary inline-flex items-center gap-2"
              >
                <Play size={16} />
                Play queue
              </button>
            </section>
          ) : youtubeQueueExhausted ? (
            <section className="app-card p-5 sm:p-6 space-y-3">
              <div>
                <p className="app-label mb-1">Queue cleared</p>
                <h2 className="text-lg font-semibold text-[var(--ink)] tracking-tight">
                  Ready for a fresh list
                </h2>
                <p className="mt-1 text-xs text-[var(--muted)] max-w-xl">
                  Watched video ids are stored so regenerate won’t serve the same ones again.
                </p>
              </div>
              <button
                type="button"
                disabled={youtubeRefreshMutation.isPending}
                onClick={() => {
                  setSubView("youtube");
                  youtubeRefreshMutation.mutate();
                }}
                className="app-btn-primary inline-flex items-center gap-2 disabled:opacity-50"
              >
                {youtubeRefreshMutation.isPending ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <RefreshCw size={16} />
                )}
                Regenerate new picks
              </button>
            </section>
          ) : null}

          <section className="app-card p-5 sm:p-6 space-y-4">
            <div>
              <p className="app-label mb-1">Content queue</p>
              <h2 className="text-lg font-semibold text-[var(--ink)] tracking-tight">
                Add something to listen to
              </h2>
            </div>

            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                setFormError(null);
                if (!form.title.trim()) {
                  setFormError("Title is required.");
                  return;
                }
                if (!form.url.trim()) {
                  setFormError("URL is required.");
                  return;
                }
                addMutation.mutate(form);
              }}
            >
              <label className="block space-y-1">
                <span className="text-xs font-medium text-[var(--muted)]">Title</span>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Podcast episode or video title"
                  className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--card-solid)] px-3 py-2.5 text-[var(--ink)] outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                  maxLength={200}
                  required
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-[var(--muted)]">URL</span>
                <input
                  type="url"
                  value={form.url}
                  onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                  placeholder="https://"
                  className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--card-solid)] px-3 py-2.5 text-[var(--ink)] outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                  required
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[var(--muted)]">Category</span>
                  <select
                    value={form.category}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        category: e.target.value as LearningCategoryId,
                      }))
                    }
                    className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--card-solid)] px-3 py-2.5 text-[var(--ink)] outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                  >
                    {LEARNING_CATEGORIES.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[var(--muted)]">
                    Duration (min)
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={600}
                    value={form.durationMinutes}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, durationMinutes: e.target.value }))
                    }
                    className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--card-solid)] px-3 py-2.5 text-[var(--ink)] tabular-nums outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                    required
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[var(--muted)]">Priority</span>
                  <select
                    value={form.priority}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        priority: e.target.value as LearningPriority,
                      }))
                    }
                    className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--card-solid)] px-3 py-2.5 text-[var(--ink)] outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                  >
                    {LEARNING_PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {priorityLabel(p)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[var(--muted)]">Status</span>
                  <select
                    value={form.status}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        status: e.target.value as LearningStatus,
                      }))
                    }
                    className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--card-solid)] px-3 py-2.5 text-[var(--ink)] outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                  >
                    {LEARNING_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {statusLabel(s)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {(formError || addMutation.isError) && (
                <p className="text-sm text-rose-600" role="alert">
                  {formError ||
                    (addMutation.error instanceof Error
                      ? addMutation.error.message
                      : "Could not add content.")}
                </p>
              )}

              <button
                type="submit"
                disabled={addMutation.isPending}
                className="app-btn-primary w-full sm:w-auto disabled:opacity-50"
              >
                {addMutation.isPending ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="animate-spin" size={16} />
                    Adding…
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2">
                    <Plus size={16} />
                    Add to queue
                  </span>
                )}
              </button>
            </form>
          </section>

          <section className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h2 className="text-lg font-semibold text-[var(--ink)] tracking-tight">
                Saved content
              </h2>
              <div className="flex flex-wrap gap-2">
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="rounded-xl border border-[var(--card-border)] bg-[var(--card-solid)] px-3 py-2 text-sm text-[var(--ink)]"
                  aria-label="Filter by category"
                >
                  <option value="all">All categories</option>
                  {LEARNING_CATEGORIES.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.label}
                    </option>
                  ))}
                </select>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="rounded-xl border border-[var(--card-border)] bg-[var(--card-solid)] px-3 py-2 text-sm text-[var(--ink)]"
                  aria-label="Filter by status"
                >
                  <option value="all">All statuses</option>
                  {LEARNING_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {statusLabel(s)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {filteredItems.length === 0 ? (
              <div className="app-card p-8 text-center space-y-2">
                <p className="text-[var(--ink)] font-medium">Queue is empty</p>
                <p className="text-sm text-[var(--muted)]">
                  {(data?.items.length ?? 0) === 0
                    ? "Add a podcast, YouTube video, or article you’ll actually hit on the drive."
                    : "Nothing matches these filters — try clearing category or status."}
                </p>
              </div>
            ) : (
              <ul className="space-y-3">
                {filteredItems.map((item) => (
                  <li key={item.id} className="app-card p-4 sm:p-5 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <p className="font-semibold text-[var(--ink)] leading-snug">
                          {item.title}
                        </p>
                        <p className="text-xs text-[var(--muted)]">
                          {categoryLabel(item.category)} · {item.durationMinutes} min ·{" "}
                          {priorityLabel(item.priority)}
                          {item.source === "youtube_daily" ? " · YouTube daily" : ""}
                        </p>
                      </div>
                      {(() => {
                        const videoId = item.externalId || youtubeVideoIdFromUrl(item.url);
                        if (videoId) {
                          const unfinished = item.status !== "completed" && item.status !== "skipped";
                          return (
                            <button
                              type="button"
                              onClick={() => {
                                if (unfinished && unfinishedYoutubeQueue.length > 0) {
                                  const startIndex = unfinishedYoutubeQueue.findIndex(
                                    (row) => row.queueItemId === item.id
                                  );
                                  openYoutubePlaylist(
                                    unfinishedYoutubeQueue,
                                    startIndex >= 0 ? startIndex : 0
                                  );
                                  return;
                                }
                                openYoutubePlaylist(
                                  [
                                    {
                                      videoId,
                                      title: item.title,
                                      queueItemId: item.id,
                                    },
                                  ],
                                  0
                                );
                              }}
                              className="shrink-0 inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[var(--accent-strong)] hover:bg-[var(--accent-soft)]"
                            >
                              <Play size={12} />
                              {item.status === "completed" ? "Replay" : "Play here"}
                            </button>
                          );
                        }
                        return (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[var(--accent-strong)] hover:bg-[var(--accent-soft)]"
                          >
                            Open
                            <ExternalLink size={12} />
                          </a>
                        );
                      })()}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={item.status}
                        disabled={itemMutation.isPending}
                        onChange={(e) =>
                          itemMutation.mutate({
                            id: item.id,
                            status: e.target.value,
                          })
                        }
                        className="rounded-lg border border-[var(--card-border)] bg-[var(--card-solid)] px-2.5 py-1.5 text-xs text-[var(--ink)]"
                        aria-label={`Status for ${item.title}`}
                      >
                        {LEARNING_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {statusLabel(s)}
                          </option>
                        ))}
                      </select>

                      {item.status !== "completed" ? (
                        <button
                          type="button"
                          disabled={itemMutation.isPending}
                          onClick={() =>
                            itemMutation.mutate({ id: item.id, markComplete: true })
                          }
                          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[var(--accent-strong)] hover:bg-[var(--accent-soft)] disabled:opacity-50"
                        >
                          <Check size={13} />
                          Complete
                        </button>
                      ) : null}

                      <button
                        type="button"
                        disabled={deleteMutation.isPending}
                        onClick={() => {
                          if (window.confirm(`Delete “${item.title}”?`)) {
                            deleteMutation.mutate(item.id);
                          }
                        }}
                        className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-500/10 disabled:opacity-50 ml-auto"
                      >
                        <Trash2 size={13} />
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {subView === "tech" && (
        <TrendsErrorBoundary lane="tech">
          <TrendsView
            lane="tech"
            onOpenGrowth={onOpenGrowth}
            onOpenOtherLane={() => setSubView("dmv")}
          />
        </TrendsErrorBoundary>
      )}

      {subView === "dmv" && (
        <TrendsErrorBoundary lane="dmv">
          <TrendsView
            lane="dmv"
            onOpenGrowth={onOpenGrowth}
            onOpenOtherLane={() => setSubView("tech")}
          />
        </TrendsErrorBoundary>
      )}

      {playerSession ? (
        <YoutubePlayerModal
          playlist={playerSession.playlist}
          startIndex={playerSession.startIndex}
          onClose={() => setPlayerSession(null)}
          onVideoWatched={recordVideoWatched}
          onRegenerate={() => {
            setPlayerSession(null);
            setSubView("youtube");
            youtubeRefreshMutation.mutate();
          }}
          regenerating={youtubeRefreshMutation.isPending}
        />
      ) : null}
    </div>
  );
}
