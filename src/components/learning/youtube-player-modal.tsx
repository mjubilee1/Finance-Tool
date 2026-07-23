"use client";

import { ExternalLink, X } from "lucide-react";
import { useEffect } from "react";
import { youtubeAutoplayUrl, youtubeEmbedUrl } from "@/lib/learning-plan";

export type YoutubePlayerTarget = {
  videoId: string;
  title: string;
  channelLabel?: string | null;
};

export function YoutubePlayerModal({
  video,
  onClose,
}: {
  video: YoutubePlayerTarget;
  onClose: () => void;
}) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-[color-mix(in_oklab,var(--ink)_55%,transparent)] p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Playing ${video.title}`}
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl overflow-hidden rounded-t-2xl sm:rounded-2xl bg-[var(--card-solid)] shadow-xl ring-1 ring-[var(--card-border)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-4 py-3 sm:px-5 border-b border-[var(--card-border)]">
          <div className="min-w-0 space-y-0.5">
            <p className="font-semibold text-[var(--ink)] leading-snug line-clamp-2">
              {video.title}
            </p>
            {video.channelLabel ? (
              <p className="text-xs text-[var(--muted)]">{video.channelLabel}</p>
            ) : (
              <p className="text-xs text-[var(--muted)]">
                Stays in Learning — won’t open the YouTube app
              </p>
            )}
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

        <div className="relative aspect-video w-full bg-black">
          <iframe
            key={video.videoId}
            src={youtubeEmbedUrl(video.videoId, { autoplay: true })}
            title={video.title}
            className="absolute inset-0 h-full w-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5">
          <p className="text-xs text-[var(--muted)] max-w-[20rem]">
            Watch here so YouTube doesn’t pull you into related videos.
          </p>
          <a
            href={youtubeAutoplayUrl(video.videoId)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[var(--ink-soft)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]"
          >
            Open in YouTube
            <ExternalLink size={12} />
          </a>
        </div>
      </div>
    </div>
  );
}
