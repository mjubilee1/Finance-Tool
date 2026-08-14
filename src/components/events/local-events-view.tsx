"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DateTime } from "luxon";
import {
  CalendarDays,
  Check,
  ExternalLink,
  Loader2,
  MapPin,
  RefreshCw,
  Star,
  X,
} from "lucide-react";
import {
  distanceLabel,
  regionLabel,
  themeLabel,
} from "@/lib/local-events-shared";

type LocalEventItem = {
  id: string;
  title: string;
  summary: string;
  whyItMatters: string;
  theme: string;
  region: string;
  distanceTier: string;
  city: string | null;
  venue: string | null;
  startsOn: string | null;
  endsOn: string | null;
  dayFit: string;
  driveMinutes: number | null;
  sourceLabel: string;
  sourceUrl: string | null;
  relevanceScore: number;
  confidence: string;
  status: string;
  loggedActivityId: string | null;
};

type LocalEventDigest = {
  id: string;
  date: string;
  radar: { title: string; why: string; oneAction: string };
  focusGuardrail: string;
  updatedAt: string;
  createdAt: string;
  items: LocalEventItem[];
};

type LocalEventsResponse = {
  digest: LocalEventDigest;
  refreshed?: boolean;
  alreadyFresh?: boolean;
};

const DAY_FIT_LABELS: Record<string, string> = {
  evening: "Evening",
  wfh_flex: "WFH flex",
  weekend: "Weekend",
  weekend_trip: "Weekend trip",
};

function dayFitLabel(value: string) {
  return DAY_FIT_LABELS[value] ?? value.replaceAll("_", " ");
}

function formatWhen(item: LocalEventItem) {
  if (!item.startsOn) return "Date TBD — check source";
  const start = DateTime.fromISO(item.startsOn);
  if (!start.isValid) return item.startsOn;
  if (item.endsOn && item.endsOn !== item.startsOn) {
    const end = DateTime.fromISO(item.endsOn);
    if (end.isValid) {
      return `${start.toFormat("ccc, LLL d")} – ${end.toFormat("ccc, LLL d")}`;
    }
  }
  return start.toFormat("ccc, LLL d");
}

async function fetchLocalEvents(): Promise<LocalEventsResponse> {
  const res = await fetch("/api/local-events");
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || "Failed to load local events");
  }
  return res.json();
}

export function LocalEventsView() {
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["local-events"],
    queryFn: fetchLocalEvents,
    staleTime: 5 * 60 * 1000,
  });

  const refreshMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/local-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "Failed to refresh");
      return body as LocalEventsResponse;
    },
    onSuccess: (body) => {
      queryClient.setQueryData(["local-events"], body);
    },
  });

  const itemMutation = useMutation({
    mutationFn: async (payload: {
      id: string;
      status?: string;
      logToGrowth?: boolean;
    }) => {
      const res = await fetch("/api/local-events/items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "Failed to update");
      return body as {
        item: { id: string; status: string; loggedActivityId: string | null };
      };
    },
    onSuccess: (body) => {
      queryClient.setQueryData<LocalEventsResponse | undefined>(["local-events"], (prev) => {
        if (!prev?.digest) return prev;
        return {
          ...prev,
          digest: {
            ...prev.digest,
            items: prev.digest.items.map((item) =>
              item.id === body.item.id
                ? {
                    ...item,
                    status: body.item.status,
                    loggedActivityId: body.item.loggedActivityId,
                  }
                : item
            ),
          },
        };
      });
      void queryClient.invalidateQueries({ queryKey: ["growth-dashboard"] });
    },
  });

  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center py-16 text-[var(--muted)] gap-2">
        <Loader2 className="animate-spin" size={18} />
        Curating local events…
      </div>
    );
  }

  if ((error || !data?.digest) && !isLoading) {
    return (
      <div className="app-card p-6 text-center space-y-3">
        <p className="font-medium text-[var(--ink)]">Couldn’t load local events</p>
        <p className="text-sm text-[var(--muted)]">
          {error instanceof Error ? error.message : "Try again."}
        </p>
        <button type="button" onClick={() => void refetch()} className="app-btn-primary mx-auto">
          Try again
        </button>
      </div>
    );
  }

  const digest = data!.digest;
  const updatedLabel = DateTime.fromISO(digest.updatedAt).toFormat("MMM d · h:mm a");
  const items = digest.items.filter((item) => item.status !== "dismissed");
  const dismissedCount = digest.items.length - items.length;

  return (
    <div className="space-y-6">
      <section className="app-card p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="app-label mb-1">Local events</p>
            <h1 className="text-xl sm:text-2xl font-semibold text-[var(--ink)] tracking-tight">
              Outings that compound
            </h1>
            <p className="mt-1 text-xs text-[var(--muted)] max-w-xl">
              DMV nearby first, then Baltimore, Richmond, and Virginia Beach when the drive fits.
              Curated for network, skills, festivals, body, and intentional social — not random
              nights with nothing to show.
            </p>
          </div>
          <button
            type="button"
            disabled={refreshMutation.isPending || isFetching}
            onClick={() => refreshMutation.mutate()}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-[var(--ink-soft)] ring-1 ring-[var(--card-border)] hover:bg-[var(--accent-soft)] disabled:opacity-50"
          >
            {refreshMutation.isPending || isFetching ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <RefreshCw size={14} />
            )}
            Refresh
          </button>
        </div>

        <div className="rounded-xl bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] px-3 py-3 sm:px-4 sm:py-4 ring-1 ring-[var(--card-border)] space-y-2">
          <p className="app-label">Today’s radar</p>
          <p className="text-base font-semibold text-[var(--ink)]">{digest.radar.title}</p>
          <p className="text-sm text-[var(--ink-soft)] leading-relaxed">{digest.radar.why}</p>
          <p className="text-sm text-[var(--ink)]">
            <span className="font-medium">Next step:</span> {digest.radar.oneAction}
          </p>
        </div>

        <p className="text-xs text-[var(--muted)]">{digest.focusGuardrail}</p>
        <p className="text-[11px] text-[var(--muted)]">Updated {updatedLabel}</p>

        {refreshMutation.isError ? (
          <p className="text-sm text-rose-600" role="alert">
            {refreshMutation.error instanceof Error
              ? refreshMutation.error.message
              : "Could not refresh."}
          </p>
        ) : null}
      </section>

      {items.length === 0 ? (
        <div className="app-card p-8 text-center space-y-2">
          <p className="font-medium text-[var(--ink)]">No active events</p>
          <p className="text-sm text-[var(--muted)]">
            {dismissedCount > 0
              ? "Everything for today is dismissed — hit Refresh for a new radar."
              : "Hit Refresh to pull today’s local radar."}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id} className="app-card p-4 sm:p-5 space-y-3">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--muted)]">
                  <span className="font-medium text-[var(--accent-strong)]">
                    {themeLabel(item.theme)}
                  </span>
                  <span>·</span>
                  <span>{regionLabel(item.region)}</span>
                  <span>·</span>
                  <span>{distanceLabel(item.distanceTier)}</span>
                  {item.confidence === "directional" ? (
                    <>
                      <span>·</span>
                      <span>Directional</span>
                    </>
                  ) : null}
                  {item.status !== "new" ? (
                    <>
                      <span>·</span>
                      <span className="capitalize">{item.status}</span>
                    </>
                  ) : null}
                </div>
                <p className="font-semibold text-[var(--ink)] leading-snug">{item.title}</p>
                <p className="text-sm text-[var(--ink-soft)] leading-relaxed">{item.summary}</p>
                <p className="text-sm text-[var(--ink)] leading-relaxed">
                  <span className="font-medium">Why it fits:</span> {item.whyItMatters}
                </p>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays size={12} />
                    {formatWhen(item)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin size={12} />
                    {[item.city, item.venue].filter(Boolean).join(" · ") || "Location TBD"}
                  </span>
                  <span>{dayFitLabel(item.dayFit)}</span>
                  {item.driveMinutes ? <span>~{item.driveMinutes} min drive</span> : null}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {item.sourceUrl ? (
                  <a
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-[var(--ink-soft)] ring-1 ring-[var(--card-border)] hover:bg-[var(--accent-soft)]"
                  >
                    <ExternalLink size={13} />
                    {item.sourceLabel}
                  </a>
                ) : null}

                {item.status === "interested" || item.loggedActivityId ? (
                  <span className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-[var(--accent-strong)]">
                    <Check size={13} />
                    In Growth
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={itemMutation.isPending}
                    onClick={() =>
                      itemMutation.mutate({
                        id: item.id,
                        logToGrowth: true,
                        status: "interested",
                      })
                    }
                    className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-white bg-[var(--accent)] hover:opacity-90 disabled:opacity-50"
                  >
                    <Star size={13} />
                    Interested
                  </button>
                )}

                {item.status === "planned" ? (
                  <span className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-[var(--accent-strong)]">
                    Planned
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={itemMutation.isPending}
                    onClick={() => itemMutation.mutate({ id: item.id, status: "planned" })}
                    className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-[var(--ink-soft)] ring-1 ring-[var(--card-border)] hover:bg-[var(--accent-soft)] disabled:opacity-50"
                  >
                    Plan it
                  </button>
                )}

                <button
                  type="button"
                  disabled={itemMutation.isPending}
                  onClick={() => itemMutation.mutate({ id: item.id, status: "dismissed" })}
                  className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-[var(--muted)] hover:bg-[var(--accent-soft)] disabled:opacity-50"
                >
                  <X size={13} />
                  Skip
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
