"use client";

import { useMemo, useState } from "react";
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
  ImagePlus,
  X,
  Search,
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
import { VoiceToTextButton } from "@/components/voice-to-text-button";
import { isAcceptedChatImage, readImageAsDataUrl } from "@/lib/chat-images";
import { MAX_NOTE_IMAGES } from "@/lib/growth-contact-notes";
import { dayShapeFor, type JoyIdea } from "@/lib/joy-ideas-shared";

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
  lifeLeverageProfile: {
    promotionTarget: string | null;
    promotionDeadline: string | null;
    promotionUpsideAnnual: number | null;
    currentWeight: number | null;
    targetWeight: number | null;
    fitnessGoal: string | null;
    lyftHourlyNet: number | null;
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
  financial: ["debt", "budget", "admin", "investing", "lyft", "other"],
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

const CONTACT_TYPE_OPTIONS = [
  "unlabeled",
  "family",
  "peer",
  "social",
  "dating",
  "mentor",
  "founder",
  "investor",
  "colleague",
  "tenant",
  "other",
] as const;

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

type TodayPlanBlock = {
  key: string;
  label: string;
  time: string;
  why: string;
  domain: string;
  category: string;
  leverage: "immediate_income" | "long_term_leverage";
  minutes: number;
  impact: number;
  tone: "teal" | "sky" | "amber" | "slate";
};

function buildTodayPlan(
  metrics: GrowthDashboard["metrics"],
  recommendation: GrowthDashboard["recommendation"],
  profile: GrowthDashboard["lifeLeverageProfile"],
): { dayLabel: string; summary: string; blocks: TodayPlanBlock[] } {
  const now = DateTime.local();
  const shape = dayShapeFor(now.weekday);
  const isWeekend = shape === "weekend";
  const isOffice = shape === "office";
  const leverageMinutes = Math.min(
    isOffice ? 60 : isWeekend ? 90 : 75,
    Math.max(45, recommendation?.timeRequiredMinutes ?? (isOffice ? 45 : 60)),
  );
  const cashTight = metrics.financialSignals.safeSpendToday < 20 || metrics.financialSignals.cashAvailable < 1000;
  const socialThin = metrics.domains.social < 55 || metrics.activityCounts.social === 0;
  const promotionUpside = profile?.promotionUpsideAnnual ?? 0;
  const promotionDeadline = profile?.promotionDeadline
    ? DateTime.fromISO(profile.promotionDeadline)
    : null;
  const promotionSoon = promotionDeadline?.isValid
    ? promotionDeadline.diff(now, "days").days <= 60
    : Boolean(profile?.promotionTarget);
  const leverageLabel = promotionSoon
    ? isOffice
      ? "Promotion desk block"
      : "Promotion project block"
    : recommendation?.domain === "social" || socialThin
      ? isOffice
        ? "Network / async outreach"
        : "Network / startup leverage"
      : isOffice
        ? "Desk leverage block"
        : "Startup leverage";
  const leverageWhy = promotionSoon
    ? `Career hour toward ${profile?.promotionTarget ?? "your promotion"} (~${
        promotionUpside > 0 ? formatCurrency(promotionUpside) : "big"
      }/yr). Ship promo-ready work: visibility, docs, stakeholder updates, or the project that gets you promoted.${
        isOffice ? " Desk-compatible during office hours." : ""
      }`
    : firstSentence(recommendation?.action, 120) ??
      (isOffice
        ? "Desk-compatible ship, outreach, or learning that compounds."
        : "Ship, outreach, or learn something that compounds.");
  // Live ideas come from /api/growth/joy-ideas — not a stale profile list.
  const joyLabel = isWeekend
    ? "Intentional joy block"
    : isOffice
      ? "Small evening joy"
      : "Short joy reset";
  const joyTime = isWeekend ? "2-4 hr cap" : isOffice ? "20-40 min" : "30-60 min";
  const joyMinutes = isWeekend ? 150 : isOffice ? 30 : 45;
  const joyWhy = isWeekend
    ? "Tap Ideas for live DMV picks based on today."
    : isOffice
      ? "Short evening window. Tap Ideas for live picks."
      : "Capped around work. Tap Ideas for live picks.";
  const lyftWhy = cashTight
    ? isOffice
      ? "Morning Lyft already in rhythm; evening only if the weekly fee still needs covering."
      : "Cash-pressure block after higher-leverage work."
    : isOffice
      ? "Optional evening only — morning Lyft already baked in."
      : "Optional after body + leverage + joy.";
  const summary =
    shape === "weekend"
      ? "Protect body, one leverage block, and intentional joy. Lyft fills cash gaps, not the whole day."
      : shape === "office"
        ? "Office day — desk leverage around work, small evening joy, Lyft morning/evening only."
        : "WFH day — deeper leverage block, capped joy, Lyft after the deep work.";

  return {
    dayLabel: now.toFormat("cccc"),
    summary,
    blocks: [
      {
        key: "gym",
        label: profile?.fitnessGoal ? "Gym / body goal" : "Gym / body reset",
        time: "45-75 min",
        why: profile?.fitnessGoal ?? "Keeps tomorrow's work energy from borrowing against today.",
        domain: "fitness",
        category: "gym",
        leverage: "long_term_leverage",
        minutes: 60,
        impact: 7,
        tone: "teal",
      },
      {
        key: "leverage",
        label: leverageLabel,
        time: `${leverageMinutes} min`,
        why: leverageWhy,
        domain: promotionSoon ? "career" : recommendation?.domain ?? (socialThin ? "social" : "startup"),
        category: promotionSoon ? "promotion" : recommendation?.domain === "social" || socialThin ? "networking" : "build",
        leverage: "long_term_leverage",
        minutes: leverageMinutes,
        impact: 8,
        tone: "sky",
      },
      {
        key: "joy",
        label: joyLabel,
        time: joyTime,
        why: joyWhy,
        domain: "personal",
        category: "joy",
        leverage: "long_term_leverage",
        minutes: joyMinutes,
        impact: 6,
        tone: "amber",
      },
      {
        key: "lyft",
        label: cashTight ? "Lyft cash block" : isOffice ? "Optional evening Lyft" : "Optional Lyft",
        time: cashTight ? (isOffice ? "60-90 min evening" : "2-3 hr") : isOffice ? "60-90 min evening" : "60-90 min",
        why: lyftWhy,
        domain: "financial",
        category: "lyft",
        leverage: "immediate_income",
        minutes: cashTight ? (isOffice ? 75 : 150) : 75,
        impact: cashTight ? 7 : 4,
        tone: "slate",
      },
    ],
  };
}

export function GrowthView({ onOpenTrends }: { onOpenTrends?: () => void }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [showContactForm, setShowContactForm] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState("");
  const [pendingNoteImages, setPendingNoteImages] = useState<string[]>([]);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [contactQuery, setContactQuery] = useState("");
  const [contactTypeFilter, setContactTypeFilter] = useState("all");
  const [expandedContactId, setExpandedContactId] = useState<string | null>(null);
  const [showWeeklyDetails, setShowWeeklyDetails] = useState(false);
  const [showMoveDetails, setShowMoveDetails] = useState(false);
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [showJoyIdeas, setShowJoyIdeas] = useState(false);
  const [chosenJoy, setChosenJoy] = useState<JoyIdea | null>(null);
  const [joyIdeas, setJoyIdeas] = useState<JoyIdea[]>([]);
  const [joyWeather, setJoyWeather] = useState<string | null>(null);
  const [joyIdeasError, setJoyIdeasError] = useState<string | null>(null);
  const [loadingJoyIdeas, setLoadingJoyIdeas] = useState(false);
  const [showAddPlanBlock, setShowAddPlanBlock] = useState(false);
  const [myBlockForm, setMyBlockForm] = useState({
    title: "",
    minutesSpent: "60",
    domain: "personal",
    leverage: "long_term_leverage" as "long_term_leverage" | "immediate_income",
    notes: "",
  });
  const [activityForm, setActivityForm] = useState({
    date: DateTime.local().toISODate() ?? "",
    domain: "career",
    category: "project",
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
  const [profileForm, setProfileForm] = useState({
    promotionTarget: "",
    promotionDeadline: "",
    promotionUpsideAnnual: "",
    currentWeight: "",
    targetWeight: "",
    fitnessGoal: "",
    lyftHourlyNet: "20",
    notes: "",
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

  const contacts = data?.contacts ?? [];

  const contactTypes = useMemo(() => {
    const types = new Set<string>();
    for (const c of contacts) {
      if (c.relationshipType?.trim()) types.add(c.relationshipType.trim().toLowerCase());
    }
    return Array.from(types).sort();
  }, [contacts]);

  const filteredContacts = useMemo(() => {
    const q = contactQuery.trim().toLowerCase();
    return contacts
      .filter((c) => {
        if (contactTypeFilter !== "all") {
          const type = (c.relationshipType ?? "contact").toLowerCase();
          if (type !== contactTypeFilter) return false;
        }
        if (!q) return true;
        const haystack = [
          c.name,
          c.relationshipType ?? "",
          c.status,
          c.notes ?? "",
          c.suggestedNextAction ?? "",
          ...(c.noteEntries ?? []).map((e) => e.body ?? ""),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [contacts, contactQuery, contactTypeFilter]);

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

  const openProfileForm = () => {
    const profile = data?.lifeLeverageProfile;
    setProfileForm({
      promotionTarget: profile?.promotionTarget ?? "Promotion by end of August",
      promotionDeadline: profile?.promotionDeadline ?? "",
      promotionUpsideAnnual: profile?.promotionUpsideAnnual?.toString() ?? "20000",
      currentWeight: profile?.currentWeight?.toString() ?? "",
      targetWeight: profile?.targetWeight?.toString() ?? "",
      fitnessGoal: profile?.fitnessGoal ?? "Gym + cardio to protect energy and body goals",
      lyftHourlyNet: profile?.lyftHourlyNet?.toString() ?? "20",
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

  const loadJoyIdeas = async (mode: "toggle" | "refresh" = "toggle") => {
    if (mode === "toggle" && showJoyIdeas) {
      setShowJoyIdeas(false);
      return;
    }
    setShowJoyIdeas(true);
    setLoadingJoyIdeas(true);
    setJoyIdeasError(null);
    try {
      const res = await fetch("/api/growth/joy-ideas", { method: "POST" });
      if (!res.ok) throw new Error("Failed to load ideas");
      const payload = (await res.json()) as {
        ideas?: JoyIdea[];
        weatherSummary?: string | null;
      };
      setJoyIdeas(payload.ideas ?? []);
      setJoyWeather(payload.weatherSummary ?? null);
      if (!payload.ideas?.length) {
        setJoyIdeasError("No ideas came back — try again.");
      }
    } catch {
      setJoyIdeas([]);
      setJoyIdeasError("Could not load live ideas. Try again.");
    } finally {
      setLoadingJoyIdeas(false);
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

  const updateContactType = async (id: string, relationshipType: string) => {
    setBusy(`contact-type-${id}`);
    try {
      const res = await fetch("/api/growth/contacts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, relationshipType }),
      });
      if (res.ok) invalidate();
    } finally {
      setBusy(null);
    }
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

  const logTodayPlanBlock = async (block: TodayPlanBlock) => {
    setBusy(`today-plan-${block.key}`);
    const isJoy = block.key === "joy";
    const title = isJoy && chosenJoy ? `Joy: ${chosenJoy.label}` : block.label;
    const notes =
      isJoy && chosenJoy ? `${chosenJoy.detail}. ${block.why}` : block.why;
    try {
      const res = await fetch("/api/growth/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: DateTime.local().toISODate() ?? "",
          domain: block.domain,
          category: block.category,
          title,
          leverage: block.leverage,
          minutesSpent: block.minutes,
          impactScore: block.impact,
          notes,
        }),
      });
      if (res.ok) {
        if (isJoy) {
          setChosenJoy(null);
          setShowJoyIdeas(false);
        }
        invalidate();
      }
    } finally {
      setBusy(null);
    }
  };

  const addMyPlanBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!myBlockForm.title.trim()) return;
    setBusy("my-plan");
    try {
      const res = await fetch("/api/growth/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: DateTime.local().toISODate() ?? "",
          domain: myBlockForm.domain,
          category: "user_plan",
          title: myBlockForm.title.trim(),
          leverage: myBlockForm.leverage,
          minutesSpent: myBlockForm.minutesSpent,
          impactScore: myBlockForm.leverage === "immediate_income" ? 5 : 7,
          notes: myBlockForm.notes.trim() || "Added by you to today's planner",
        }),
      });
      if (res.ok) {
        setMyBlockForm({
          title: "",
          minutesSpent: "60",
          domain: "personal",
          leverage: "long_term_leverage",
          notes: "",
        });
        setShowAddPlanBlock(false);
        invalidate();
      }
    } finally {
      setBusy(null);
    }
  };

  const removeMyPlanBlock = async (id: string) => {
    setBusy(`remove-plan-${id}`);
    try {
      const res = await fetch(`/api/growth/activities?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (res.ok) invalidate();
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

  const openContactNotes = (contact: GrowthDashboard["contacts"][number]) => {
    setEditingContactId(contact.id);
    setExpandedContactId(contact.id);
    setEditingNotes("");
    setPendingNoteImages([]);
    setNoteError(null);
    setShowContactForm(false);
  };

  const closeContactNotes = () => {
    setEditingContactId(null);
    setEditingNotes("");
    setPendingNoteImages([]);
    setNoteError(null);
  };

  const toggleContactExpanded = (contactId: string) => {
    setExpandedContactId((prev) => {
      if (prev === contactId) {
        if (editingContactId === contactId) closeContactNotes();
        return null;
      }
      return contactId;
    });
  };

  const pickNoteImages = async (files: FileList | null) => {
    if (!files?.length) return;
    setNoteError(null);
    try {
      const next = [...pendingNoteImages];
      for (const file of Array.from(files)) {
        if (next.length >= MAX_NOTE_IMAGES) {
          setNoteError(`Up to ${MAX_NOTE_IMAGES} screenshots per note.`);
          break;
        }
        if (!isAcceptedChatImage(file)) {
          setNoteError("Use a JPG, PNG, WebP, or GIF screenshot.");
          continue;
        }
        next.push(await readImageAsDataUrl(file));
      }
      setPendingNoteImages(next);
    } catch (error) {
      setNoteError(error instanceof Error ? error.message : "Could not attach screenshot.");
    }
  };

  const saveContactNotes = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingContactId) return;
    if (!editingNotes.trim() && pendingNoteImages.length === 0) {
      setNoteError("Add some text or a screenshot.");
      return;
    }
    setBusy("contact-notes");
    setNoteError(null);
    try {
      const res = await fetch("/api/growth/contacts/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: editingContactId,
          body: editingNotes,
          images: pendingNoteImages,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setNoteError(data?.error ?? "Could not save note.");
        return;
      }
      setEditingNotes("");
      setPendingNoteImages([]);
      invalidate();
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

  const { metrics, recommendation, weeklyReview, opportunities, activities, snapshots } = data;
  const chartData = snapshots.map((s) => ({
    date: s.date.slice(5),
    score: Math.round(s.compoundingScore),
  }));
  const weeklyTldr = weeklyReview ? buildWeeklyTldr(weeklyReview) : null;
  const todayPlan = buildTodayPlan(metrics, recommendation, data.lifeLeverageProfile);
  const todayIso = DateTime.local().toISODate() ?? "";
  const myPlanBlocks = activities.filter(
    (a) => a.date === todayIso && a.category === "user_plan",
  );

  return (
    <div className="space-y-6 min-w-0 w-full max-w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl app-display text-slate-900 tracking-tight hidden md:block">
            Growth Intelligence
          </h1>
          <p className="text-slate-500 mt-1 text-sm">
            Highest-leverage next moves so life compounds over years — not just days.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onOpenTrends ? (
            <button
              type="button"
              onClick={onOpenTrends}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 rounded-xl ring-1 ring-slate-200/70"
            >
              Tech →
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              if (recommendation) {
                document.getElementById("todays-move")?.scrollIntoView({
                  behavior: "smooth",
                  block: "nearest",
                });
                return;
              }
              void generateRecommendation(false);
            }}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 app-btn-primary px-3 py-2 text-sm disabled:opacity-60"
          >
            {busy === "recommend" || isFetching ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Sparkles size={14} />
            )}
            {recommendation ? "Today's move" : "Generate today's move"}
          </button>
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

      <div className="grid sm:grid-cols-3 gap-3">
        <div className="app-card p-4 min-w-0 ring-1 ring-orange-200/60 bg-orange-50/40">
          <div className="flex items-center gap-2 mb-1">
            <Flame size={16} className="text-orange-600" />
            <p className="app-label text-orange-800">Compounding score</p>
          </div>
          <p className="text-3xl font-bold text-slate-900">{Math.round(metrics.compoundingScore)}</p>
          <p className="text-xs text-slate-600 mt-1">
            {metrics.improving ? "Improving vs recent history" : "Needs attention"}
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

      <div className="app-card p-5 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <p className="app-label mb-1">Life leverage profile</p>
            <h2 className="text-lg font-semibold text-slate-900">
              Teach the app your real tradeoffs
            </h2>
            <p className="text-sm text-slate-500 mt-1 leading-relaxed">
              Promotion upside, Lyft hourly value, body goal, and joy defaults make the planner less generic.
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
            <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
              <p className="app-label">Lyft</p>
              <p className="font-semibold text-slate-900">
                ~{formatCurrency(data.lifeLeverageProfile.lyftHourlyNet ?? 20)}/hr net
              </p>
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
              <label className="app-label block mb-1.5">Lyft net per hour ($)</label>
              <input
                type="number"
                className="app-input w-full px-3 py-2 text-sm"
                value={profileForm.lyftHourlyNet}
                onChange={(e) => setProfileForm({ ...profileForm, lyftHourlyNet: e.target.value })}
                placeholder="20"
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
              <label className="app-label block mb-1.5">Fitness goal</label>
              <input
                className="app-input w-full px-3 py-2 text-sm"
                value={profileForm.fitnessGoal}
                onChange={(e) => setProfileForm({ ...profileForm, fitnessGoal: e.target.value })}
                placeholder="Cardio 3x/week, cut weight, build energy"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="app-label block mb-1.5">Extra context</label>
              <textarea
                className="app-input w-full px-3 py-2 text-sm min-h-[72px]"
                value={profileForm.notes}
                onChange={(e) => setProfileForm({ ...profileForm, notes: e.target.value })}
                placeholder="Anything the app should remember when choosing where your time goes."
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

      <div className="app-card p-5 min-w-0 ring-1 ring-teal-100/80">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
          <div>
            <p className="app-label mb-1">Today planner</p>
            <h2 className="text-lg font-semibold text-slate-900">
              {todayPlan.dayLabel} life allocation
            </h2>
            <p className="text-sm text-slate-500 mt-1 leading-relaxed">
              {todayPlan.summary}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowAddPlanBlock((v) => !v)}
              className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
            >
              {showAddPlanBlock ? "Cancel" : "+ Add my block"}
            </button>
            <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800 ring-1 ring-teal-200/70">
              Keep Overview money-only
            </span>
          </div>
        </div>

        {showAddPlanBlock ? (
          <form
            onSubmit={addMyPlanBlock}
            className="mb-4 grid sm:grid-cols-2 gap-2 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200/80"
          >
            <div className="sm:col-span-2">
              <label className="app-label block mb-1">What&apos;s on your schedule</label>
              <input
                className="app-input w-full px-3 py-2 text-sm"
                value={myBlockForm.title}
                onChange={(e) => setMyBlockForm({ ...myBlockForm, title: e.target.value })}
                placeholder="e.g. Dentist 2pm, church, family dinner, deep work"
                required
              />
            </div>
            <div>
              <label className="app-label block mb-1">Minutes</label>
              <input
                type="number"
                min={15}
                className="app-input w-full px-3 py-2 text-sm"
                value={myBlockForm.minutesSpent}
                onChange={(e) =>
                  setMyBlockForm({ ...myBlockForm, minutesSpent: e.target.value })
                }
              />
            </div>
            <div>
              <label className="app-label block mb-1">Type</label>
              <select
                className="app-input w-full px-3 py-2 text-sm"
                value={myBlockForm.leverage}
                onChange={(e) =>
                  setMyBlockForm({
                    ...myBlockForm,
                    leverage: e.target.value as "long_term_leverage" | "immediate_income",
                  })
                }
              >
                <option value="long_term_leverage">Compound</option>
                <option value="immediate_income">Cash</option>
              </select>
            </div>
            <div>
              <label className="app-label block mb-1">Domain</label>
              <select
                className="app-input w-full px-3 py-2 text-sm"
                value={myBlockForm.domain}
                onChange={(e) => setMyBlockForm({ ...myBlockForm, domain: e.target.value })}
              >
                {DOMAINS.map((domain) => (
                  <option key={domain} value={domain}>
                    {domain}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="app-label block mb-1">Note (optional)</label>
              <input
                className="app-input w-full px-3 py-2 text-sm"
                value={myBlockForm.notes}
                onChange={(e) => setMyBlockForm({ ...myBlockForm, notes: e.target.value })}
                placeholder="Time / place / constraint"
              />
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <button
                type="submit"
                disabled={busy !== null || !myBlockForm.title.trim()}
                className="app-btn-primary px-4 py-2 text-sm disabled:opacity-60"
              >
                {busy === "my-plan" ? "Adding..." : "Add to today"}
              </button>
            </div>
          </form>
        ) : null}

        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {todayPlan.blocks.map((block) => {
            const toneClass =
              block.tone === "teal"
                ? "bg-teal-50/80 ring-teal-200/70 text-teal-800"
                : block.tone === "sky"
                  ? "bg-sky-50/80 ring-sky-200/70 text-sky-800"
                  : block.tone === "amber"
                    ? "bg-amber-50/80 ring-amber-200/70 text-amber-800"
                    : "bg-slate-50 ring-slate-200/80 text-slate-700";
            const isLogging = busy === `today-plan-${block.key}`;
            const isJoy = block.key === "joy";
            const displayLabel =
              isJoy && chosenJoy ? `Joy: ${chosenJoy.label}` : block.label;
            const displayWhy =
              isJoy && chosenJoy ? chosenJoy.detail : block.why;

            return (
              <div key={block.key} className={`rounded-2xl p-3 ring-1 ${toneClass}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{displayLabel}</p>
                    <p className="text-xs font-semibold mt-0.5">{block.time}</p>
                  </div>
                  <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                    {block.leverage === "immediate_income" ? "cash" : "compound"}
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-2 leading-relaxed">{displayWhy}</p>
                {isJoy ? (
                  <div className="mt-3 space-y-2">
                    <button
                      type="button"
                      onClick={() => void loadJoyIdeas()}
                      disabled={loadingJoyIdeas}
                      className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-white/80 px-3 py-1.5 text-xs font-semibold text-amber-900 ring-1 ring-amber-200/80 hover:bg-white disabled:opacity-60"
                    >
                      {loadingJoyIdeas ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : null}
                      {loadingJoyIdeas
                        ? "Finding ideas..."
                        : showJoyIdeas
                          ? "Hide ideas"
                          : "Ideas for today"}
                    </button>
                    {showJoyIdeas ? (
                      <div className="space-y-1.5">
                        {joyWeather ? (
                          <p className="text-[11px] text-slate-500 px-0.5">
                            {joyWeather}
                          </p>
                        ) : null}
                        {joyIdeasError ? (
                          <p className="text-[11px] text-amber-800 leading-snug rounded-xl bg-white/70 px-2.5 py-2 ring-1 ring-amber-100">
                            {joyIdeasError}
                          </p>
                        ) : null}
                        {joyIdeas.length > 0 ? (
                          <ul className="space-y-1.5 max-h-56 overflow-y-auto">
                            {joyIdeas.map((idea) => {
                              const selected = chosenJoy?.id === idea.id;
                              return (
                                <li key={idea.id}>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setChosenJoy(selected ? null : idea)
                                    }
                                    className={`w-full text-left rounded-xl px-2.5 py-2 ring-1 transition ${
                                      selected
                                        ? "bg-amber-100 ring-amber-300"
                                        : "bg-white/70 ring-amber-100 hover:bg-white"
                                    }`}
                                  >
                                    <p className="text-xs font-semibold text-slate-900">
                                      {idea.label}
                                    </p>
                                    <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                                      {idea.detail}
                                      {idea.timeFit ? ` · ${idea.timeFit}` : ""}
                                    </p>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        ) : null}
                        {!loadingJoyIdeas && joyIdeas.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => void loadJoyIdeas("refresh")}
                            className="w-full text-[11px] font-semibold text-amber-900/80 py-1"
                          >
                            Refresh ideas
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => logTodayPlanBlock(block)}
                  disabled={busy !== null}
                  className="mt-3 w-full rounded-xl bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-white/80 hover:bg-white disabled:opacity-60"
                >
                  {isLogging ? "Logging..." : "Log when done"}
                </button>
              </div>
            );
          })}

          {myPlanBlocks.map((block) => (
            <div
              key={block.id}
              className="rounded-2xl p-3 ring-1 bg-white ring-slate-300/80 text-slate-700"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{block.title}</p>
                  <p className="text-xs font-semibold mt-0.5 text-slate-600">
                    {block.minutesSpent ? `${block.minutesSpent} min` : "Your block"}
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                  yours
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                {block.notes?.trim() || "On your real schedule today."}
              </p>
              <p className="text-[11px] text-slate-400 mt-1 capitalize">
                {block.domain}
                {" · "}
                {block.leverage === "immediate_income" ? "cash" : "compound"}
              </p>
              <button
                type="button"
                onClick={() => removeMyPlanBlock(block.id)}
                disabled={busy !== null}
                className="mt-3 w-full rounded-xl bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100 disabled:opacity-60"
              >
                {busy === `remove-plan-${block.id}` ? "Removing..." : "Remove"}
              </button>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-500 mt-3">
          System blocks are a default allocation. Add your real appointments and plans with{" "}
          <span className="font-semibold">+ Add my block</span>.
        </p>
      </div>

      {recommendation ? (
        <div
          id="todays-move"
          className="app-card p-5 ring-1 ring-teal-200/60 bg-teal-50/30 min-w-0"
        >
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <p className="app-label text-teal-800">Highest-leverage move today</p>
            <span className="text-[11px] font-semibold text-teal-700/90 capitalize rounded-full bg-white/80 px-2 py-0.5 ring-1 ring-teal-200/60">
              {recommendation.timeRequiredMinutes} min
            </span>
            {recommendation.domain ? (
              <span className="text-[11px] font-semibold text-slate-600 capitalize rounded-full bg-white/80 px-2 py-0.5 ring-1 ring-slate-200/70">
                {recommendation.domain}
              </span>
            ) : null}
            <span className="text-[11px] font-medium text-slate-500 capitalize">
              {recommendation.leverageType.replaceAll("_", " ")}
            </span>
          </div>

          <h2 className="text-xl font-semibold text-slate-900 tracking-tight leading-snug break-words">
            {firstSentence(recommendation.action, 90) ?? recommendation.action}
          </h2>

          <p className="mt-3 text-sm text-slate-600 leading-relaxed break-words">
            {firstSentence(recommendation.whyItMatters, 160) ?? recommendation.whyItMatters}
          </p>

          {recommendation.nextActions.length > 0 ? (
            <ol className="mt-4 space-y-2.5">
              {(showMoveDetails
                ? recommendation.nextActions
                : recommendation.nextActions.slice(0, 3)
              ).map((step, index) => (
                <li key={`${index}-${step.slice(0, 24)}`} className="flex gap-3 min-w-0">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-600 text-[11px] font-bold text-white">
                    {index + 1}
                  </span>
                  <span className="text-sm text-slate-800 leading-snug break-words">
                    {showMoveDetails ? step : firstSentence(step, 100) ?? step}
                  </span>
                </li>
              ))}
            </ol>
          ) : null}

          {showMoveDetails ? (
            <div className="mt-4 space-y-3 rounded-xl bg-white/70 p-3 ring-1 ring-slate-200/60 text-sm text-slate-700 leading-relaxed">
              <p className="break-words">
                <span className="font-semibold text-slate-900">Long-term: </span>
                {recommendation.longTermBenefit}
              </p>
              <p className="break-words">
                <span className="font-semibold text-slate-900">Instead of: </span>
                {recommendation.opportunityCost}
              </p>
              {(recommendation.relatedPeople.length > 0 ||
                recommendation.relatedGoals.length > 0) && (
                <p className="text-xs text-slate-500 break-words">
                  {recommendation.relatedPeople.length > 0
                    ? `People: ${recommendation.relatedPeople.join(", ")}`
                    : null}
                  {recommendation.relatedPeople.length > 0 &&
                  recommendation.relatedGoals.length > 0
                    ? " · "
                    : null}
                  {recommendation.relatedGoals.length > 0
                    ? `Goals: ${recommendation.relatedGoals.join(", ")}`
                    : null}
                </p>
              )}
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {recommendation.status === "pending" ? (
              <>
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
              </>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold text-slate-500 capitalize">
                  Status: {recommendation.status}
                </p>
                {recommendation.status === "skipped" ? (
                  <button
                    type="button"
                    onClick={() => generateRecommendation(true)}
                    disabled={busy !== null}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-teal-800 bg-white ring-1 ring-teal-200"
                  >
                    <RefreshCw size={14} /> Different move
                  </button>
                ) : null}
              </div>
            )}
            <button
              type="button"
              onClick={() => setShowMoveDetails((v) => !v)}
              className="text-xs font-semibold text-teal-700 ml-auto"
            >
              {showMoveDetails ? "Hide details" : "Why this / full plan"}
            </button>
          </div>
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
        <div className="app-card p-4 min-w-0">
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

        <div className="app-card p-4 min-w-0 overflow-hidden">
          <p className="app-label mb-3">Compounding over time</p>
          {chartData.length > 1 ? (
            <div className="h-48 w-full min-w-0">
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
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 min-w-0">
              <Users size={14} className="text-slate-500 shrink-0" />
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
              <div className="grid grid-cols-2 gap-2 min-w-0">
                <select
                  className="app-input w-full min-w-0 px-3 py-1.5 text-sm capitalize"
                  value={contactForm.relationshipType}
                  onChange={(e) =>
                    setContactForm({ ...contactForm, relationshipType: e.target.value })
                  }
                  aria-label="Relationship type"
                >
                  {CONTACT_TYPE_OPTIONS.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  className="app-input w-full min-w-0 px-3 py-1.5 text-sm"
                  value={contactForm.lastContactDate}
                  onChange={(e) =>
                    setContactForm({ ...contactForm, lastContactDate: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-start gap-2 min-w-0">
                  <textarea
                    className="app-input min-w-0 flex-1 px-3 py-2 text-sm min-h-[72px] resize-y"
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
            <div className="space-y-2.5">
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                />
                <input
                  type="search"
                  value={contactQuery}
                  onChange={(e) => setContactQuery(e.target.value)}
                  placeholder="Search name, notes, type…"
                  className="app-input w-full pl-9 pr-3 py-2 text-sm"
                  aria-label="Search relationships"
                />
              </div>
              {contactTypes.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setContactTypeFilter("all")}
                    className={`text-[11px] font-semibold rounded-full px-2.5 py-1 ring-1 ${
                      contactTypeFilter === "all"
                        ? "bg-teal-600 text-white ring-teal-600"
                        : "bg-white text-slate-600 ring-slate-200"
                    }`}
                  >
                    All ({contacts.length})
                  </button>
                  {contactTypes.map((type) => {
                    const count = contacts.filter(
                      (c) => (c.relationshipType ?? "").toLowerCase() === type,
                    ).length;
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setContactTypeFilter(type)}
                        className={`text-[11px] font-semibold rounded-full px-2.5 py-1 ring-1 capitalize ${
                          contactTypeFilter === type
                            ? "bg-teal-600 text-white ring-teal-600"
                            : "bg-white text-slate-600 ring-slate-200"
                        }`}
                      >
                        {type} ({count})
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {filteredContacts.length === 0 ? (
                <p className="text-sm text-slate-500 py-2">No matches — try another search.</p>
              ) : (
                <ul className="space-y-1.5 max-h-[28rem] overflow-y-auto overflow-x-hidden pr-0.5">
                  {filteredContacts.map((c) => {
                    const entries = c.noteEntries ?? [];
                    const hasNotes = entries.length > 0 || Boolean(c.notes?.trim());
                    const expanded = expandedContactId === c.id;
                    const latest =
                      entries[0]?.body?.trim() ||
                      (c.notes?.trim() ? firstSentence(c.notes, 90) : null);
                    const noteCount = entries.length > 0 ? entries.length : hasNotes ? 1 : 0;

                    return (
                      <li
                        key={c.id}
                        className="text-sm rounded-xl ring-1 ring-slate-100 min-w-0 overflow-hidden"
                      >
                        <div className="flex items-start gap-2 p-2.5">
                          <button
                            type="button"
                            onClick={() => toggleContactExpanded(c.id)}
                            className="min-w-0 flex-1 text-left"
                          >
                            <div className="flex items-center gap-1.5">
                              <p className="font-medium text-slate-900 truncate">{c.name}</p>
                              {noteCount > 0 ? (
                                <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 rounded-full px-1.5 py-0.5 shrink-0">
                                  {noteCount}
                                </span>
                              ) : null}
                            </div>
                            <p className="text-xs text-slate-500 truncate">
                              {c.status}
                              {c.lastContactDate ? ` · ${c.lastContactDate}` : ""}
                              {!latest &&
                              (c.relationshipType ?? "unlabeled") === "family"
                                ? " · notes optional"
                                : !latest
                                  ? " · no notes yet"
                                  : ""}
                            </p>
                            {!expanded && latest ? (
                              <p className="text-xs text-slate-600 mt-1 line-clamp-1">{latest}</p>
                            ) : null}
                          </button>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <select
                              className="app-input text-[11px] font-semibold capitalize px-2 py-1 max-w-[7.5rem]"
                              value={(c.relationshipType ?? "unlabeled").toLowerCase()}
                              disabled={busy === `contact-type-${c.id}`}
                              onChange={(e) => void updateContactType(c.id, e.target.value)}
                              aria-label={`Label for ${c.name}`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {CONTACT_TYPE_OPTIONS.map((type) => (
                                <option key={type} value={type}>
                                  {type}
                                </option>
                              ))}
                              {!CONTACT_TYPE_OPTIONS.includes(
                                (c.relationshipType ?? "unlabeled").toLowerCase() as (typeof CONTACT_TYPE_OPTIONS)[number],
                              ) && c.relationshipType ? (
                                <option value={c.relationshipType.toLowerCase()}>
                                  {c.relationshipType}
                                </option>
                              ) : null}
                            </select>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  editingContactId === c.id
                                    ? closeContactNotes()
                                    : openContactNotes(c)
                                }
                                className="text-xs font-semibold text-teal-700 px-1.5 py-1"
                              >
                                {editingContactId === c.id ? "Close" : "Note"}
                              </button>
                              <button
                                type="button"
                                onClick={() => toggleContactExpanded(c.id)}
                                className="p-1 text-slate-400 hover:text-slate-700"
                                aria-label={expanded ? "Collapse" : "Expand"}
                              >
                                {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                              </button>
                            </div>
                          </div>
                        </div>

                        {expanded ? (
                          <div className="px-2.5 pb-2.5 space-y-2 border-t border-slate-100 pt-2">
                            {entries.length > 0 ? (
                              <ul className="space-y-2 max-h-40 overflow-y-auto overflow-x-hidden">
                                {entries.map((entry) => {
                                  const when = DateTime.fromISO(entry.createdAt).isValid
                                    ? DateTime.fromISO(entry.createdAt)
                                    : DateTime.fromJSDate(new Date(entry.createdAt));
                                  return (
                                    <li
                                      key={entry.id}
                                      className="rounded-lg bg-slate-50/80 px-2.5 py-2 ring-1 ring-slate-100 min-w-0"
                                    >
                                      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                                        {when.isValid
                                          ? when.toFormat("LLL d, yyyy · h:mm a")
                                          : "Saved note"}
                                      </p>
                                      {entry.body?.trim() ? (
                                        <p className="text-xs text-slate-700 mt-1 whitespace-pre-wrap break-words">
                                          {entry.body}
                                        </p>
                                      ) : null}
                                      {entry.images.length > 0 ? (
                                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                                          {entry.images.map((image, imageIndex) => (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                              key={`${entry.id}-${imageIndex}`}
                                              src={image}
                                              alt={`Screenshot ${imageIndex + 1}`}
                                              className="h-16 w-16 rounded-md object-cover ring-1 ring-slate-200"
                                            />
                                          ))}
                                        </div>
                                      ) : null}
                                    </li>
                                  );
                                })}
                              </ul>
                            ) : c.notes ? (
                              <p className="text-xs text-slate-600 whitespace-pre-wrap break-words">
                                {c.notes}
                              </p>
                            ) : editingContactId !== c.id ? (
                              <p className="text-xs text-slate-400">
                                Nothing saved yet — tap Note to add one.
                              </p>
                            ) : null}

                            {editingContactId === c.id ? (
                              <form onSubmit={saveContactNotes} className="space-y-2 min-w-0">
                                <div className="flex items-start gap-2 min-w-0">
                                  <textarea
                                    className="app-input min-w-0 flex-1 px-3 py-2 text-sm min-h-[80px] resize-y"
                                    placeholder="New note — who they are, last chat, what you learned…"
                                    value={editingNotes}
                                    onChange={(e) => setEditingNotes(e.target.value)}
                                    autoFocus
                                  />
                                  <div className="flex flex-col gap-1.5 shrink-0">
                                    <VoiceToTextButton
                                      value={editingNotes}
                                      onChange={setEditingNotes}
                                      disabled={busy === "contact-notes"}
                                      aria-label={`Speak notes for ${c.name}`}
                                    />
                                    <label
                                      className={`inline-flex h-10 w-10 items-center justify-center rounded-full ring-1 ring-slate-200 bg-white text-slate-600 cursor-pointer hover:bg-slate-50 ${
                                        busy === "contact-notes"
                                          ? "opacity-50 pointer-events-none"
                                          : ""
                                      }`}
                                      title="Attach screenshot"
                                    >
                                      <ImagePlus className="h-4 w-4" />
                                      <input
                                        type="file"
                                        accept="image/jpeg,image/png,image/webp,image/gif"
                                        multiple
                                        className="sr-only"
                                        disabled={busy === "contact-notes"}
                                        onChange={(e) => {
                                          void pickNoteImages(e.target.files);
                                          e.target.value = "";
                                        }}
                                      />
                                    </label>
                                  </div>
                                </div>
                                {pendingNoteImages.length > 0 ? (
                                  <div className="flex flex-wrap gap-1.5">
                                    {pendingNoteImages.map((image, index) => (
                                      <div key={`pending-${index}`} className="relative">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                          src={image}
                                          alt={`Pending screenshot ${index + 1}`}
                                          className="h-14 w-14 rounded-md object-cover ring-1 ring-slate-200"
                                        />
                                        <button
                                          type="button"
                                          className="absolute -top-1.5 -right-1.5 rounded-full bg-slate-800 text-white p-0.5"
                                          onClick={() =>
                                            setPendingNoteImages((prev) =>
                                              prev.filter((_, i) => i !== index),
                                            )
                                          }
                                          aria-label="Remove screenshot"
                                        >
                                          <X className="h-3 w-3" />
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                ) : null}
                                {noteError ? (
                                  <p className="text-[11px] text-rose-600">{noteError}</p>
                                ) : null}
                                <div className="flex items-center gap-2 flex-wrap">
                                  <button
                                    type="submit"
                                    disabled={busy === "contact-notes"}
                                    className="app-btn-primary px-3 py-1.5 text-xs"
                                  >
                                    {busy === "contact-notes" ? "Saving…" : "Add note"}
                                  </button>
                                  <p className="text-[11px] text-slate-500">
                                    Each save is dated · text or screenshots
                                  </p>
                                </div>
                              </form>
                            ) : null}

                            {c.suggestedNextAction && editingContactId !== c.id ? (
                              <p className="text-xs text-teal-700">Next: {c.suggestedNextAction}</p>
                            ) : null}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
          {metrics.contactsNeedingAttention.length > 0 ? (
            <p className="text-xs text-amber-700 mt-3">
              Needs attention: {metrics.contactsNeedingAttention.map((c) => c.name).join(", ")}
            </p>
          ) : null}
        </div>
      </div>

      <div className="app-card p-4 min-w-0 overflow-hidden">
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
        {showActivityForm ? (
          <form onSubmit={submitActivity} className="grid sm:grid-cols-2 gap-2 mb-4 p-3 rounded-xl bg-slate-50">
            <div className="flex items-start gap-2 min-w-0 sm:col-span-2">
              <textarea
                required
                className="app-input min-w-0 flex-1 px-3 py-2 text-sm min-h-[72px] resize-y"
                placeholder="What did you do? Tap mic to speak…"
                value={activityForm.title}
                onChange={(e) => setActivityForm({ ...activityForm, title: e.target.value })}
              />
              <VoiceToTextButton
                value={activityForm.title}
                onChange={(title) => setActivityForm((prev) => ({ ...prev, title }))}
                disabled={busy === "activity"}
                aria-label="Speak activity"
              />
            </div>
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
                How much this compounds — not how fun it was
              </span>
            </label>
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
              <li key={a.id} className="flex justify-between gap-3 text-sm border-b border-slate-50 pb-2 min-w-0">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 break-words">{a.title}</p>
                  <p className="text-xs text-slate-500 capitalize break-words">
                    {a.date} · {a.domain} · {a.leverage.replaceAll("_", " ")}
                  </p>
                </div>
                <span className="text-xs text-slate-400 shrink-0">Impact {a.impactScore}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div id="weekly-review" className="app-card p-4 scroll-mt-4">
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
          <p className="text-sm text-slate-500">
            Run a founder-style weekly retrospective: what worked, what to cut, where leverage is.
          </p>
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
  );
}
