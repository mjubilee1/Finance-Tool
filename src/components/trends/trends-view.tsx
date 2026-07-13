"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DateTime } from "luxon";
import { useEffect } from "react";
import {
  BookOpenCheck,
  Cpu,
  ExternalLink,
  Loader2,
  MapPin,
  ParkingCircle,
  RefreshCw,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useBrowserSpeech } from "@/hooks/use-browser-speech";
import { isDmvPageTheme, isTechTrendTheme } from "@/lib/trends";
import { buildTrendsSpeechText } from "@/lib/trends-speech";

export type TrendsLane = "tech" | "dmv";

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

type MainThing = { title: string; why: string; oneAction: string };

type TrendDigest = {
  id: string;
  date: string;
  mainThing: MainThing;
  techMain: MainThing;
  dmvMain: MainThing;
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
  markets: "Markets",
  real_estate: "Real estate",
  dmv_state: "DMV · politics",
};

function themeLabel(theme: string) {
  return THEME_LABELS[theme] ?? theme.replaceAll("_", " ");
}

function topReadId(items: TrendItem[]) {
  const active = items.filter((item) => item.status !== "dismissed" && item.status !== "parked");
  if (active.length === 0) return null;
  return [...active].sort((a, b) => b.relevanceScore - a.relevanceScore)[0]?.id ?? null;
}

function TrendItemCard({
  item,
  readThis,
  onPatch,
}: {
  item: TrendItem;
  readThis: boolean;
  onPatch: (id: string, payload: { status?: string; logToGrowth?: boolean }) => void;
}) {
  const inactive = item.status === "dismissed" || item.status === "parked";

  return (
    <article
      className={`app-card p-5 ${
        readThis ? "ring-2 ring-orange-300/80 bg-orange-50/30" : ""
      } ${inactive ? "opacity-60" : ""}`}
    >
      <div className="flex flex-wrap gap-2 mb-2">
        {readThis ? (
          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-orange-900 bg-orange-100 px-2 py-0.5 rounded-md">
            <BookOpenCheck size={11} /> Read this
          </span>
        ) : null}
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
            className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
              readThis ? "text-orange-700 hover:text-orange-900" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {readThis ? "Read source" : "Source"} <ExternalLink size={12} />
          </a>
        ) : null}
        <button
          type="button"
          disabled={Boolean(item.loggedActivityId) || item.status === "noted"}
          onClick={() => onPatch(item.id, { logToGrowth: true })}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg app-btn-primary disabled:opacity-50"
        >
          {item.loggedActivityId || item.status === "noted" ? "Noted in Growth" : "Note in Growth"}
        </button>
        <button
          type="button"
          onClick={() => onPatch(item.id, { status: "parked" })}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 rounded-lg"
        >
          <ParkingCircle size={13} /> Park
        </button>
        <button
          type="button"
          onClick={() => onPatch(item.id, { status: "dismissed" })}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-rose-50 hover:text-rose-700 rounded-lg"
        >
          <X size={13} /> Dismiss
        </button>
      </div>
    </article>
  );
}

export function TrendsView({
  lane,
  onOpenGrowth,
  onOpenOtherLane,
}: {
  lane: TrendsLane;
  onOpenGrowth?: () => void;
  onOpenOtherLane?: () => void;
}) {
  const queryClient = useQueryClient();
  const isTech = lane === "tech";
  const { speak, stop, isSpeaking, speechError, supported } = useBrowserSpeech();

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
        Curating {isTech ? "tech" : "DMV"} signal…
      </div>
    );
  }

  if (error || !digest) {
    return (
      <div className="app-card p-8 text-center space-y-3">
        <p className="text-slate-700">Couldn&apos;t load {isTech ? "tech" : "DMV"} trends.</p>
        <button type="button" onClick={() => refetch()} className="app-btn-primary px-4 py-2 text-sm">
          Retry
        </button>
      </div>
    );
  }

  const updatedLabel = DateTime.fromISO(digest.updatedAt).toFormat("MMM d · h:mm a");
  const maxItems = isTech ? 4 : 3;
  const byImportance = (a: TrendItem, b: TrendItem) => b.relevanceScore - a.relevanceScore;
  const items = digest.items
    .filter((item) => (isTech ? isTechTrendTheme(item.theme) : isDmvPageTheme(item.theme)))
    .sort(byImportance)
    .slice(0, maxItems);
  const readThisId = topReadId(items);

  const looksLikeLocalNews = (text: string) =>
    /\b(metro|wmata|dcist|maryland|virginia|fare|commute|national harbor|pg county|oxon hill)\b/i.test(
      text,
    );

  const rawMain = isTech
    ? (digest.techMain ?? digest.mainThing)
    : (digest.dmvMain ?? digest.mainThing);

  const topItem = items[0];
  const main =
    isTech && looksLikeLocalNews(`${rawMain.title} ${rawMain.why}`) && topItem
      ? {
          title: topItem.title,
          why: topItem.whyItMatters,
          oneAction: `Skim “${topItem.sourceLabel}” and note one implication for an open build task.`,
        }
      : rawMain;

  useEffect(() => {
    stop();
  }, [lane, digest.id, stop]);

  const listenToDigest = () => {
    if (isSpeaking) {
      stop();
      return;
    }

    speak(
      buildTrendsSpeechText({
        lane,
        focusGuardrail: digest.focusGuardrail,
        main,
        items,
      }),
    );
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl app-display text-slate-900 tracking-tight">
            {isTech ? "Tech" : "DMV"}
          </h1>
          <p className="text-sm text-slate-600 mt-1 leading-relaxed max-w-xl">
            {isTech
              ? "Builder signal only — AI models, labs, infra, markets. Ranked most → least. Source opens the real article."
              : "Maryland / DC / Virginia news, plus housing & rates that hit your home path. Ranked most → least."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onOpenOtherLane ? (
            <button
              type="button"
              onClick={onOpenOtherLane}
              className="px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 rounded-xl ring-1 ring-slate-200/70"
            >
              {isTech ? "DMV →" : "Tech →"}
            </button>
          ) : null}
          {onOpenGrowth ? (
            <button
              type="button"
              onClick={onOpenGrowth}
              className="px-3 py-2 text-xs font-semibold text-teal-800 hover:bg-teal-50 rounded-xl"
            >
              Growth →
            </button>
          ) : null}
          {supported ? (
            <button
              type="button"
              onClick={listenToDigest}
              className={`inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-xl ring-1 ${
                isSpeaking
                  ? "text-orange-800 bg-orange-50 ring-orange-200/80"
                  : "text-slate-700 hover:bg-slate-50 ring-slate-200/70"
              }`}
              title={isSpeaking ? "Stop reading" : "Read today's digest aloud"}
            >
              {isSpeaking ? <VolumeX size={14} /> : <Volume2 size={14} />}
              {isSpeaking ? "Stop" : "Listen"}
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

      {speechError ? (
        <p className="text-xs text-rose-600">{speechError}</p>
      ) : null}

      <p className="text-xs text-slate-500">Updated {updatedLabel}</p>

      <div className="rounded-2xl bg-amber-50/90 p-4 ring-1 ring-amber-200/70 text-sm text-amber-950 leading-relaxed">
        <p className="font-semibold mb-1">Main thing · main thing</p>
        <p>{digest.focusGuardrail}</p>
      </div>

      <div className="app-card p-6 ring-1 ring-teal-200/60 bg-teal-50/40">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-9 h-9 rounded-xl bg-white/80 ring-1 ring-teal-200/60 flex items-center justify-center">
            {isTech ? (
              <Cpu size={16} className="text-teal-700" />
            ) : (
              <MapPin size={16} className="text-teal-700" />
            )}
          </div>
          <p className="app-label text-teal-800">
            {isTech ? "Tech focus today" : "DMV focus today"}
          </p>
        </div>
        <h2 className="text-xl font-semibold text-slate-900 leading-snug">{main.title}</h2>
        <p className="text-sm text-slate-700 mt-2 leading-relaxed">{main.why}</p>
        <p className="mt-4 text-sm font-medium text-teal-900 leading-relaxed">
          One action: {main.oneAction}
        </p>
        <p className="mt-2 text-xs text-teal-800/80 inline-flex items-center gap-1">
          <Sparkles size={12} /> TLDR for this page only — other lane is separate.
        </p>
      </div>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          {isTech ? <Cpu size={16} className="text-slate-500" /> : <MapPin size={16} className="text-slate-500" />}
          <h3 className="font-semibold text-slate-900">
            {isTech ? "Today's tech signal" : "Today's DMV signal"}
          </h3>
          <span className="text-xs text-slate-500">
            ({items.length} · up to {maxItems} · most → least)
          </span>
        </div>

        {items.length === 0 ? (
          <div className="app-card p-4 text-sm text-slate-500">
            No {isTech ? "tech" : "DMV"} items yet — hit Refresh to rebuild.
          </div>
        ) : (
          items.map((item) => (
            <TrendItemCard
              key={item.id}
              item={item}
              readThis={item.id === readThisId}
              onPatch={patchItem}
            />
          ))
        )}
      </section>
    </div>
  );
}
