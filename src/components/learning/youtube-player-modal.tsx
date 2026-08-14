"use client";

import { ExternalLink, Play, RefreshCw, SkipForward, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { youtubeAutoplayUrl } from "@/lib/learning-plan";

export type YoutubePlayerTarget = {
  videoId: string;
  title: string;
  channelLabel?: string | null;
  /** LearningContentItem id when playing from the queue */
  queueItemId?: string | null;
  /** LearningYoutubePick id when playing from daily picks */
  pickId?: string | null;
};

type YtPlayer = {
  destroy: () => void;
  loadVideoById: (videoId: string) => void;
  playVideo?: () => void;
  getPlayerState?: () => number;
};

type YtPlayerEvent = { data: number };

declare global {
  interface Window {
    YT?: {
      Player: new (
        element: HTMLElement | string,
        options: {
          videoId: string;
          width?: string | number;
          height?: string | number;
          playerVars?: Record<string, string | number>;
          events?: {
            onReady?: (event: { target: YtPlayer }) => void;
            onStateChange?: (event: YtPlayerEvent) => void;
            onError?: (event: YtPlayerEvent) => void;
          };
        }
      ) => YtPlayer;
      PlayerState: {
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
        CUED: number;
        BUFFERING: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youtubeApiPromise: Promise<void> | null = null;

function loadYoutubeIframeApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    const prior = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prior?.();
      finish();
    };

    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      document.head.appendChild(script);
    }

    const started = Date.now();
    const timer = window.setInterval(() => {
      if (window.YT?.Player) {
        window.clearInterval(timer);
        finish();
      } else if (Date.now() - started > 12000) {
        window.clearInterval(timer);
      }
    }, 50);
  });

  return youtubeApiPromise;
}

function tryPlay(player: YtPlayer | null | undefined) {
  try {
    player?.playVideo?.();
  } catch {
    // ignore — unlock overlay handles blocked autoplay
  }
}

export function YoutubePlayerModal({
  playlist,
  startIndex = 0,
  onClose,
  onVideoWatched,
  onQueueExhausted,
  onRegenerate,
  regenerating = false,
  /** Drive-time: nudge unlock + auto-regenerate when the run ends. */
  handsFree = false,
}: {
  playlist: YoutubePlayerTarget[];
  startIndex?: number;
  onClose: () => void;
  onVideoWatched: (video: YoutubePlayerTarget) => void | Promise<void>;
  onQueueExhausted?: () => void;
  onRegenerate?: () => void;
  regenerating?: boolean;
  handsFree?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YtPlayer | null>(null);
  const indexRef = useRef(startIndex);
  const playlistRef = useRef(playlist);
  const watchedIdsRef = useRef(new Set<string>());
  const advancingRef = useRef(false);
  const unlockedRef = useRef(false);
  const autoRegenRequestedRef = useRef(false);
  const playProbeTimerRef = useRef<number | null>(null);

  const [index, setIndex] = useState(() =>
    Math.min(Math.max(0, startIndex), Math.max(0, playlist.length - 1))
  );
  const [exhausted, setExhausted] = useState(playlist.length === 0);
  const [apiError, setApiError] = useState<string | null>(null);
  const [needsUnlock, setNeedsUnlock] = useState(false);

  useEffect(() => {
    playlistRef.current = playlist;
  }, [playlist]);

  const current = playlist[index] ?? null;
  const remainingAfter = Math.max(0, playlist.length - index - 1);

  function clearPlayProbe() {
    if (playProbeTimerRef.current != null) {
      window.clearTimeout(playProbeTimerRef.current);
      playProbeTimerRef.current = null;
    }
  }

  function schedulePlayProbe() {
    clearPlayProbe();
    if (unlockedRef.current) return;
    playProbeTimerRef.current = window.setTimeout(() => {
      const state = playerRef.current?.getPlayerState?.();
      const playing = state === window.YT?.PlayerState.PLAYING;
      const buffering = state === window.YT?.PlayerState.BUFFERING;
      if (!playing && !buffering) {
        setNeedsUnlock(true);
      }
    }, 1400);
  }

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);

    let wakeLock: WakeLockSentinel | null = null;
    const requestWakeLock = async () => {
      try {
        if (typeof navigator !== "undefined" && "wakeLock" in navigator) {
          wakeLock = await navigator.wakeLock.request("screen");
        }
      } catch {
        // Battery / permission — ignore
      }
    };
    void requestWakeLock();

    const onVisibility = () => {
      if (document.visibilityState === "visible") void requestWakeLock();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("visibilitychange", onVisibility);
      clearPlayProbe();
      void wakeLock?.release().catch(() => undefined);
    };
  }, [onClose]);

  async function markWatched(video: YoutubePlayerTarget) {
    if (watchedIdsRef.current.has(video.videoId)) return;
    watchedIdsRef.current.add(video.videoId);
    await onVideoWatched(video);
  }

  async function advanceFrom(fromIndex: number) {
    if (advancingRef.current) return;
    advancingRef.current = true;
    try {
      const list = playlistRef.current;
      const finished = list[fromIndex];
      if (finished) await markWatched(finished);

      const nextIndex = fromIndex + 1;
      if (nextIndex >= list.length) {
        setExhausted(true);
        onQueueExhausted?.();
        return;
      }

      indexRef.current = nextIndex;
      setIndex(nextIndex);
      const next = list[nextIndex];
      playerRef.current?.loadVideoById(next.videoId);
      // Mobile browsers often need an explicit play after loadVideoById.
      window.setTimeout(() => tryPlay(playerRef.current), 50);
      window.setTimeout(() => tryPlay(playerRef.current), 400);
      if (!unlockedRef.current) schedulePlayProbe();
    } finally {
      advancingRef.current = false;
    }
  }

  function unlockAndPlay() {
    unlockedRef.current = true;
    setNeedsUnlock(false);
    clearPlayProbe();
    tryPlay(playerRef.current);
  }

  useEffect(() => {
    if (!handsFree || !exhausted || !onRegenerate || regenerating) return;
    if (autoRegenRequestedRef.current) return;
    autoRegenRequestedRef.current = true;
    onRegenerate();
  }, [handsFree, exhausted, onRegenerate, regenerating]);

  useEffect(() => {
    if (!current || exhausted) return;
    let cancelled = false;
    let player: YtPlayer | null = null;

    void loadYoutubeIframeApi()
      .then(() => {
        if (cancelled || !hostRef.current || !window.YT?.Player) {
          if (!cancelled) setApiError("Couldn’t load the in-app player.");
          return;
        }

        // Clear host so YT can remount cleanly when modal reopens.
        hostRef.current.innerHTML = "";
        const mount = document.createElement("div");
        hostRef.current.appendChild(mount);

        player = new window.YT.Player(mount, {
          videoId: current.videoId,
          width: "100%",
          height: "100%",
          playerVars: {
            autoplay: 1,
            playsinline: 1,
            rel: 0,
            modestbranding: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: (event) => {
              playerRef.current = event.target;
              tryPlay(event.target);
              schedulePlayProbe();
            },
            onStateChange: (event) => {
              if (event.data === window.YT?.PlayerState.PLAYING) {
                unlockedRef.current = true;
                setNeedsUnlock(false);
                clearPlayProbe();
              }
              if (event.data === window.YT?.PlayerState.ENDED) {
                void advanceFrom(indexRef.current);
              }
            },
            onError: () => {
              // Skip broken embeds so the queue keeps moving.
              void advanceFrom(indexRef.current);
            },
          },
        });
        playerRef.current = player;
      })
      .catch(() => {
        if (!cancelled) setApiError("Couldn’t load the in-app player.");
      });

    return () => {
      cancelled = true;
      clearPlayProbe();
      try {
        player?.destroy();
      } catch {
        // ignore
      }
      playerRef.current = null;
    };
    // Intentionally only bootstrap once per modal open; advances use loadVideoById.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exhausted]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-[color-mix(in_oklab,var(--ink)_55%,transparent)] p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={current ? `Playing ${current.title}` : "Learning queue finished"}
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl overflow-hidden rounded-t-2xl sm:rounded-2xl bg-[var(--card-solid)] shadow-xl ring-1 ring-[var(--card-border)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-4 py-3 sm:px-5 border-b border-[var(--card-border)]">
          <div className="min-w-0 space-y-0.5">
            {exhausted ? (
              <>
                <p className="font-semibold text-[var(--ink)] leading-snug">Queue finished</p>
                <p className="text-xs text-[var(--muted)]">
                  {handsFree
                    ? "Pulling a fresh drive-time list so you can keep going…"
                    : "Watched videos are saved so regenerate won’t repeat them."}
                </p>
              </>
            ) : current ? (
              <>
                <p className="font-semibold text-[var(--ink)] leading-snug line-clamp-2">
                  {current.title}
                </p>
                <p className="text-xs text-[var(--muted)]">
                  {current.channelLabel ? `${current.channelLabel} · ` : ""}
                  {index + 1} of {playlist.length}
                  {remainingAfter > 0
                    ? ` · ${remainingAfter} more autoplay after this`
                    : " · last in this run"}
                </p>
              </>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-2 text-[var(--ink-soft)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]"
            aria-label="Close player"
          >
            <X size={18} />
          </button>
        </div>

        {exhausted ? (
          <div className="px-4 py-10 sm:px-5 space-y-4 text-center">
            <p className="text-sm text-[var(--ink-soft)] max-w-md mx-auto leading-relaxed">
              {handsFree
                ? "You’ve cleared this run. Fresh picks are loading so the drive queue can continue without another hunt for Play."
                : "You’ve cleared this run. Pull a fresh drive-time list — watched video ids stay blocked so you don’t get the same ones again."}
            </p>
            {onRegenerate ? (
              <button
                type="button"
                disabled={regenerating}
                onClick={onRegenerate}
                className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-[var(--accent)] hover:opacity-90 disabled:opacity-50"
              >
                {regenerating ? (
                  <RefreshCw size={15} className="animate-spin" />
                ) : (
                  <RefreshCw size={15} />
                )}
                {regenerating ? "Refreshing…" : "Regenerate new picks"}
              </button>
            ) : null}
          </div>
        ) : (
          <div className="relative aspect-video w-full bg-black">
            <div ref={hostRef} className="absolute inset-0 h-full w-full [&>iframe]:h-full [&>iframe]:w-full" />
            {apiError ? (
              <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-white/90">
                {apiError}
              </div>
            ) : null}
            {needsUnlock && !apiError ? (
              <button
                type="button"
                onClick={unlockAndPlay}
                className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/70 px-6 text-center text-white"
              >
                <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-lg">
                  <Play size={28} fill="currentColor" />
                </span>
                <span className="text-base font-semibold tracking-tight">
                  Tap once to start drive play
                </span>
                <span className="max-w-xs text-sm text-white/80 leading-relaxed">
                  Phones block sound until one tap. After that, the next videos keep going on their
                  own — no Next needed.
                </span>
              </button>
            ) : null}
          </div>
        )}

        {!exhausted && current ? (
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5">
            <p className="text-xs text-[var(--muted)] max-w-[18rem]">
              Hands-free in Learning — next queue item starts when this one ends. Keep the screen
              awake.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {remainingAfter > 0 ? (
                <button
                  type="button"
                  onClick={() => void advanceFrom(index)}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[var(--ink-soft)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]"
                >
                  Next
                  <SkipForward size={12} />
                </button>
              ) : null}
              <a
                href={youtubeAutoplayUrl(current.videoId)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[var(--ink-soft)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]"
              >
                Open in YouTube
                <ExternalLink size={12} />
              </a>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
