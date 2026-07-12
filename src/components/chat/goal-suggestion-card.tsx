"use client";

import { useState } from "react";
import { formatCurrency } from "@/lib/format";
import { goalTypeLabel, isLifeGoalType, LIFE_GOAL_PROGRESS_TARGET } from "@/lib/goal-types";
import type { GoalSuggestion } from "@/lib/goal-suggestion";
import { Loader2, Target } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

type Props = {
  suggestion: GoalSuggestion;
  onResolved?: (accepted: boolean) => void;
};

type ListedGoal = { id: string; name: string };

function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Exact name match only — never patch the wrong goal via fuzzy includes. */
function namesAlign(goalName: string, suggestion: GoalSuggestion) {
  const goal = normalizeName(goalName);
  const candidates = [suggestion.matchName, suggestion.name]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map(normalizeName);
  return candidates.some((candidate) => candidate === goal);
}

async function listActiveGoals(): Promise<ListedGoal[]> {
  const listRes = await fetch("/api/goals");
  const listData = await listRes.json().catch(() => null);
  return Array.isArray(listData?.goals) ? listData.goals : [];
}

async function findMatchingGoalId(suggestion: GoalSuggestion): Promise<string | null> {
  const goals = await listActiveGoals();

  if (suggestion.goalId) {
    const byId = goals.find((goal) => goal.id === suggestion.goalId);
    // Only trust goalId when the name also lines up — stale/wrong ids must not overwrite other goals.
    if (byId && namesAlign(byId.name, suggestion)) {
      return byId.id;
    }
  }

  const exact = goals.find((goal) => namesAlign(goal.name, suggestion));
  return exact?.id ?? null;
}

export function GoalSuggestionCard({ suggestion, onResolved }: Props) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<"idle" | "saving" | "accepted" | "dismissed">("idle");
  const [didCreate, setDidCreate] = useState(false);
  const life = isLifeGoalType(suggestion.type);
  const wantsUpdate = suggestion.action === "update";

  const createGoal = async () => {
    const seed = suggestion.addAmount ?? suggestion.monthlyRedirect ?? 0;
    const res = await fetch("/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: suggestion.name,
        type: suggestion.type,
        priority: String(suggestion.priority ?? 2),
        targetDate: suggestion.targetDate ?? "",
        targetAmount: life
          ? LIFE_GOAL_PROGRESS_TARGET
          : suggestion.targetAmount ?? suggestion.monthlyRedirect ?? 100,
        currentAmount: life ? 0 : seed,
        monthlyContribution: suggestion.monthlyRedirect ?? null,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error || "Could not create goal");
    }
  };

  const handleAccept = async () => {
    setStatus("saving");
    try {
      let created = !wantsUpdate;

      if (wantsUpdate) {
        const goalId = await findMatchingGoalId(suggestion);
        if (goalId) {
          // Only bump progress / monthly plan — never rewrite another goal's target.
          const patchBody: Record<string, unknown> = { id: goalId };
          if (suggestion.addAmount) patchBody.addAmount = suggestion.addAmount;
          if (suggestion.monthlyRedirect != null) {
            patchBody.monthlyContribution = suggestion.monthlyRedirect;
          }

          const res = await fetch("/api/goals", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patchBody),
          });
          if (res.status === 404) {
            await createGoal();
            created = true;
          } else if (!res.ok) {
            const data = await res.json().catch(() => null);
            alert(data?.error || "Could not update goal");
            setStatus("idle");
            return;
          }
        } else {
          // Goal was deleted (or never existed) — recreate instead of erroring.
          await createGoal();
          created = true;
        }
      } else {
        await createGoal();
      }

      setDidCreate(created);
      setStatus("accepted");
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["growth-dashboard"] });
      onResolved?.(true);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not save goal");
      setStatus("idle");
    }
  };

  if (status === "accepted") {
    return (
      <div className="mt-3 rounded-2xl bg-teal-500/15 p-4 ring-1 ring-teal-400/35 text-sm text-[var(--ink)]">
        {didCreate ? "Goal saved — track it under Goals." : "Goal updated."}
      </div>
    );
  }

  if (status === "dismissed") {
    return (
      <div className="mt-3 rounded-2xl bg-[color-mix(in_srgb,var(--ink)_6%,transparent)] p-3 ring-1 ring-[var(--card-border)] text-xs text-[var(--muted)]">
        Okay — skipped.
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-2xl bg-[var(--accent-soft)] p-4 ring-1 ring-[color-mix(in_srgb,var(--accent)_30%,transparent)]">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-[var(--card-solid)] ring-1 ring-[var(--card-border)] flex items-center justify-center shrink-0">
          <Target size={16} className="text-[var(--accent-strong)]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="app-label text-[var(--accent-strong)] mb-1">
            {wantsUpdate ? "Update goal" : "Goal idea"}
          </p>
          <p className="font-semibold text-[var(--ink)]">{suggestion.name}</p>
          <p className="text-xs text-[var(--muted)] mt-0.5">{goalTypeLabel(suggestion.type)}</p>
          <p className="text-sm text-[var(--ink-soft)] leading-relaxed mt-2">{suggestion.reason}</p>
          {!life &&
          (suggestion.targetAmount || suggestion.monthlyRedirect || suggestion.addAmount) ? (
            <p className="text-xs tabular-nums text-[var(--ink)] mt-2">
              {suggestion.addAmount ? `Add ${formatCurrency(suggestion.addAmount)}` : null}
              {suggestion.addAmount && suggestion.monthlyRedirect ? " · " : ""}
              {suggestion.monthlyRedirect
                ? `${formatCurrency(suggestion.monthlyRedirect)}/mo plan`
                : null}
              {(suggestion.addAmount || suggestion.monthlyRedirect) && suggestion.targetAmount
                ? " · "
                : ""}
              {suggestion.targetAmount ? `Target ${formatCurrency(suggestion.targetAmount)}` : null}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2 mt-3">
            <button
              type="button"
              disabled={status === "saving"}
              onClick={handleAccept}
              className="inline-flex items-center gap-2 app-btn-primary px-3 py-2 text-xs disabled:opacity-50"
            >
              {status === "saving" ? <Loader2 size={14} className="animate-spin" /> : null}
              {wantsUpdate ? "Yes, update goal" : "Yes, create goal"}
            </button>
            <button
              type="button"
              disabled={status === "saving"}
              onClick={() => {
                setStatus("dismissed");
                onResolved?.(false);
              }}
              className="px-3 py-2 text-xs font-semibold text-[var(--ink-soft)] hover:text-[var(--ink)] rounded-lg"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
