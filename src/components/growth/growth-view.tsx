"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DateTime } from "luxon";
import { userNow } from "@/lib/user-timezone";
import {
  Flame,
  Loader2,
  Plus,
  RefreshCw,
  Users,
  AlertTriangle,
  CheckCircle2,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency } from "@/lib/format";
import { ActivityTitleInput } from "@/components/growth/activity-title-input";
import { GOOD_WEEK_CHECKLIST } from "@/lib/life-os-north-star";

type DomainScores = {
  career: number;
  startup: number;
  financial: number;
  social: number;
  fitness: number;
  personal: number;
};

type GrowthDashboard = {
  metrics: {
    date: string;
    compoundingScore: number;
    domains: DomainScores;
    bottlenecks: string[];
    improving: boolean;
    activityCounts: Record<string, number>;
    domainHours?: Record<
      string,
      { lifetimeHours: number; recentHours: number; masteryPct: number }
    >;
    leverageMix: { immediateIncome: number; longTermLeverage: number };
    contactsNeedingAttention: Array<{
      id: string;
      name: string;
      daysSinceContact: number | null;
      status: string;
      relationshipType?: string | null;
    }>;
    heartbeat?: {
      daysInactive: number;
      lastUserTouchDate: string | null;
      decaying: boolean;
      scoreMultiplier: number;
    };
    goalsBehind: Array<{ name: string; progressPct: number; targetDate: string | null }>;
    financialSignals: {
      cashAvailable: number;
      recentDailySpendAverage: number;
      safeSpendToday: number;
      netWorthProxy: number;
      creditDebt: number;
    };
  };
  lifeLeverageProfile: {
    promotionTarget: string | null;
    promotionDeadline: string | null;
    promotionUpsideAnnual: number | null;
    currentWeight: number | null;
    targetWeight: number | null;
    fitnessGoal: string | null;
    joyOptions: string[];
    notes: string | null;
  } | null;
  recommendation: {
    id: string;
    action: string;
    whyItMatters: string;
    longTermBenefit: string;
    timeRequiredMinutes: number;
    opportunityCost: string;
    relatedGoals: string[];
    relatedPeople: string[];
    nextActions: string[];
    leverageType: string;
    domain: string | null;
    status: string;
  } | null;
  weeklyReview: {
    weekStart: string;
    whatWorked: string[];
    whatDidnt: string[];
    biggestReturn: string | null;
    timeWasted: string | null;
    stopDoing: string[];
    doMore: string[];
    relationshipsImproved: string[];
    goalsBehind: string[];
    biggestBottleneck: string | null;
    adjustments: string[];
    compoundingScore: number | null;
  } | null;
  opportunities: Array<{
    id: string;
    title: string;
    description: string;
    domain: string | null;
    urgency: string;
    relatedPeople: string[];
  }>;
  activities: Array<{
    id: string;
    date: string;
    domain: string;
    category: string;
    title: string;
    notes?: string | null;
    leverage: string;
    impactScore: number;
    minutesSpent: number | null;
    sourceCalendarEventId?: string | null;
  }>;
  contacts: Array<{
    id: string;
    name: string;
    relationshipType: string | null;
    trustLevel: number;
    lastContactDate: string | null;
    status: string;
    notes: string | null;
    suggestedNextAction: string | null;
    noteEntries?: Array<{
      id: string;
      body: string | null;
      images: string[];
      createdAt: string;
    }>;
  }>;
  snapshots: Array<{
    date: string;
    compoundingScore: number;
  }>;
};

const DOMAINS = ["career", "startup", "financial", "social", "fitness", "personal"] as const;

const ACTIVITY_CATEGORIES_BY_DOMAIN: Record<(typeof DOMAINS)[number], string[]> = {
  career: ["project", "deep_work", "meeting", "learning", "leadership", "promotion", "other"],
  startup: ["build", "ship", "customer", "learning", "positioning", "other"],
  financial: ["debt", "budget", "admin", "investing", "car", "other"],
  social: ["networking", "follow_up", "dating", "family", "event", "other"],
  fitness: ["gym", "run", "walk", "sports", "recovery", "other"],
  personal: ["errands", "rest", "joy", "chores", "planning", "other"],
};

function categoriesForDomain(domain: string) {
  if ((DOMAINS as readonly string[]).includes(domain)) {
    return ACTIVITY_CATEGORIES_BY_DOMAIN[domain as (typeof DOMAINS)[number]];
  }
  return ACTIVITY_CATEGORIES_BY_DOMAIN.personal;
}

function expandReviewBullets(items: string[], max = 5): string[] {
  const out: string[] = [];
  for (const item of items) {
    const parts = item
      .split(/\s*[·•|]\s*|\s*;\s*|\n+|(?<=\d)\.\s+(?=[A-Z])/)
      .map((part) => part.trim().replace(/^[-–]\s*/, ""))
      .filter((part) => part.length > 2);
    for (const part of parts.length > 0 ? parts : [item.trim()]) {
      if (!part) continue;
      out.push(part.length > 110 ? `${part.slice(0, 107).trim()}…` : part);
      if (out.length >= max) return out;
    }
  }
  return out;
}

function firstSentence(text: string | null | undefined, max = 140): string | null {
  if (!text?.trim()) return null;
  const sentence = text.split(/(?<=[.!?])\s+/)[0]?.trim() ?? text.trim();
  return sentence.length > max ? `${sentence.slice(0, max - 1).trim()}…` : sentence;
}

function buildWeeklyTldr(review: NonNullable<GrowthDashboard["weeklyReview"]>): {
  headline: string;
  doNow: string[];
  stopNow: string[];
} {
  const headline =
    firstSentence(review.biggestBottleneck) ??
    firstSentence(review.biggestReturn) ??
    "Log a few notes and activities so this week’s review can get sharper.";
  return {
    headline,
    doNow: expandReviewBullets(review.doMore.length > 0 ? review.doMore : review.adjustments, 3),
    stopNow: expandReviewBullets(review.stopDoing, 2),
  };
}


function formatActivityDate(iso: string): string {
  const dt = DateTime.fromISO(iso);
  if (!dt.isValid) return iso;
  const today = userNow().toISODate();
  if (iso === today) return "Today";
  if (iso === userNow().minus({ days: 1 }).toISODate()) return "Yesterday";
  return dt.toFormat("LLL d");
}

function leverageLabel(leverage: string, short = false): string {
  if (leverage === "immediate_income") return short ? "Cash" : "Immediate income";
  return short ? "Compound" : "Long-term leverage";
}

function domainChipClass(domain: string): string {
  const map: Record<string, string> = {
    career:
      "bg-[color-mix(in_srgb,var(--accent)_18%,var(--card-solid))] text-[var(--accent-strong)] ring-[color-mix(in_srgb,var(--accent)_28%,transparent)]",
    startup:
      "bg-[color-mix(in_srgb,#8b5cf6_16%,var(--card-solid))] text-[color-mix(in_srgb,#7c3aed_55%,var(--ink))] ring-[color-mix(in_srgb,#8b5cf6_30%,transparent)]",
    financial:
      "bg-[color-mix(in_srgb,#10b981_14%,var(--card-solid))] text-[color-mix(in_srgb,#047857_65%,var(--ink))] ring-[color-mix(in_srgb,#10b981_28%,transparent)]",
    social:
      "bg-[color-mix(in_srgb,var(--ember)_14%,var(--card-solid))] text-[var(--ember-strong)] ring-[color-mix(in_srgb,var(--ember)_30%,transparent)]",
    fitness:
      "bg-[color-mix(in_srgb,var(--accent)_14%,var(--card-solid))] text-[var(--accent-strong)] ring-[color-mix(in_srgb,var(--accent)_28%,transparent)]",
    personal:
      "bg-[color-mix(in_srgb,var(--ink)_7%,var(--card-solid))] text-[var(--ink-soft)] ring-[var(--card-border)]",
  };
  return map[domain] ?? map.personal;
}

const ACTIVITY_PREVIEW_CHARS = 120;

export function GrowthView({
  onOpenTrends,
  onOpenPeople,
}: {
  onOpenTrends?: () => void;
  onOpenPeople?: () => void;
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [showWeeklyDetails, setShowWeeklyDetails] = useState(false);
  const [showGoodWeekChecklist, setShowGoodWeekChecklist] = useState(false);
  const [showMoreInsights, setShowMoreInsights] = useState(false);
  const [expandedActivityIds, setExpandedActivityIds] = useState<Set<string>>(new Set());
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [activityForm, setActivityForm] = useState({
    date: userNow().toISODate() ?? "",
    domain: "career",
    category: "project",
    title: "",
    leverage: "long_term_leverage",
    minutesSpent: "60",
    impactScore: "7",
    notes: "",
    lyftGrossEarnings: "",
  });
  const [profileForm, setProfileForm] = useState({
    promotionTarget: "",
    promotionDeadline: "",
    promotionUpsideAnnual: "",
    currentWeight: "",
    targetWeight: "",
    fitnessGoal: "",
    notes: "",
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["growth-dashboard"],
    queryFn: async () => {
      const res = await fetch("/api/growth");
      if (!res.ok) throw new Error("Failed to load growth dashboard");
      return res.json() as Promise<GrowthDashboard>;
    },
    staleTime: 30_000,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["growth-dashboard"] });
    void queryClient.invalidateQueries({ queryKey: ["growth-overview-preview"] });
  };

  const contacts = useMemo(() => data?.contacts ?? [], [data?.contacts]);

  const openProfileForm = () => {
    const profile = data?.lifeLeverageProfile;
    setProfileForm({
      promotionTarget: profile?.promotionTarget ?? "Promotion by end of August",
      promotionDeadline: profile?.promotionDeadline ?? "",
      promotionUpsideAnnual: profile?.promotionUpsideAnnual?.toString() ?? "20000",
      currentWeight: profile?.currentWeight?.toString() ?? "",
      targetWeight: profile?.targetWeight?.toString() ?? "",
      fitnessGoal: profile?.fitnessGoal ?? "",
      notes: profile?.notes ?? "",
    });
    setShowProfileForm((v) => !v);
  };

  const saveLifeLeverageProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("profile");
    try {
      const res = await fetch("/api/growth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...profileForm, joyOptions: [] }),
      });
      if (res.ok) {
        setShowProfileForm(false);
        invalidate();
      }
    } finally {
      setBusy(null);
    }
  };

  const generateWeeklyReview = async (force = false) => {
    setBusy("review");
    try {
      const res = await fetch("/api/growth/weekly-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      if (!res.ok) {
        throw new Error("Weekly review failed");
      }
      invalidate();
    } finally {
      setBusy(null);
    }
  };

  const dismissOpportunity = async (id: string) => {
    await fetch("/api/growth/opportunities", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "dismissed" }),
    });
    invalidate();
  };

  const submitActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("activity");
    try {
      const res = await fetch("/api/growth/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(activityForm),
      });
      if (res.ok) {
        setShowActivityForm(false);
        setActivityForm((prev) => ({ ...prev, title: "", notes: "", lyftGrossEarnings: "" }));
        invalidate();
        void queryClient.invalidateQueries({ queryKey: ["overview-today"] });
      }
    } finally {
      setBusy(null);
    }
  };

  const removeActivity = async (id: string) => {
    setBusy(`remove-activity-${id}`);
    try {
      const res = await fetch(`/api/growth/activities?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (res.ok) invalidate();
    } finally {
      setBusy(null);
    }
  };

  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500 gap-2">
        <Loader2 className="animate-spin" size={18} />
        Loading growth intelligence…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="app-card p-6 text-center text-slate-600">
        Could not load Growth Intelligence. Try syncing and refresh.
      </div>
    );
  }

  const { metrics, weeklyReview, opportunities, activities, snapshots } = data;
  const chartData = snapshots.map((s) => ({
    date: s.date.slice(5),
    score: Math.round(s.compoundingScore),
  }));
  const weeklyTldr = weeklyReview ? buildWeeklyTldr(weeklyReview) : null;

  const toggleActivityExpanded = (id: string) => {
    setExpandedActivityIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-4 md:gap-6 min-w-0 w-full max-w-full">
      <div className="order-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl app-display text-slate-900 tracking-tight hidden md:block">
            Growth Intelligence
          </h1>
          <p className="text-slate-500 mt-1 text-sm hidden sm:block">
            Highest-leverage next moves so life compounds over years — not just days.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onOpenPeople ? (
            <button
              type="button"
              onClick={onOpenPeople}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200/70 hover:bg-slate-50"
            >
              People →
            </button>
          ) : null}
          {onOpenTrends ? (
            <button
              type="button"
              onClick={onOpenTrends}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 rounded-xl ring-1 ring-slate-200/70"
            >
              Learning →
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              if (weeklyReview) {
                document.getElementById("weekly-review")?.scrollIntoView({
                  behavior: "smooth",
                  block: "nearest",
                });
                return;
              }
              void generateWeeklyReview(false);
            }}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 app-card hover:bg-white disabled:opacity-60"
          >
            {busy === "review" ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {busy === "review" ? "Writing review…" : "Weekly review"}
          </button>
        </div>
      </div>

      <div className="order-2 md:hidden app-card p-3 min-w-0 ring-1 ring-orange-200/60 bg-orange-50/40">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Flame size={16} className="text-orange-600 shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-orange-800">
                Compounding
              </p>
              <p className="text-2xl font-bold text-slate-900 leading-none">
                {Math.round(metrics.compoundingScore)}
              </p>
              <p className="text-[10px] text-slate-500 mt-1">/ 100 mastery</p>
            </div>
          </div>
          <p className="text-xs text-slate-600 text-right leading-snug max-w-[9rem]">
            {metrics.heartbeat?.decaying
              ? `Heartbeat weak · ${metrics.heartbeat.daysInactive}d quiet`
              : metrics.improving
                ? "Improving vs recent history"
                : "Needs attention"}
          </p>
        </div>
      </div>

      <div className="order-7 md:order-2 hidden md:grid sm:grid-cols-3 gap-3">
        <div className="app-card p-4 min-w-0 ring-1 ring-orange-200/60 bg-orange-50/40">
          <div className="flex items-center gap-2 mb-1">
            <Flame size={16} className="text-orange-600" />
            <p className="app-label text-orange-800">Compounding score</p>
          </div>
          <p className="text-3xl font-bold text-slate-900">{Math.round(metrics.compoundingScore)}</p>
          <p className="text-xs text-slate-600 mt-1">
            {metrics.heartbeat?.decaying
              ? `Heartbeat weak · quiet ${metrics.heartbeat.daysInactive} days`
              : metrics.improving
                ? "Improving vs recent history"
                : "Needs attention"}
          </p>
          <p className="text-[11px] text-slate-500 mt-2 leading-snug">
            {metrics.heartbeat?.decaying
              ? "Unused systems decay — log a move or send one follow-up."
              : "Mastery scale — 100 ≈ years of quality hours, not a strong week."}
          </p>
        </div>
        <div className="app-card p-4 min-w-0">
          <p className="app-label mb-1">Leverage mix (14d)</p>
          <p className="text-sm text-slate-800 break-words">
            Long-term: <span className="font-semibold">{metrics.leverageMix.longTermLeverage}</span>
            {" · "}
            Immediate: <span className="font-semibold">{metrics.leverageMix.immediateIncome}</span>
          </p>
          <p className="text-xs text-slate-500 mt-2 break-words">
            Cash {formatCurrency(metrics.financialSignals.cashAvailable)} · Debt{" "}
            {formatCurrency(metrics.financialSignals.creditDebt)}
          </p>
        </div>
        <div className="app-card p-4 min-w-0">
          <p className="app-label mb-1">Top bottleneck</p>
          <p className="text-sm text-slate-800 leading-relaxed break-words">
            {metrics.bottlenecks[0] ?? "No major bottleneck detected — keep compounding."}
          </p>
        </div>
      </div>

      <div className="order-3 grid lg:grid-cols-2 gap-4">
        <div className="app-card p-4 min-w-0 overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="app-label">Opportunity engine</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Top 3 focused moves — reach out, don’t drown in backlog
              </p>
            </div>
          </div>
          {opportunities.length === 0 ? (
            <p className="text-sm text-slate-500">No open opportunities. Log contacts and activities to surface more.</p>
          ) : (
            <ul className="space-y-3">
              {opportunities.map((opp) => (
                <li key={opp.id} className="border-b border-slate-100 last:border-0 pb-3 last:pb-0">
                  <div className="flex items-start justify-between gap-2 min-w-0">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900 text-sm break-words">{opp.title}</p>
                      <p className="text-xs text-slate-600 mt-0.5 leading-relaxed break-words">{opp.description}</p>
                      <p className="text-[11px] text-slate-400 mt-1 capitalize">
                        {opp.urgency} urgency
                        {opp.domain ? ` · ${opp.domain}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => dismissOpportunity(opp.id)}
                      className="text-[11px] text-slate-400 hover:text-slate-700 shrink-0"
                    >
                      Dismiss
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="app-card p-4 min-w-0 overflow-hidden">
          <div className="flex items-center justify-between mb-3 gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Users size={14} className="text-slate-500 shrink-0" />
              <div className="min-w-0">
                <p className="app-label">Follow-ups</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  People live in their own tab — easier to add and stay in touch
                </p>
              </div>
            </div>
            {onOpenPeople ? (
              <button
                type="button"
                onClick={() => {
                  try {
                    sessionStorage.setItem("life-os-people-add", "1");
                  } catch {
                    /* ignore */
                  }
                  onOpenPeople();
                }}
                className="inline-flex min-h-11 shrink-0 items-center gap-1 text-xs font-semibold text-teal-700"
              >
                <Plus size={12} /> Add
              </button>
            ) : null}
          </div>
          {metrics.contactsNeedingAttention.length === 0 ? (
            <p className="text-sm text-slate-500">
              No stale follow-ups. Open People when you meet someone new.
            </p>
          ) : (
            <ul className="max-h-56 space-y-2 overflow-y-auto">
              {metrics.contactsNeedingAttention.map((contact) => (
                <li key={contact.id} className="text-sm text-slate-800">
                  <span className="font-medium">{contact.name}</span>
                  <span className="text-xs text-slate-500">
                    {contact.relationshipType ? ` · ${contact.relationshipType}` : ""}
                    {contact.daysSinceContact != null
                      ? ` · ${contact.daysSinceContact}d`
                      : ` · ${contact.status}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {onOpenPeople ? (
            <button
              type="button"
              onClick={onOpenPeople}
              className="mt-3 min-h-11 w-full rounded-xl px-3 text-sm font-semibold text-teal-800 ring-1 ring-teal-200/80 hover:bg-teal-50"
            >
              Decide in People
            </button>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowMoreInsights((v) => !v)}
        className="order-7 md:hidden flex items-center justify-between w-full app-card px-4 py-3 text-sm font-semibold text-slate-700"
      >
        <span>{showMoreInsights ? "Hide charts & profile" : "Charts & profile"}</span>
        {showMoreInsights ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      <div
        className={`order-8 md:contents flex flex-col gap-4 md:gap-6 ${
          showMoreInsights ? "flex" : "hidden md:flex"
        }`}
      >
      <div className="app-card p-4 md:p-5 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <p className="app-label mb-1">Life leverage profile</p>
            <h2 className="text-lg font-semibold text-slate-900">
              Teach the app your real tradeoffs
            </h2>
            <p className="text-sm text-slate-500 mt-1 leading-relaxed">
              Promotion upside, body goal, and joy defaults make the planner less generic.
            </p>
          </div>
          <button
            type="button"
            onClick={openProfileForm}
            className="text-xs font-semibold text-teal-700 shrink-0"
          >
            {showProfileForm ? "Close" : data.lifeLeverageProfile ? "Edit profile" : "Set up"}
          </button>
        </div>

        {data.lifeLeverageProfile && !showProfileForm ? (
          <div className="mt-4 grid sm:grid-cols-4 gap-2 text-xs">
            <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
              <p className="app-label">Career</p>
              <p className="font-semibold text-slate-900">
                {data.lifeLeverageProfile.promotionTarget ?? "Not set"}
              </p>
              {data.lifeLeverageProfile.promotionUpsideAnnual ? (
                <p className="text-slate-500 mt-1">
                  +{formatCurrency(data.lifeLeverageProfile.promotionUpsideAnnual)}/yr potential
                </p>
              ) : null}
            </div>
            <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100 sm:col-span-2">
              <p className="app-label">Body</p>
              <p className="font-semibold text-slate-900">
                {data.lifeLeverageProfile.fitnessGoal ?? "Not set"}
              </p>
            </div>
          </div>
        ) : null}

        {showProfileForm ? (
          <form onSubmit={saveLifeLeverageProfile} className="mt-4 grid sm:grid-cols-2 gap-3">
            <div>
              <label className="app-label block mb-1.5">Career leverage target</label>
              <input
                className="app-input w-full px-3 py-2 text-sm"
                value={profileForm.promotionTarget}
                onChange={(e) => setProfileForm({ ...profileForm, promotionTarget: e.target.value })}
                placeholder="Promotion by end of August"
              />
            </div>
            <div>
              <label className="app-label block mb-1.5">Target date</label>
              <input
                type="date"
                className="app-input w-full px-3 py-2 text-sm"
                value={profileForm.promotionDeadline}
                onChange={(e) => setProfileForm({ ...profileForm, promotionDeadline: e.target.value })}
              />
            </div>
            <div>
              <label className="app-label block mb-1.5">Annual upside ($)</label>
              <input
                type="number"
                className="app-input w-full px-3 py-2 text-sm"
                value={profileForm.promotionUpsideAnnual}
                onChange={(e) =>
                  setProfileForm({ ...profileForm, promotionUpsideAnnual: e.target.value })
                }
                placeholder="20000"
              />
            </div>
            <div>
              <label className="app-label block mb-1.5">Current weight</label>
              <input
                type="number"
                className="app-input w-full px-3 py-2 text-sm"
                value={profileForm.currentWeight}
                onChange={(e) => setProfileForm({ ...profileForm, currentWeight: e.target.value })}
              />
            </div>
            <div>
              <label className="app-label block mb-1.5">Target weight</label>
              <input
                type="number"
                className="app-input w-full px-3 py-2 text-sm"
                value={profileForm.targetWeight}
                onChange={(e) => setProfileForm({ ...profileForm, targetWeight: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="app-label block mb-1.5">Gym goal / split</label>
              <input
                className="app-input w-full px-3 py-2 text-sm"
                value={profileForm.fitnessGoal}
                onChange={(e) => setProfileForm({ ...profileForm, fitnessGoal: e.target.value })}
                placeholder="e.g. Mon push, Tue pull, Thu legs, Sat cardio"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="app-label block mb-1.5">Schedule context</label>
              <textarea
                className="app-input w-full px-3 py-2 text-sm min-h-[72px]"
                value={profileForm.notes}
                onChange={(e) => setProfileForm({ ...profileForm, notes: e.target.value })}
                placeholder="Gym times, commute constraints, workout class schedule, promotion checklist, or anything that should shape today."
              />
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <button
                type="submit"
                disabled={busy === "profile"}
                className="app-btn-primary px-4 py-2 text-sm disabled:opacity-60"
              >
                {busy === "profile" ? "Saving..." : "Save leverage profile"}
              </button>
            </div>
          </form>
        ) : null}
      </div>
      </div>

      <div
        className={`order-8 md:contents flex flex-col gap-4 md:gap-6 ${
          showMoreInsights ? "flex" : "hidden md:flex"
        }`}
      >
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="app-card p-4 min-w-0">
          <p className="app-label mb-1">Domain mastery</p>
          <p className="text-[11px] text-slate-500 mb-3 leading-snug">
            Tracks time × impact toward real depth. 100 ≈ ~10k quality hours — friendships take years;
            skills take decades of reps.
          </p>
          <div className="space-y-2.5">
            {DOMAINS.map((domain) => {
              const score = metrics.domains[domain];
              const hours = metrics.domainHours?.[domain];
              return (
                <div key={domain}>
                  <div className="flex justify-between text-xs mb-1 gap-2">
                    <span className="capitalize text-slate-700 font-medium">{domain}</span>
                    <span className="text-slate-500 shrink-0">
                      {Math.round(score)}
                      {hours && domain !== "financial" && domain !== "social" ? (
                        <span className="text-slate-400">
                          {" "}
                          · {hours.lifetimeHours < 10
                            ? `${hours.lifetimeHours}h`
                            : `${Math.round(hours.lifetimeHours)}h`}
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-teal-500"
                      style={{ width: `${Math.max(4, Math.min(100, score))}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="app-card p-4 min-w-0 overflow-hidden">
          <p className="app-label mb-1">Compounding over time</p>
          <p className="text-[11px] text-slate-500 mb-3 leading-snug">
            Slow climb is the point — false peaks are gone. Expect mid-range scores while hours accumulate.
          </p>
          {chartData.length > 1 ? (
            <div className="h-48 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} width={28} />
                  <Tooltip
                    formatter={(value) => [`${value} / 100 mastery`, "Compounding"]}
                  />
                  <Line type="monotone" dataKey="score" stroke="#0d9488" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-slate-500 py-10 text-center">
              Score history will appear after a few daily snapshots.
            </p>
          )}
        </div>
      </div>

      {metrics.bottlenecks.length > 0 ? (
        <div className="app-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={16} className="text-amber-600" />
            <p className="app-label text-amber-800">Bottlenecks</p>
          </div>
          <ul className="space-y-1.5 text-sm text-slate-700">
            {metrics.bottlenecks.map((b) => (
              <li key={b}>• {b}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="order-5 md:order-9 app-card p-4 min-w-0 overflow-hidden">
        <div className="flex items-center justify-between mb-3 gap-2">
          <p className="app-label">Recent growth activities</p>
          <button
            type="button"
            onClick={() => setShowActivityForm((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 shrink-0"
          >
            <Plus size={12} /> Log activity
          </button>
        </div>
        <p className="text-[11px] text-slate-500 mb-3">
          Finished Google Calendar events auto-log here. Tag people with{" "}
          <span className="font-semibold">@Name</span> in the title (e.g. network mixer @Jane Smith).
        </p>
        {showActivityForm ? (
          <form onSubmit={submitActivity} className="grid sm:grid-cols-2 gap-2 mb-4 p-3 rounded-xl bg-slate-50">
            <ActivityTitleInput
              value={activityForm.title}
              onChange={(title) => setActivityForm((prev) => ({ ...prev, title }))}
              contacts={contacts}
              disabled={busy === "activity"}
            />
            <label className="block min-w-0">
              <span className="text-[11px] font-semibold text-slate-500">Domain</span>
              <select
                className="app-input w-full px-3 py-1.5 text-sm mt-1 capitalize"
                value={activityForm.domain}
                onChange={(e) => {
                  const domain = e.target.value;
                  const cats = categoriesForDomain(domain);
                  setActivityForm({
                    ...activityForm,
                    domain,
                    category: cats.includes(activityForm.category) ? activityForm.category : cats[0],
                  });
                }}
              >
                {DOMAINS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className="block min-w-0">
              <span className="text-[11px] font-semibold text-slate-500">Leverage</span>
              <select
                className="app-input w-full px-3 py-1.5 text-sm mt-1"
                value={activityForm.leverage}
                onChange={(e) => setActivityForm({ ...activityForm, leverage: e.target.value })}
              >
                <option value="long_term_leverage">Long-term leverage</option>
                <option value="immediate_income">Immediate income</option>
              </select>
            </label>
            <label className="block min-w-0">
              <span className="text-[11px] font-semibold text-slate-500">Date</span>
              <input
                type="date"
                className="app-input w-full px-3 py-1.5 text-sm mt-1"
                value={activityForm.date}
                onChange={(e) => setActivityForm({ ...activityForm, date: e.target.value })}
              />
            </label>
            <label className="block min-w-0">
              <span className="text-[11px] font-semibold text-slate-500">Category</span>
              <select
                className="app-input w-full px-3 py-1.5 text-sm mt-1 capitalize"
                value={
                  categoriesForDomain(activityForm.domain).includes(activityForm.category)
                    ? activityForm.category
                    : categoriesForDomain(activityForm.domain)[0]
                }
                onChange={(e) => setActivityForm({ ...activityForm, category: e.target.value })}
              >
                {categoriesForDomain(activityForm.domain).map((cat) => (
                  <option key={cat} value={cat}>
                    {cat.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <label className="block min-w-0">
              <span className="text-[11px] font-semibold text-slate-500">Minutes</span>
              <input
                type="number"
                className="app-input w-full px-3 py-1.5 text-sm mt-1"
                placeholder="e.g. 60"
                value={activityForm.minutesSpent}
                onChange={(e) => setActivityForm({ ...activityForm, minutesSpent: e.target.value })}
              />
            </label>
            <label className="block min-w-0">
              <span className="text-[11px] font-semibold text-slate-500">Impact (1–10)</span>
              <input
                type="number"
                min={1}
                max={10}
                className="app-input w-full px-3 py-1.5 text-sm mt-1"
                placeholder="e.g. 5"
                value={activityForm.impactScore}
                onChange={(e) => setActivityForm({ ...activityForm, impactScore: e.target.value })}
              />
              <span className="text-[10px] text-slate-400 mt-0.5 block">
                Quality weight on the hours — 5 is solid practice, 10 is rare high-leverage work
              </span>
            </label>
            {activityForm.category === "lyft" || activityForm.domain === "financial" ? (
              <label className="block min-w-0 sm:col-span-2">
                <span className="text-[11px] font-semibold text-slate-500">
                  Lyft gross earnings ($)
                </span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className="app-input w-full px-3 py-1.5 text-sm mt-1"
                  placeholder="What Lyft paid you"
                  value={activityForm.lyftGrossEarnings}
                  onChange={(e) =>
                    setActivityForm({ ...activityForm, lyftGrossEarnings: e.target.value })
                  }
                  disabled={activityForm.category !== "lyft"}
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  Required for hit/miss pacing. No weekly program fee — gross counts as profit toward the $200–$400/week band.
                </span>
              </label>
            ) : null}
            <button
              type="submit"
              disabled={busy === "activity"}
              className="app-btn-primary px-3 py-1.5 text-xs sm:col-span-2 justify-self-start"
            >
              Save activity
            </button>
          </form>
        ) : null}
        {activities.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            Log workouts, shipping blocks, networking, and learning so the score can improve.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {activities.slice(0, 10).map((a) => {
              const isExpanded = expandedActivityIds.has(a.id);
              const isLong = a.title.length > ACTIVITY_PREVIEW_CHARS;
              const preview =
                isLong && !isExpanded
                  ? `${a.title.slice(0, ACTIVITY_PREVIEW_CHARS).trim()}…`
                  : a.title;

              return (
                <li
                  key={a.id}
                  className="rounded-xl p-3 min-w-0 ring-1 ring-[var(--card-border)] bg-[var(--card-solid)]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ring-1 ${domainChipClass(a.domain)}`}
                      >
                        {a.domain}
                      </span>
                      <span className="text-[10px] font-medium text-[var(--muted)]">
                        {formatActivityDate(a.date)}
                      </span>
                      <span className="text-[10px] font-medium text-[var(--muted)] capitalize">
                        {leverageLabel(a.leverage, true)}
                      </span>
                      {a.sourceCalendarEventId || a.category === "calendar" || a.notes?.startsWith("From Google Calendar.") ? (
                        <span className="inline-flex items-center rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700 ring-1 ring-sky-200">
                          calendar
                        </span>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeActivity(a.id)}
                      disabled={busy !== null}
                      aria-label={`Remove ${a.title}`}
                      className="rounded-lg p-1.5 -mr-1 -mt-0.5 text-[var(--muted)] hover:bg-rose-50 hover:text-rose-600 disabled:opacity-60 shrink-0"
                    >
                      {busy === `remove-activity-${a.id}` ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <X size={14} />
                      )}
                    </button>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-[var(--ink)] leading-relaxed break-words">
                    {preview}
                  </p>
                  {isLong ? (
                    <button
                      type="button"
                      onClick={() => toggleActivityExpanded(a.id)}
                      className="mt-1 text-xs font-semibold text-[var(--accent-strong)] dark:text-[var(--accent-bright)]"
                    >
                      {isExpanded ? "Show less" : "Show more"}
                    </button>
                  ) : null}
                  <div className="mt-2 flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-[color-mix(in_srgb,var(--ink)_6%,var(--card-solid))] px-2 py-0.5 text-[10px] font-semibold text-[var(--ink-soft)] ring-1 ring-[var(--card-border)]">
                      Impact {a.impactScore}
                    </span>
                    {a.minutesSpent ? (
                      <span className="text-[10px] font-medium text-[var(--muted)]">
                        {a.minutesSpent} min
                      </span>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div id="weekly-review" className="order-6 md:order-10 app-card p-4 scroll-mt-4">
        <div className="flex items-center justify-between mb-3">
          <p className="app-label">Weekly review</p>
          <button
            type="button"
            onClick={() => generateWeeklyReview(Boolean(weeklyReview))}
            disabled={busy !== null}
            className="text-xs font-semibold text-teal-700 disabled:opacity-60"
          >
            {busy === "review" ? "Writing…" : weeklyReview ? "Regenerate" : "Generate"}
          </button>
        </div>
        {busy === "review" && !weeklyReview ? (
          <p className="text-sm text-slate-500">Building this week&apos;s review from your score and notes…</p>
        ) : !weeklyReview ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              Run a founder-style weekly retrospective: what compounded, what to cut, where leverage is.
            </p>
            <button
              type="button"
              onClick={() => setShowGoodWeekChecklist((v) => !v)}
              className="flex w-full items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5 text-left ring-1 ring-slate-200/80"
            >
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                Good week checklist
              </span>
              {showGoodWeekChecklist ? (
                <ChevronUp className="h-4 w-4 text-slate-500" />
              ) : (
                <ChevronDown className="h-4 w-4 text-slate-500" />
              )}
            </button>
            {showGoodWeekChecklist ? (
              <ul className="space-y-2 text-sm text-slate-700">
                {GOOD_WEEK_CHECKLIST.map((item) => (
                  <li key={item.id} className="flex gap-2.5 rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200/70">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-600/80" />
                    <span>
                      <span className="font-semibold text-slate-900">{item.label}</span>
                      <span className="text-slate-600"> — {item.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : weeklyTldr ? (
              <div className="space-y-4">
                <div className="rounded-2xl bg-teal-50/80 ring-1 ring-teal-200/70 p-4">
                  <p className="app-label text-teal-800 mb-1">TL;DR</p>
                  <p className="text-base font-semibold text-slate-900 leading-snug">{weeklyTldr.headline}</p>
                  {weeklyTldr.doNow.length > 0 ? (
                    <div className="mt-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-teal-800 mb-1.5">
                        Do this week
                      </p>
                      <ul className="space-y-1.5 text-sm text-slate-800">
                        {weeklyTldr.doNow.map((item) => (
                          <li key={item} className="flex gap-2">
                            <span className="text-teal-600 shrink-0">→</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {weeklyTldr.stopNow.length > 0 ? (
                    <div className="mt-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-rose-700 mb-1.5">
                        Stop
                      </p>
                      <ul className="space-y-1.5 text-sm text-slate-800">
                        {weeklyTldr.stopNow.map((item) => (
                          <li key={item} className="flex gap-2">
                            <span className="text-rose-500 shrink-0">×</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={() => setShowGoodWeekChecklist((v) => !v)}
                  className="flex w-full items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5 text-left ring-1 ring-slate-200/80"
                >
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Good week checklist
                  </span>
                  {showGoodWeekChecklist ? (
                    <ChevronUp className="h-4 w-4 text-slate-500" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-slate-500" />
                  )}
                </button>
                {showGoodWeekChecklist ? (
                  <ul className="space-y-2 text-sm text-slate-700">
                    {GOOD_WEEK_CHECKLIST.map((item) => (
                      <li key={item.id} className="flex gap-2.5 rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200/70">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-600/80" />
                        <span>
                          <span className="font-semibold text-slate-900">{item.label}</span>
                          <span className="text-slate-600"> — {item.detail}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <button
                  type="button"
                  onClick={() => setShowWeeklyDetails((v) => !v)}
                  className="text-xs font-semibold text-slate-600 hover:text-slate-900"
                >
                  {showWeeklyDetails ? "Hide details" : "Show full review"}
                </button>

                {showWeeklyDetails && weeklyReview ? (
                  <div className="grid sm:grid-cols-2 gap-4 text-sm text-slate-700 pt-1">
                    <div>
                      <p className="font-semibold text-slate-900 mb-1.5">What worked</p>
                      <ul className="space-y-1.5">
                        {expandReviewBullets(weeklyReview.whatWorked, 4).map((item) => (
                          <li key={item} className="flex gap-2">
                            <span className="text-slate-400">•</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900 mb-1.5">What didn&apos;t</p>
                      <ul className="space-y-1.5">
                        {expandReviewBullets(weeklyReview.whatDidnt, 4).map((item) => (
                          <li key={item} className="flex gap-2">
                            <span className="text-slate-400">•</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    {weeklyReview.biggestReturn ? (
                      <div className="sm:col-span-2">
                        <p className="font-semibold text-slate-900 mb-1">Biggest return</p>
                        <p className="text-slate-600 leading-relaxed">
                          {firstSentence(weeklyReview.biggestReturn, 180)}
                        </p>
                      </div>
                    ) : null}
                    {weeklyReview.adjustments.length > 0 ? (
                      <div className="sm:col-span-2">
                        <p className="font-semibold text-slate-900 mb-1.5">Adjustments</p>
                        <ul className="space-y-1.5">
                          {expandReviewBullets(weeklyReview.adjustments, 5).map((item) => (
                            <li key={item} className="flex gap-2">
                              <span className="text-slate-400">•</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
        ) : null}
      </div>
      </div>
    </div>
  );
}
