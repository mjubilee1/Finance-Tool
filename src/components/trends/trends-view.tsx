"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DateTime } from "luxon";
import {
  ExternalLink,
  Loader2,
  ParkingCircle,
  Radar,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";

type TrendItem = {
  id: string;
  title: string;
  summary: string;
  whyItMatters: string;
  theme: string;
  sourceLabel: string;
  sourceUrl: string | null;
  relevanceScore: number;
  status: string;
  loggedActivityId: string | null;
};

type TrendDigest = {
  id: string;
  date: string;
  mainThing: { title: string; why: string; oneAction: string };
  focusGuardrail: string;
  updatedAt: string;
  createdAt: string;
  items: TrendItem[];
};

type TrendsResponse = {
  digest: TrendDigest;
  refreshed?: boolean;
  alreadyFresh?: boolean;
};

const THEME_LABELS: Record<string, string> = {
  ai_models: "AI models",
  labs: "Research labs",
  infra: "Infra",
  startup: "Startup",
  hardware_software: "Hardware × software",
};

function themeLabel(theme: string) {
  return THEME_LABELS[theme] ?? theme.replaceAll("_", " ");
}

export function TrendsView({ onOpenGrowth }: { onOpenGrowth?: () => void }) {
  const queryClient = useQueryClient();
  const { data, isLoading, isFetching, error, refetch } = useQuery<TrendsResponse>({
    queryKey: ["trends-digest"],
    queryFn: async () => {
      const res = await fetch("/api/trends");
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Failed to load trends");
      }
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const digest = data?.digest;

  const patchItem = async (
    id: string,
    payload: { status?: string; logToGrowth?: boolean },
  ) => {
    const res = await fetch("/api/trends/items", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...payload }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      alert(body?.error || "Could not update");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["trends-digest"] });
    if (payload.logToGrowth) {
      queryClient.invalidateQueries({ queryKey: ["growth-dashboard"] });
    }
  };

  const refresh = async () => {
    const res = await fetch("/api/trends", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force: true }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      alert(body?.error || "Could not refresh");
      return;
    }
    if (body?.alreadyFresh && !body?.refreshed) {
      alert("Already fresh for today — come back later or tomorrow.");
    }
    await queryClient.invalidateQueries({ queryKey: ["trends-digest"] });
    await refetch();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-500 gap-2">
        <Loader2 className="animate-spin" size={18} />
        Curating today&apos;s signal…
      </div>
    );
  }

  if (error || !digest) {
    return (
      <div className="app-card p-8 text-center space-y-3">
        <p className="text-slate-700">Couldn&apos;t load trends.</p>
        <button type="button" onClick={() => refetch()} className="app-btn-primary px-4 py-2 text-sm">
          Retry
        </button>
      </div>
    );
  }

  const updatedLabel = DateTime.fromISO(digest.updatedAt).toFormat("MMM d · h:mm a");

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl app-display text-slate-900 tracking-tight">Trends</h1>
          <p className="text-sm text-slate-600 mt-1 leading-relaxed max-w-xl">
            Signal for a builder — AI models, labs, infra, and how hardware + software connect.
            Not a firehose. Not a reason to start something new.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onOpenGrowth ? (
            <button
              type="button"
              onClick={onOpenGrowth}
              className="px-3 py-2 text-xs font-semibold text-teal-800 hover:bg-teal-50 rounded-xl"
            >
              Growth →
            </button>
          ) : null}
          <button
            type="button"
            onClick={refresh}
            disabled={isFetching}
            className="inline-flex items-center gap-2 app-btn-primary px-3 py-2 text-xs disabled:opacity-50"
          >
            {isFetching ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Refresh
          </button>
        </div>
      </div>

      <p className="text-xs text-slate-500">Updated {updatedLabel}</p>

      <div className="rounded-2xl bg-amber-50/90 p-4 ring-1 ring-amber-200/70 text-sm text-amber-950 leading-relaxed">
        <p className="font-semibold mb-1">Main thing · main thing</p>
        <p>{digest.focusGuardrail}</p>
      </div>

      <div className="app-card p-6 ring-1 ring-teal-200/60 bg-teal-50/40">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-9 h-9 rounded-xl bg-white/80 ring-1 ring-teal-200/60 flex items-center justify-center">
            <Sparkles size={16} className="text-teal-700" />
          </div>
          <p className="app-label text-teal-800">Main thing today</p>
        </div>
        <h2 className="text-xl font-semibold text-slate-900 leading-snug">
          {digest.mainThing.title}
        </h2>
        <p className="text-sm text-slate-700 mt-2 leading-relaxed">{digest.mainThing.why}</p>
        <p className="mt-4 text-sm font-medium text-teal-900 leading-relaxed">
          One action: {digest.mainThing.oneAction}
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Radar size={16} className="text-slate-400" />
          <h3 className="font-semibold text-slate-900">Today&apos;s signal</h3>
          <span className="text-xs text-slate-500">({digest.items.length} max 5)</span>
        </div>

        {digest.items.map((item) => {
          const inactive = item.status === "dismissed" || item.status === "parked";
          return (
            <article
              key={item.id}
              className={`app-card p-5 ${inactive ? "opacity-60" : ""}`}
            >
              <div className="flex flex-wrap gap-2 mb-2">
                <span className="text-[10px] uppercase tracking-wider font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md">
                  {themeLabel(item.theme)}
                </span>
                <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500 px-2 py-0.5 rounded-md ring-1 ring-slate-200/60">
                  {item.sourceLabel}
                </span>
                {item.status !== "new" ? (
                  <span className="text-[10px] uppercase tracking-wider font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded-md">
                    {item.status}
                  </span>
                ) : null}
              </div>
              <h4 className="font-semibold text-slate-900">{item.title}</h4>
              <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">{item.summary}</p>
              <p className="text-sm text-slate-800 mt-2 leading-relaxed">
                <span className="font-medium">For you:</span> {item.whyItMatters}
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-4">
                {item.sourceUrl ? (
                  <a
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
                  >
                    Source <ExternalLink size={12} />
                  </a>
                ) : null}
                <button
                  type="button"
                  disabled={Boolean(item.loggedActivityId) || item.status === "noted"}
                  onClick={() => patchItem(item.id, { logToGrowth: true })}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg app-btn-primary disabled:opacity-50"
                >
                  {item.loggedActivityId || item.status === "noted"
                    ? "Noted in Growth"
                    : "Note in Growth"}
                </button>
                <button
                  type="button"
                  onClick={() => patchItem(item.id, { status: "parked" })}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 rounded-lg"
                >
                  <ParkingCircle size={13} /> Park
                </button>
                <button
                  type="button"
                  onClick={() => patchItem(item.id, { status: "dismissed" })}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-rose-50 hover:text-rose-700 rounded-lg"
                >
                  <X size={13} /> Dismiss
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
