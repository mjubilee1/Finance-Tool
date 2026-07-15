"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Car, MessageSquare, RefreshCw } from "lucide-react";
import { LyftPaceCard, type LyftPaceSnapshot } from "@/components/overview/lyft-pace-card";
import { buildLyftPaceSnapshot } from "@/lib/lyft";
import { DateTime } from "luxon";

type Props = {
  onOpenChat: () => void;
  onOpenGrowth?: () => void;
};

function emptyPace(): LyftPaceSnapshot {
  return buildLyftPaceSnapshot([], DateTime.local().toISODate()!);
}

export function LyftBoardView({ onOpenChat, onOpenGrowth }: Props) {
  const queryClient = useQueryClient();

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["overview-today"],
    queryFn: async () => {
      const res = await fetch("/api/today");
      if (!res.ok) {
        throw new Error("Failed to load Lyft board");
      }
      return res.json() as Promise<{ lyftPace?: LyftPaceSnapshot | null }>;
    },
    staleTime: 60_000,
  });

  const pace = data?.lyftPace ?? (isLoading ? null : emptyPace());

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center ring-1 ring-[color-mix(in_srgb,var(--accent)_28%,transparent)] shrink-0">
            <Car size={20} className="text-[var(--accent-strong)] dark:text-[var(--accent-bright)]" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--accent-strong)] dark:text-[var(--accent-bright)]">
              Lyft board
            </p>
            <h1 className="text-xl md:text-2xl app-display text-[var(--ink)] tracking-tight mt-1">
              Weekly profit pace
            </h1>
            <p className="text-sm text-[var(--muted)] mt-1 max-w-lg">
              Fee first, then Capital One profit. Hit/miss by day — take a break when ahead, make it
              back when behind.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--ink)_5%,transparent)] px-3 py-2 text-xs font-semibold text-[var(--ink)] ring-1 ring-[var(--card-border)] disabled:opacity-60 shrink-0"
        >
          <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {isError ? (
        <div className="rounded-xl bg-amber-500/15 px-4 py-3 text-sm text-amber-950 dark:text-amber-100 ring-1 ring-amber-400/35">
          Couldn&apos;t refresh live earnings. Showing the board shell — try Refresh or log from
          Growth.
        </div>
      ) : null}

      {isLoading && !pace ? (
        <div className="app-card p-8 text-center text-sm text-[var(--muted)]">
          Loading Lyft board…
        </div>
      ) : pace ? (
        <LyftPaceCard
          pace={pace}
          onAskCoach={onOpenChat}
          onLogEarnings={() => {
            void queryClient.invalidateQueries({ queryKey: ["overview-today"] });
            onOpenGrowth?.();
          }}
        />
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onOpenChat}
          className="inline-flex items-center gap-1.5 rounded-full app-btn-primary px-3.5 py-2 text-xs"
        >
          <MessageSquare size={14} />
          Ask coach: drive or break?
        </button>
        {onOpenGrowth ? (
          <button
            type="button"
            onClick={onOpenGrowth}
            className="inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--ink)_5%,transparent)] px-3.5 py-2 text-xs font-semibold text-[var(--ink)] ring-1 ring-[var(--card-border)]"
          >
            Log Lyft in Growth
          </button>
        ) : null}
      </div>
    </div>
  );
}
