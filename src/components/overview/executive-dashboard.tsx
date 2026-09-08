"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  HeartPulse,
  Loader2,
  Network,
  Plus,
  Rocket,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { formatCurrency } from "@/lib/format";

const DOMAINS = [
  "career",
  "business",
  "real_estate",
  "network",
  "health",
  "financial",
  "personal",
] as const;
type Domain = (typeof DOMAINS)[number];
type SystemStatus = "unstable" | "stabilizing" | "operational" | "scaling";

type OperatingSystem = {
  id: string;
  name: string;
  domain: Domain;
  status: SystemStatus;
  currentState: string;
  targetState: string;
  progress: number;
  nextAction: string | null;
  blocker: string | null;
  deadline: string | null;
  history: Array<{
    id: string;
    note: string | null;
    status: string;
    progress: number;
    createdAt: string;
  }>;
};

type ExecutiveData = {
  position: {
    compoundingScore: number | null;
    compoundingDelta: number | null;
    systemsOperational: number;
    systemsTotal: number;
    openOpportunities: number;
    winsLast30Days: number;
    activitiesByDomain: Record<string, number>;
  };
  financialHealth: {
    chaseReserve: number;
    capitalOneReserve: number;
    totalCash: number;
    creditDebt: number;
    netWorthProxy: number;
  };
  trajectory: Array<{
    domain: string;
    current: number | null;
    delta: number | null;
  }>;
  systems: OperatingSystem[];
  leverageActions: Array<{
    id: string;
    title: string;
    why: string;
    domain: string | null;
    source: "recommendation" | "system" | "opportunity";
  }>;
  pipeline: Array<{
    id: string;
    title: string;
    description: string;
    domain: string | null;
    urgency: string;
    relatedPeople: string[];
  }>;
  relationshipsNeedingAttention: Array<{
    id: string;
    name: string;
    relationshipType: string | null;
    daysSinceContact: number | null;
    suggestedNextAction: string | null;
  }>;
  wins: Array<{
    id: string;
    date: string;
    title: string;
    domain: Domain;
    impact: string | null;
  }>;
};

type Props = {
  onOpenGrowth: () => void;
  onOpenFinance: () => void;
  onOpenGoals: () => void;
};

const STATUS_ORDER: SystemStatus[] = [
  "unstable",
  "stabilizing",
  "operational",
  "scaling",
];

const DOMAIN_LABELS: Record<string, string> = {
  career: "Career",
  startup: "Business",
  business: "Business",
  real_estate: "Real estate",
  social: "Network",
  network: "Network",
  fitness: "Health",
  health: "Health",
  financial: "Financial",
  personal: "Personal",
};

const DOMAIN_ICONS = {
  career: BriefcaseBusiness,
  business: Rocket,
  real_estate: Building2,
  network: Network,
  health: HeartPulse,
  financial: CircleDollarSign,
  personal: Sparkles,
};

function domainLabel(domain: string | null) {
  return DOMAIN_LABELS[domain ?? ""] ?? "Growth";
}

function systemStatusClass(status: SystemStatus) {
  if (status === "scaling") return "bg-violet-500/12 text-violet-700 ring-violet-500/25";
  if (status === "operational") return "bg-emerald-500/12 text-emerald-700 ring-emerald-500/25";
  if (status === "stabilizing") return "bg-amber-500/12 text-amber-700 ring-amber-500/25";
  return "bg-rose-500/10 text-rose-700 ring-rose-500/25";
}

function trajectoryLanguage(delta: number | null) {
  if (delta == null) return { label: "Building baseline", className: "text-[var(--muted)]" };
  if (delta > 1) return { label: `+${delta.toFixed(1)} improving`, className: "text-emerald-700" };
  if (delta < -1) return { label: `${delta.toFixed(1)} needs attention`, className: "text-rose-700" };
  return { label: "Stable", className: "text-[var(--muted)]" };
}

function fetchExecutiveDashboard() {
  return fetch("/api/executive").then(async (response) => {
    if (!response.ok) throw new Error("Could not load your operating system.");
    return response.json() as Promise<ExecutiveData>;
  });
}

export function ExecutiveDashboard({ onOpenGrowth, onOpenFinance, onOpenGoals }: Props) {
  const queryClient = useQueryClient();
  const [showSystemForm, setShowSystemForm] = useState(false);
  const [showWinForm, setShowWinForm] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [systemForm, setSystemForm] = useState({
    name: "",
    domain: "career" as Domain,
    currentState: "",
    targetState: "",
    nextAction: "",
    blocker: "",
    deadline: "",
  });
  const [winForm, setWinForm] = useState({
    title: "",
    domain: "career" as Domain,
    impact: "",
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["executive-dashboard"],
    queryFn: fetchExecutiveDashboard,
    staleTime: 60_000,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["executive-dashboard"] });
  };

  const createSystem = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy("system");
    setErrorMessage(null);
    try {
      const response = await fetch("/api/systems", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(systemForm),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not create system.");
      }
      setSystemForm({
        name: "",
        domain: "career",
        currentState: "",
        targetState: "",
        nextAction: "",
        blocker: "",
        deadline: "",
      });
      setShowSystemForm(false);
      refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not create system.");
    } finally {
      setBusy(null);
    }
  };

  const advanceSystem = async (system: OperatingSystem) => {
    const currentIndex = STATUS_ORDER.indexOf(system.status);
    if (currentIndex === STATUS_ORDER.length - 1) return;
    const status = STATUS_ORDER[currentIndex + 1];
    const progressFloor = { stabilizing: 35, operational: 75, scaling: 100 }[status];
    setBusy(`system:${system.id}`);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/systems", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: system.id,
          status,
          progress: Math.max(system.progress, progressFloor),
          note: `Advanced to ${status}`,
        }),
      });
      if (!response.ok) throw new Error("Could not advance system.");
      refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not advance system.");
    } finally {
      setBusy(null);
    }
  };

  const createWin = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy("win");
    setErrorMessage(null);
    try {
      const response = await fetch("/api/wins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(winForm),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not record win.");
      }
      setWinForm({ title: "", domain: "career", impact: "" });
      setShowWinForm(false);
      refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not record win.");
    } finally {
      setBusy(null);
    }
  };

  if (isLoading && !data) {
    return (
      <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-[var(--muted)]">
        <Loader2 size={18} className="animate-spin" />
        Reading your trajectory…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="app-card p-6 text-center text-sm text-rose-700">
        {error instanceof Error ? error.message : "Could not load your operating system."}
      </div>
    );
  }

  const { position, financialHealth } = data;
  const operationalRatio =
    position.systemsTotal > 0
      ? Math.round((position.systemsOperational / position.systemsTotal) * 100)
      : 0;
  const headline =
    position.systemsTotal === 0
      ? "Define the systems that make your life stronger."
      : operationalRatio >= 70
        ? "Your foundation is stable. Keep scaling leverage."
        : position.systemsOperational > 0
          ? "Your operating system is getting stronger."
          : "Your next move is to stabilize the foundation.";

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 pb-4">
      <header className="rounded-3xl bg-[color-mix(in_srgb,var(--accent)_11%,var(--card-solid))] p-5 ring-1 ring-[color-mix(in_srgb,var(--accent)_24%,transparent)] md:p-7">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--accent-strong)]">
          Executive overview
        </p>
        <h1 className="mt-2 max-w-2xl text-2xl font-semibold tracking-tight text-[var(--ink)] md:text-3xl">
          {headline}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--ink-soft)]">
          Monitor trajectory, strengthen weak systems, and protect the few actions with real upside.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-4">
          <PositionMetric
            label="Compounding"
            value={position.compoundingScore == null ? "—" : Math.round(position.compoundingScore).toString()}
            detail={
              position.compoundingDelta == null
                ? "Baseline forming"
                : `${position.compoundingDelta >= 0 ? "+" : ""}${position.compoundingDelta.toFixed(1)} over 90d`
            }
          />
          <PositionMetric
            label="Systems stable"
            value={`${position.systemsOperational}/${position.systemsTotal}`}
            detail={position.systemsTotal ? `${operationalRatio}% operational` : "Set your first system"}
          />
          <PositionMetric
            label="Open pipeline"
            value={position.openOpportunities.toString()}
            detail="Opportunities in motion"
          />
          <PositionMetric
            label="Recent wins"
            value={position.winsLast30Days.toString()}
            detail="Last 30 days"
          />
        </div>
      </header>

      {errorMessage ? (
        <div className="flex items-center gap-2 rounded-2xl bg-rose-500/10 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-500/20">
          <AlertTriangle size={16} />
          {errorMessage}
        </div>
      ) : null}

      <section className="app-card p-4 md:p-5">
        <SectionHeading
          eyebrow="Do next"
          title="Highest-leverage actions"
          detail="A short list, ranked above routine noise."
        />
        {data.leverageActions.length > 0 ? (
          <ol className="mt-3 space-y-2">
            {data.leverageActions.map((action, index) => (
              <li
                key={action.id}
                className="flex gap-3 rounded-2xl bg-[var(--card-solid)] p-3 ring-1 ring-[var(--card-border)]"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-bold text-white">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-[var(--ink)]">{action.title}</p>
                    <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent-strong)]">
                      {domainLabel(action.domain)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{action.why}</p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState copy="Add a system or opportunity with a concrete next action." />
        )}
      </section>

      <section className="app-card p-4 md:p-5">
        <SectionHeading
          eyebrow="Trajectory"
          title="What is improving?"
          detail="Rolling growth snapshots favor sustained movement over daily fluctuations."
        />
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {data.trajectory.map((item) => {
            const trend = trajectoryLanguage(item.delta);
            const TrendIcon = item.delta != null && item.delta < -1 ? TrendingDown : TrendingUp;
            return (
              <div key={item.domain} className="rounded-2xl bg-[var(--card-solid)] p-3 ring-1 ring-[var(--card-border)]">
                <p className="text-xs font-semibold text-[var(--ink)]">{domainLabel(item.domain)}</p>
                <p className="mt-2 text-xl font-semibold tabular-nums text-[var(--ink)]">
                  {item.current == null ? "—" : Math.round(item.current)}
                </p>
                <p className={`mt-1 flex items-center gap-1 text-[10px] font-semibold ${trend.className}`}>
                  <TrendIcon size={12} />
                  {trend.label}
                </p>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onOpenGrowth}
          className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--accent-strong)]"
        >
          Open growth workspace <ArrowRight size={15} />
        </button>
      </section>

      <section className="app-card p-4 md:p-5">
        <div className="flex items-start justify-between gap-3">
          <SectionHeading
            eyebrow="Systems"
            title="Make important areas boring"
            detail="Move each system from unstable to operational, then scale it."
          />
          <button
            type="button"
            onClick={() => setShowSystemForm((open) => !open)}
            className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl px-3 text-xs font-semibold text-[var(--accent-strong)] ring-1 ring-[var(--card-border)]"
          >
            <Plus size={14} /> Add
          </button>
        </div>

        {showSystemForm ? (
          <form onSubmit={createSystem} className="mt-4 grid gap-3 rounded-2xl bg-[var(--accent-soft)] p-3 sm:grid-cols-2">
            <FormField label="System name">
              <input
                required
                className="app-input min-h-11 w-full px-3 text-sm"
                placeholder="Property #1 becomes operationally boring"
                value={systemForm.name}
                onChange={(event) => setSystemForm({ ...systemForm, name: event.target.value })}
              />
            </FormField>
            <FormField label="Area">
              <select
                className="app-input min-h-11 w-full px-3 text-sm capitalize"
                value={systemForm.domain}
                onChange={(event) =>
                  setSystemForm({ ...systemForm, domain: event.target.value as Domain })
                }
              >
                {DOMAINS.map((domain) => (
                  <option key={domain} value={domain}>{domainLabel(domain)}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Current state">
              <textarea
                required
                className="app-input min-h-20 w-full p-3 text-sm"
                placeholder="What is true now?"
                value={systemForm.currentState}
                onChange={(event) =>
                  setSystemForm({ ...systemForm, currentState: event.target.value })
                }
              />
            </FormField>
            <FormField label="Target state">
              <textarea
                required
                className="app-input min-h-20 w-full p-3 text-sm"
                placeholder="What does boring or scaled look like?"
                value={systemForm.targetState}
                onChange={(event) =>
                  setSystemForm({ ...systemForm, targetState: event.target.value })
                }
              />
            </FormField>
            <FormField label="Next action">
              <input
                className="app-input min-h-11 w-full px-3 text-sm"
                placeholder="One concrete move"
                value={systemForm.nextAction}
                onChange={(event) =>
                  setSystemForm({ ...systemForm, nextAction: event.target.value })
                }
              />
            </FormField>
            <FormField label="Blocker">
              <input
                className="app-input min-h-11 w-full px-3 text-sm"
                placeholder="What could stall this?"
                value={systemForm.blocker}
                onChange={(event) => setSystemForm({ ...systemForm, blocker: event.target.value })}
              />
            </FormField>
            <FormField label="Optional deadline">
              <input
                type="date"
                className="app-input min-h-11 w-full px-3 text-sm"
                value={systemForm.deadline}
                onChange={(event) =>
                  setSystemForm({ ...systemForm, deadline: event.target.value })
                }
              />
            </FormField>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={busy === "system"}
                className="app-btn-primary min-h-11 w-full px-4 text-sm disabled:opacity-60"
              >
                {busy === "system" ? "Saving…" : "Create system"}
              </button>
            </div>
          </form>
        ) : null}

        {data.systems.length > 0 ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {data.systems.map((system) => {
              const Icon = DOMAIN_ICONS[system.domain] ?? Target;
              const nextStatus = STATUS_ORDER[STATUS_ORDER.indexOf(system.status) + 1];
              return (
                <article key={system.id} className="rounded-2xl bg-[var(--card-solid)] p-4 ring-1 ring-[var(--card-border)]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 gap-2.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent-strong)]">
                        <Icon size={18} />
                      </span>
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-[var(--ink)]">{system.name}</h3>
                        <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                          {domainLabel(system.domain)}
                        </p>
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold capitalize ring-1 ${systemStatusClass(system.status)}`}>
                      {system.status}
                    </span>
                  </div>
                  <div className="mt-4">
                    <div className="flex justify-between text-[10px] font-semibold text-[var(--muted)]">
                      <span>Progress</span><span>{Math.round(system.progress)}%</span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--ink)_8%,transparent)]">
                      <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${system.progress}%` }} />
                    </div>
                  </div>
                  <dl className="mt-4 space-y-2 text-xs">
                    <SystemDetail label="Now" value={system.currentState} />
                    <SystemDetail label="Target" value={system.targetState} />
                    {system.nextAction ? <SystemDetail label="Next" value={system.nextAction} accent /> : null}
                    {system.blocker ? <SystemDetail label="Blocker" value={system.blocker} warning /> : null}
                    {system.deadline ? <SystemDetail label="Deadline" value={system.deadline} /> : null}
                  </dl>
                  <div className="mt-3 flex min-h-11 items-center justify-between gap-3 border-t border-[var(--card-border)] pt-3">
                    <span className="text-[10px] text-[var(--muted)]">
                      {system.history[0]
                        ? `Updated ${new Date(system.history[0].createdAt).toLocaleDateString()}`
                        : "No history yet"}
                    </span>
                    {nextStatus ? (
                      <button
                        type="button"
                        disabled={busy === `system:${system.id}`}
                        onClick={() => void advanceSystem(system)}
                        className="inline-flex min-h-10 items-center gap-1 px-2 text-xs font-semibold text-[var(--accent-strong)] disabled:opacity-60"
                      >
                        {busy === `system:${system.id}` ? <Loader2 size={13} className="animate-spin" /> : null}
                        Advance to {nextStatus}
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                        <CheckCircle2 size={14} /> Scaling
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState copy="Start with one system whose stability would free the most mental energy." />
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="app-card p-4 md:p-5">
          <SectionHeading
            eyebrow="Growth pipeline"
            title="Opportunities in motion"
            detail="Career, business, property, and relationship upside."
          />
          {data.pipeline.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {data.pipeline.slice(0, 5).map((opportunity) => (
                <li key={opportunity.id} className="rounded-2xl bg-[var(--card-solid)] p-3 ring-1 ring-[var(--card-border)]">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-[var(--ink)]">{opportunity.title}</p>
                    <span className="shrink-0 text-[10px] font-semibold uppercase text-[var(--muted)]">
                      {domainLabel(opportunity.domain)}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[var(--muted)]">
                    {opportunity.description}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState copy="No open opportunities yet. Capture the next real lead, conversation, or experiment in Growth." />
          )}
          <button
            type="button"
            onClick={onOpenGrowth}
            className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--accent-strong)]"
          >
            Manage pipeline <ArrowRight size={15} />
          </button>
        </div>

        <div className="app-card p-4 md:p-5">
          <SectionHeading
            eyebrow="Relationships"
            title="Connection equity"
            detail="Meaningful follow-through, not a raw contact count."
          />
          {data.relationshipsNeedingAttention.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {data.relationshipsNeedingAttention.map((contact) => (
                <li key={contact.id} className="flex min-h-14 items-center justify-between gap-3 rounded-2xl bg-[var(--card-solid)] px-3 ring-1 ring-[var(--card-border)]">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--ink)]">{contact.name}</p>
                    <p className="truncate text-[11px] text-[var(--muted)]">
                      {contact.suggestedNextAction ??
                        (contact.daysSinceContact == null
                          ? "Relationship needs a deliberate next step"
                          : `${contact.daysSinceContact} days since last touch`)}
                    </p>
                  </div>
                  <span className="shrink-0 text-[10px] font-semibold capitalize text-[var(--muted)]">
                    {contact.relationshipType ?? "contact"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState copy="No relationship follow-ups are currently overdue." />
          )}
          <button
            type="button"
            onClick={onOpenGrowth}
            className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--accent-strong)]"
          >
            Open relationships <ArrowRight size={15} />
          </button>
        </div>
      </section>

      <section className="app-card p-4 md:p-5">
        <div className="flex items-start justify-between gap-3">
          <SectionHeading
            eyebrow="Financial infrastructure"
            title="Quiet guardrails"
            detail="Reserve and debt health without turning purchases into the main story."
          />
          <button
            type="button"
            onClick={onOpenFinance}
            className="inline-flex min-h-11 shrink-0 items-center gap-1 text-xs font-semibold text-[var(--accent-strong)]"
          >
            Money <ArrowRight size={14} />
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <FinancialMetric label="Chase reserve" value={financialHealth.chaseReserve} />
          <FinancialMetric label="Capital One" value={financialHealth.capitalOneReserve} />
          <FinancialMetric label="Total cash" value={financialHealth.totalCash} />
          <FinancialMetric label="Card debt" value={financialHealth.creditDebt} inverse />
          <FinancialMetric label="Net position" value={financialHealth.netWorthProxy} />
        </div>
        <button
          type="button"
          onClick={onOpenGoals}
          className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--accent-strong)]"
        >
          Review capital milestones <ArrowRight size={15} />
        </button>
      </section>

      <section className="app-card p-4 md:p-5">
        <div className="flex items-start justify-between gap-3">
          <SectionHeading
            eyebrow="Recent wins"
            title="Evidence that progress happened"
            detail="Record meaningful accomplishments so they remain visible."
          />
          <button
            type="button"
            onClick={() => setShowWinForm((open) => !open)}
            className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl px-3 text-xs font-semibold text-[var(--accent-strong)] ring-1 ring-[var(--card-border)]"
          >
            <Plus size={14} /> Record
          </button>
        </div>
        {showWinForm ? (
          <form onSubmit={createWin} className="mt-4 grid gap-3 rounded-2xl bg-[var(--accent-soft)] p-3 sm:grid-cols-2">
            <FormField label="What happened?">
              <input
                required
                className="app-input min-h-11 w-full px-3 text-sm"
                placeholder="Had the promotion conversation"
                value={winForm.title}
                onChange={(event) => setWinForm({ ...winForm, title: event.target.value })}
              />
            </FormField>
            <FormField label="Area">
              <select
                className="app-input min-h-11 w-full px-3 text-sm"
                value={winForm.domain}
                onChange={(event) =>
                  setWinForm({ ...winForm, domain: event.target.value as Domain })
                }
              >
                {DOMAINS.map((domain) => (
                  <option key={domain} value={domain}>{domainLabel(domain)}</option>
                ))}
              </select>
            </FormField>
            <FormField label="What did it strengthen?">
              <input
                className="app-input min-h-11 w-full px-3 text-sm"
                placeholder="Optional impact or what this unlocks"
                value={winForm.impact}
                onChange={(event) => setWinForm({ ...winForm, impact: event.target.value })}
              />
            </FormField>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={busy === "win"}
                className="app-btn-primary min-h-11 w-full px-4 text-sm disabled:opacity-60"
              >
                {busy === "win" ? "Recording…" : "Save win"}
              </button>
            </div>
          </form>
        ) : null}
        {data.wins.length > 0 ? (
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {data.wins.slice(0, 8).map((win) => (
              <li key={win.id} className="flex gap-3 rounded-2xl bg-[var(--card-solid)] p-3 ring-1 ring-[var(--card-border)]">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/12 text-emerald-700">
                  <CheckCircle2 size={16} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--ink)]">{win.title}</p>
                  <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                    {domainLabel(win.domain)} · {win.date}
                  </p>
                  {win.impact ? <p className="mt-1 text-xs text-[var(--muted)]">{win.impact}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState copy="Your wins will collect here across weeks, months, and quarters." />
        )}
      </section>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  detail,
}: {
  eyebrow: string;
  title: string;
  detail: string;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--accent-strong)]">{eyebrow}</p>
      <h2 className="mt-1 text-lg font-semibold tracking-tight text-[var(--ink)]">{title}</h2>
      <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{detail}</p>
    </div>
  );
}

function PositionMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl bg-[color-mix(in_srgb,var(--card-solid)_88%,transparent)] p-3 ring-1 ring-[var(--card-border)]">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-[var(--ink)]">{value}</p>
      <p className="mt-0.5 text-[10px] text-[var(--muted)]">{detail}</p>
    </div>
  );
}

function FinancialMetric({ label, value, inverse = false }: { label: string; value: number; inverse?: boolean }) {
  const concerning = inverse ? value > 0 : value < 0;
  return (
    <div className="rounded-2xl bg-[var(--card-solid)] p-3 ring-1 ring-[var(--card-border)]">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <p className={`mt-1 text-sm font-semibold tabular-nums ${concerning ? "text-rose-700" : "text-[var(--ink)]"}`}>
        {formatCurrency(value)}
      </p>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-[11px] font-semibold text-[var(--ink-soft)]">{label}</span>
      {children}
    </label>
  );
}

function SystemDetail({
  label,
  value,
  accent = false,
  warning = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
  warning?: boolean;
}) {
  return (
    <div className="grid grid-cols-[3.5rem_1fr] gap-2">
      <dt className="font-semibold text-[var(--muted)]">{label}</dt>
      <dd className={warning ? "text-amber-700" : accent ? "font-semibold text-[var(--accent-strong)]" : "text-[var(--ink-soft)]"}>
        {value}
      </dd>
    </div>
  );
}

function EmptyState({ copy }: { copy: string }) {
  return (
    <div className="mt-3 rounded-2xl border border-dashed border-[var(--card-border)] p-4 text-sm leading-relaxed text-[var(--muted)]">
      {copy}
    </div>
  );
}
