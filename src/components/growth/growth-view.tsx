"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DateTime } from "luxon";
import {
  Flame,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Users,
  AlertTriangle,
  CheckCircle2,
  SkipForward,
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
import { VoiceToTextButton } from "@/components/voice-to-text-button";

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
    leverageMix: { immediateIncome: number; longTermLeverage: number };
    contactsNeedingAttention: Array<{
      id: string;
      name: string;
      daysSinceContact: number | null;
      status: string;
    }>;
    goalsBehind: Array<{ name: string; progressPct: number; targetDate: string | null }>;
    financialSignals: {
      cashAvailable: number;
      recentDailySpendAverage: number;
      safeSpendToday: number;
      netWorthProxy: number;
      creditDebt: number;
    };
  };
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
    leverage: string;
    impactScore: number;
    minutesSpent: number | null;
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
  }>;
  snapshots: Array<{
    date: string;
    compoundingScore: number;
  }>;
};

const DOMAINS = ["career", "startup", "financial", "social", "fitness", "personal"] as const;

export function GrowthView() {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [showContactForm, setShowContactForm] = useState(false);
  const [activityForm, setActivityForm] = useState({
    date: DateTime.local().toISODate() ?? "",
    domain: "startup",
    category: "build",
    title: "",
    leverage: "long_term_leverage",
    minutesSpent: "60",
    impactScore: "7",
    notes: "",
  });
  const [contactForm, setContactForm] = useState({
    name: "",
    relationshipType: "peer",
    trustLevel: "3",
    lastContactDate: DateTime.local().toISODate() ?? "",
    notes: "",
    suggestedNextAction: "",
    status: "active",
  });

  const { data, isLoading, isFetching, error } = useQuery({
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

  const generateRecommendation = async (force = false) => {
    setBusy("recommend");
    try {
      await fetch("/api/growth/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      invalidate();
    } finally {
      setBusy(null);
    }
  };

  const generateWeeklyReview = async (force = false) => {
    setBusy("review");
    try {
      await fetch("/api/growth/weekly-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      invalidate();
    } finally {
      setBusy(null);
    }
  };

  const updateRecommendationStatus = async (id: string, status: "done" | "skipped") => {
    setBusy(status);
    try {
      await fetch("/api/growth/recommend", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
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
        setActivityForm((prev) => ({ ...prev, title: "", notes: "" }));
        invalidate();
      }
    } finally {
      setBusy(null);
    }
  };

  const submitContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("contact");
    try {
      const res = await fetch("/api/growth/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contactForm),
      });
      if (res.ok) {
        setShowContactForm(false);
        setContactForm((prev) => ({ ...prev, name: "", notes: "", suggestedNextAction: "" }));
        invalidate();
      }
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

  const { metrics, recommendation, weeklyReview, opportunities, activities, contacts, snapshots } =
    data;
  const chartData = snapshots.map((s) => ({
    date: s.date.slice(5),
    score: Math.round(s.compoundingScore),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight hidden md:block">
            Growth Intelligence
          </h1>
          <p className="text-slate-500 mt-1 text-sm">
            Highest-leverage next moves so life compounds over years — not just days.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => generateRecommendation(true)}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 app-btn-primary px-3 py-2 text-sm disabled:opacity-60"
          >
            {busy === "recommend" || isFetching ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Sparkles size={14} />
            )}
            Today&apos;s move
          </button>
          <button
            type="button"
            onClick={() => generateWeeklyReview(true)}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 app-card hover:bg-white disabled:opacity-60"
          >
            {busy === "review" ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Weekly review
          </button>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <div className="app-card p-4 ring-1 ring-orange-200/60 bg-orange-50/40">
          <div className="flex items-center gap-2 mb-1">
            <Flame size={16} className="text-orange-600" />
            <p className="app-label text-orange-800">Compounding score</p>
          </div>
          <p className="text-3xl font-bold text-slate-900">{Math.round(metrics.compoundingScore)}</p>
          <p className="text-xs text-slate-600 mt-1">
            {metrics.improving ? "Improving vs recent history" : "Needs attention"}
          </p>
        </div>
        <div className="app-card p-4">
          <p className="app-label mb-1">Leverage mix (14d)</p>
          <p className="text-sm text-slate-800">
            Long-term: <span className="font-semibold">{metrics.leverageMix.longTermLeverage}</span>
            {" · "}
            Immediate: <span className="font-semibold">{metrics.leverageMix.immediateIncome}</span>
          </p>
          <p className="text-xs text-slate-500 mt-2">
            Cash {formatCurrency(metrics.financialSignals.cashAvailable)} · Debt{" "}
            {formatCurrency(metrics.financialSignals.creditDebt)}
          </p>
        </div>
        <div className="app-card p-4">
          <p className="app-label mb-1">Top bottleneck</p>
          <p className="text-sm text-slate-800 leading-relaxed">
            {metrics.bottlenecks[0] ?? "No major bottleneck detected — keep compounding."}
          </p>
        </div>
      </div>

      {recommendation ? (
        <div className="app-card p-5 ring-1 ring-teal-200/60 bg-teal-50/30">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <p className="app-label text-teal-800 mb-1">Highest-leverage move today</p>
              <h2 className="text-lg font-semibold text-slate-900">{recommendation.action}</h2>
            </div>
            <span className="text-xs font-semibold text-teal-700 shrink-0 capitalize">
              {recommendation.leverageType.replaceAll("_", " ")}
              {recommendation.domain ? ` · ${recommendation.domain}` : ""}
            </span>
          </div>
          <div className="space-y-2 text-sm text-slate-700 leading-relaxed">
            <p>
              <span className="font-semibold text-slate-900">Why:</span> {recommendation.whyItMatters}
            </p>
            <p>
              <span className="font-semibold text-slate-900">Long-term benefit:</span>{" "}
              {recommendation.longTermBenefit}
            </p>
            <p>
              <span className="font-semibold text-slate-900">Time:</span>{" "}
              {recommendation.timeRequiredMinutes} min
              {" · "}
              <span className="font-semibold text-slate-900">Opportunity cost:</span>{" "}
              {recommendation.opportunityCost}
            </p>
            {recommendation.nextActions.length > 0 ? (
              <ul className="list-disc pl-5 space-y-1">
                {recommendation.nextActions.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ul>
            ) : null}
            {(recommendation.relatedPeople.length > 0 || recommendation.relatedGoals.length > 0) && (
              <p className="text-xs text-slate-500">
                {recommendation.relatedPeople.length > 0
                  ? `People: ${recommendation.relatedPeople.join(", ")}`
                  : null}
                {recommendation.relatedPeople.length > 0 && recommendation.relatedGoals.length > 0
                  ? " · "
                  : null}
                {recommendation.relatedGoals.length > 0
                  ? `Goals: ${recommendation.relatedGoals.join(", ")}`
                  : null}
              </p>
            )}
          </div>
          {recommendation.status === "pending" ? (
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={() => updateRecommendationStatus(recommendation.id, "done")}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 app-btn-primary px-3 py-1.5 text-xs"
              >
                <CheckCircle2 size={14} /> Done
              </button>
              <button
                type="button"
                onClick={() => updateRecommendationStatus(recommendation.id, "skipped")}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white ring-1 ring-slate-200"
              >
                <SkipForward size={14} /> Skip
              </button>
            </div>
          ) : (
            <p className="mt-3 text-xs font-semibold text-slate-500 capitalize">
              Status: {recommendation.status}
            </p>
          )}
        </div>
      ) : (
        <div className="app-card p-5 text-center">
          <p className="text-slate-600 mb-3">No recommendation yet for today.</p>
          <button
            type="button"
            onClick={() => generateRecommendation(false)}
            disabled={busy !== null}
            className="app-btn-primary px-4 py-2 text-sm"
          >
            Generate today&apos;s highest-leverage move
          </button>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="app-card p-4">
          <p className="app-label mb-3">Domain scores</p>
          <div className="space-y-2.5">
            {DOMAINS.map((domain) => {
              const score = metrics.domains[domain];
              return (
                <div key={domain}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="capitalize text-slate-700 font-medium">{domain}</span>
                    <span className="text-slate-500">{Math.round(score)}</span>
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

        <div className="app-card p-4">
          <p className="app-label mb-3">Compounding over time</p>
          {chartData.length > 1 ? (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} width={28} />
                  <Tooltip />
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

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="app-card p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="app-label">Opportunity engine</p>
          </div>
          {opportunities.length === 0 ? (
            <p className="text-sm text-slate-500">No open opportunities. Log contacts and activities to surface more.</p>
          ) : (
            <ul className="space-y-3">
              {opportunities.map((opp) => (
                <li key={opp.id} className="border-b border-slate-100 last:border-0 pb-3 last:pb-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-slate-900 text-sm">{opp.title}</p>
                      <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{opp.description}</p>
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

        <div className="app-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Users size={14} className="text-slate-500" />
              <p className="app-label">Relationships</p>
            </div>
            <button
              type="button"
              onClick={() => setShowContactForm((v) => !v)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700"
            >
              <Plus size={12} /> Add
            </button>
          </div>
          {showContactForm ? (
            <form onSubmit={submitContact} className="space-y-2 mb-4 p-3 rounded-xl bg-slate-50">
              <input
                required
                className="app-input w-full px-3 py-1.5 text-sm"
                placeholder="Name"
                value={contactForm.name}
                onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  className="app-input w-full px-3 py-1.5 text-sm"
                  placeholder="Type (mentor, founder…)"
                  value={contactForm.relationshipType}
                  onChange={(e) =>
                    setContactForm({ ...contactForm, relationshipType: e.target.value })
                  }
                />
                <input
                  type="date"
                  className="app-input w-full px-3 py-1.5 text-sm"
                  value={contactForm.lastContactDate}
                  onChange={(e) =>
                    setContactForm({ ...contactForm, lastContactDate: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-start gap-2">
                  <textarea
                    className="app-input w-full px-3 py-2 text-sm min-h-[72px] resize-y"
                    placeholder="Notes about this person (who they are, last chat, what you owe them…)"
                    value={contactForm.notes}
                    onChange={(e) => setContactForm({ ...contactForm, notes: e.target.value })}
                  />
                  <VoiceToTextButton
                    value={contactForm.notes}
                    onChange={(notes) => setContactForm((prev) => ({ ...prev, notes }))}
                    disabled={busy === "contact"}
                    aria-label="Speak contact notes"
                  />
                </div>
                <p className="text-[11px] text-slate-500">
                  Tap the mic, speak, tap again to stop — leave next action blank for now.
                </p>
              </div>
              <button type="submit" disabled={busy === "contact"} className="app-btn-primary px-3 py-1.5 text-xs">
                Save contact
              </button>
            </form>
          ) : null}
          {contacts.length === 0 ? (
            <p className="text-sm text-slate-500">
              Add people so the system can track follow-ups and relationship compounding.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {contacts.slice(0, 8).map((c) => (
                <li key={c.id} className="text-sm">
                  <p className="font-medium text-slate-900">{c.name}</p>
                  <p className="text-xs text-slate-500">
                    {c.relationshipType ?? "contact"} · {c.status}
                    {c.lastContactDate ? ` · last ${c.lastContactDate}` : " · no contact date"}
                  </p>
                  {c.notes ? (
                    <p className="text-xs text-slate-600 mt-1 line-clamp-2">{c.notes}</p>
                  ) : (
                    <p className="text-xs text-slate-400 mt-1">No notes yet — add context when you can.</p>
                  )}
                  {c.suggestedNextAction ? (
                    <p className="text-xs text-teal-700 mt-1">Next: {c.suggestedNextAction}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {metrics.contactsNeedingAttention.length > 0 ? (
            <p className="text-xs text-amber-700 mt-3">
              Needs attention: {metrics.contactsNeedingAttention.map((c) => c.name).join(", ")}
            </p>
          ) : null}
        </div>
      </div>

      <div className="app-card p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="app-label">Recent growth activities</p>
          <button
            type="button"
            onClick={() => setShowActivityForm((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700"
          >
            <Plus size={12} /> Log activity
          </button>
        </div>
        {showActivityForm ? (
          <form onSubmit={submitActivity} className="grid sm:grid-cols-2 gap-2 mb-4 p-3 rounded-xl bg-slate-50">
            <input
              required
              className="app-input w-full px-3 py-1.5 text-sm sm:col-span-2"
              placeholder="What did you do?"
              value={activityForm.title}
              onChange={(e) => setActivityForm({ ...activityForm, title: e.target.value })}
            />
            <select
              className="app-input w-full px-3 py-1.5 text-sm"
              value={activityForm.domain}
              onChange={(e) => setActivityForm({ ...activityForm, domain: e.target.value })}
            >
              {DOMAINS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <select
              className="app-input w-full px-3 py-1.5 text-sm"
              value={activityForm.leverage}
              onChange={(e) => setActivityForm({ ...activityForm, leverage: e.target.value })}
            >
              <option value="long_term_leverage">Long-term leverage</option>
              <option value="immediate_income">Immediate income</option>
            </select>
            <input
              type="date"
              className="app-input w-full px-3 py-1.5 text-sm"
              value={activityForm.date}
              onChange={(e) => setActivityForm({ ...activityForm, date: e.target.value })}
            />
            <input
              className="app-input w-full px-3 py-1.5 text-sm"
              placeholder="Category (e.g. networking)"
              value={activityForm.category}
              onChange={(e) => setActivityForm({ ...activityForm, category: e.target.value })}
            />
            <input
              type="number"
              className="app-input w-full px-3 py-1.5 text-sm"
              placeholder="Minutes"
              value={activityForm.minutesSpent}
              onChange={(e) => setActivityForm({ ...activityForm, minutesSpent: e.target.value })}
            />
            <input
              type="number"
              min={1}
              max={10}
              className="app-input w-full px-3 py-1.5 text-sm"
              placeholder="Impact 1-10"
              value={activityForm.impactScore}
              onChange={(e) => setActivityForm({ ...activityForm, impactScore: e.target.value })}
            />
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
          <p className="text-sm text-slate-500">
            Log workouts, shipping blocks, networking, learning, and Lyft hours so the score can improve.
          </p>
        ) : (
          <ul className="space-y-2">
            {activities.slice(0, 10).map((a) => (
              <li key={a.id} className="flex justify-between gap-3 text-sm border-b border-slate-50 pb-2">
                <div>
                  <p className="font-medium text-slate-900">{a.title}</p>
                  <p className="text-xs text-slate-500 capitalize">
                    {a.date} · {a.domain} · {a.leverage.replaceAll("_", " ")}
                  </p>
                </div>
                <span className="text-xs text-slate-400 shrink-0">Impact {a.impactScore}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="app-card p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="app-label">Weekly review</p>
          {!weeklyReview ? (
            <button
              type="button"
              onClick={() => generateWeeklyReview(false)}
              disabled={busy !== null}
              className="text-xs font-semibold text-teal-700"
            >
              Generate
            </button>
          ) : null}
        </div>
        {!weeklyReview ? (
          <p className="text-sm text-slate-500">
            Run a founder-style weekly retrospective: what worked, what to cut, where leverage is.
          </p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4 text-sm text-slate-700">
            <div>
              <p className="font-semibold text-slate-900 mb-1">What worked</p>
              <ul className="space-y-1">
                {weeklyReview.whatWorked.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-semibold text-slate-900 mb-1">What didn&apos;t</p>
              <ul className="space-y-1">
                {weeklyReview.whatDidnt.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>
            <div className="sm:col-span-2 space-y-2">
              {weeklyReview.biggestReturn ? (
                <p>
                  <span className="font-semibold text-slate-900">Biggest return:</span>{" "}
                  {weeklyReview.biggestReturn}
                </p>
              ) : null}
              {weeklyReview.biggestBottleneck ? (
                <p>
                  <span className="font-semibold text-slate-900">Biggest bottleneck:</span>{" "}
                  {weeklyReview.biggestBottleneck}
                </p>
              ) : null}
              {weeklyReview.doMore.length > 0 ? (
                <p>
                  <span className="font-semibold text-slate-900">Do more:</span>{" "}
                  {weeklyReview.doMore.join(" · ")}
                </p>
              ) : null}
              {weeklyReview.stopDoing.length > 0 ? (
                <p>
                  <span className="font-semibold text-slate-900">Stop:</span>{" "}
                  {weeklyReview.stopDoing.join(" · ")}
                </p>
              ) : null}
              {weeklyReview.adjustments.length > 0 ? (
                <p>
                  <span className="font-semibold text-slate-900">Adjustments:</span>{" "}
                  {weeklyReview.adjustments.join(" · ")}
                </p>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
