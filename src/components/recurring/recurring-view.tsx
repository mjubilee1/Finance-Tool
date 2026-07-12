"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/format";
import type { ChargeReviewDisposition } from "@/lib/charge-review";
import {
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Repeat,
  Search,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

type RecurringTransaction = {
  id: string;
  date: string;
  amount: number;
  name: string;
  merchantName?: string | null;
  pending?: boolean;
  customCategory?: string | null;
  categoryPrimary?: string | null;
  accountName: string;
};

type RecurringPatternItem = {
  id: string;
  merchantName: string;
  normalizedName: string;
  category: string | null;
  averageAmount: number;
  frequency: string;
  direction: "income" | "expense";
  firstSeen: string;
  lastSeen: string;
  confidenceScore: number;
  occurrenceCount: number;
  monthlyImpact: number;
  reviewed: boolean;
  needsReview: boolean;
  cfoRecommendation: string | null;
  transactions: RecurringTransaction[];
};

type RecurringResponse = {
  patterns: RecurringPatternItem[];
  summary: {
    totalPatterns: number;
    expenseCount: number;
    incomeCount: number;
    needsReviewCount: number;
    monthlyExpenseTotal: number;
    monthlyIncomeTotal: number;
  };
};

type FilterType = "all" | "expense" | "income" | "review";

const DISPOSITION_OPTIONS: Array<{
  value: ChargeReviewDisposition;
  label: string;
  description: string;
}> = [
  { value: "expected", label: "Expected bill", description: "I know what this is — keep tracking it." },
  { value: "one_time", label: "One-time", description: "Not actually recurring." },
  { value: "not_concern", label: "Not a concern", description: "Reviewed and fine to keep." },
  { value: "will_cancel", label: "Will cancel", description: "Remind the Coach I'm cutting this." },
];

function fetchRecurring() {
  return fetch("/api/recurring").then(async (res) => {
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? "Failed to load recurring charges.");
    }
    return res.json() as Promise<RecurringResponse>;
  });
}

function frequencyLabel(frequency: string) {
  switch (frequency) {
    case "weekly":
      return "Weekly";
    case "bi-weekly":
      return "Bi-weekly";
    case "monthly":
      return "Monthly";
    default:
      return "Repeating";
  }
}

type Props = {
  onAskCfo: (prompt: string) => void;
  onViewTransactions: (merchant: string) => void;
};

export function RecurringView({ onAskCfo, onViewTransactions }: Props) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<FilterType>("review");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["recurring"],
    queryFn: fetchRecurring,
  });

  const filteredPatterns = useMemo(() => {
    const patterns = data?.patterns ?? [];
    const query = search.trim().toLowerCase();

    return patterns.filter((pattern) => {
      if (filter === "expense" && pattern.direction !== "expense") return false;
      if (filter === "income" && pattern.direction !== "income") return false;
      if (filter === "review" && !pattern.needsReview) return false;
      if (query && !pattern.merchantName.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [data?.patterns, filter, search]);

  const handleReview = async (
    pattern: RecurringPatternItem,
    disposition: ChargeReviewDisposition,
  ) => {
    const latest = pattern.transactions[0];
    if (!latest) return;

    setSavingId(pattern.id);
    try {
      const response = await fetch("/api/spending-alerts/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionId: latest.id,
          merchantLabel: pattern.merchantName,
          amount: Math.abs(latest.amount),
          date: latest.date,
          disposition,
          note: reviewNote,
        }),
      });

      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error ?? "Failed to save review.");
      }

      setReviewingId(null);
      setReviewNote("");
      await queryClient.invalidateQueries({ queryKey: ["recurring"] });
      await queryClient.invalidateQueries({ queryKey: ["spending-alerts"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to save review.");
    } finally {
      setSavingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="app-card p-8 animate-pulse">
          <div className="h-6 w-48 bg-slate-200 rounded mb-4" />
          <div className="h-24 bg-slate-100 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-card p-8 text-center text-rose-600">
        {error instanceof Error ? error.message : "Failed to load recurring charges."}
      </div>
    );
  }

  const summary = data?.summary;

  return (
    <div className="space-y-6">
      <div className="hidden md:block">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Recurring</h1>
        <p className="text-slate-500 mt-1">
          Dissect repeating charges, mark what is expected, and decide what to cut.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="app-card p-5">
          <p className="app-label text-rose-600 mb-1">Monthly out</p>
          <p className="text-2xl font-bold text-slate-900 tabular-nums">
            {formatCurrency(summary?.monthlyExpenseTotal ?? 0)}
          </p>
          <p className="text-xs text-slate-500 mt-1">{summary?.expenseCount ?? 0} expense patterns</p>
        </div>
        <div className="app-card p-5">
          <p className="app-label text-teal-700 mb-1">Monthly in</p>
          <p className="text-2xl font-bold text-slate-900 tabular-nums">
            {formatCurrency(summary?.monthlyIncomeTotal ?? 0)}
          </p>
          <p className="text-xs text-slate-500 mt-1">{summary?.incomeCount ?? 0} income patterns</p>
        </div>
        <div className="app-card p-5 ring-1 ring-amber-200/60 bg-amber-50/40">
          <p className="app-label text-amber-700 mb-1">Needs review</p>
          <p className="text-2xl font-bold text-slate-900 tabular-nums">{summary?.needsReviewCount ?? 0}</p>
          <p className="text-xs text-slate-500 mt-1">Unreviewed or flagged by Coach</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {([
            ["review", "Needs review"],
            ["expense", "Expenses"],
            ["income", "Income"],
            ["all", "All"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                filter === value
                  ? "bg-teal-600 text-white"
                  : "bg-white text-slate-600 ring-1 ring-slate-200/80 hover:bg-slate-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search merchant"
            className="w-full pl-9 pr-3 py-2.5 app-input text-sm"
          />
        </div>
      </div>

      {filteredPatterns.length === 0 ? (
        <div className="app-card p-10 text-center">
          <div className="w-12 h-12 rounded-2xl bg-teal-50 flex items-center justify-center mx-auto mb-4 ring-1 ring-teal-200/60">
            <Sparkles className="text-teal-600" size={22} />
          </div>
          <p className="font-semibold text-slate-900">No recurring patterns in this filter</p>
          <p className="text-sm text-slate-500 mt-2">
            Sync transactions and check back — repeating merchants will show up here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredPatterns.map((pattern) => {
            const expanded = expandedId === pattern.id;
            const reviewing = reviewingId === pattern.id;
            const latest = pattern.transactions[0];

            return (
              <div key={pattern.id} className="app-card overflow-hidden">
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ring-1 ${
                            pattern.direction === "income"
                              ? "bg-teal-50 text-teal-700 ring-teal-200/60"
                              : "bg-rose-50 text-rose-700 ring-rose-200/60"
                          }`}
                        >
                          {pattern.direction === "income" ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                          {pattern.direction}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                          {frequencyLabel(pattern.frequency)}
                        </span>
                        {pattern.reviewed ? (
                          <span className="rounded-full bg-teal-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-teal-700 ring-1 ring-teal-200/60">
                            Reviewed
                          </span>
                        ) : pattern.needsReview ? (
                          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700 ring-1 ring-amber-200/60">
                            Review
                          </span>
                        ) : null}
                      </div>

                      <h2 className="text-lg font-semibold text-slate-900 truncate">{pattern.merchantName}</h2>
                      <p className="text-sm text-slate-500 mt-1">
                        {pattern.occurrenceCount} charges · last seen {pattern.lastSeen}
                        {pattern.category ? ` · ${pattern.category}` : ""}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="text-xl font-bold text-slate-900 tabular-nums">
                        {formatCurrency(Math.abs(pattern.averageAmount))}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">avg / charge</p>
                      <p className="text-sm font-semibold text-slate-700 tabular-nums mt-2">
                        ~{formatCurrency(pattern.monthlyImpact)}/mo
                      </p>
                    </div>
                  </div>

                  {pattern.cfoRecommendation ? (
                    <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950 ring-1 ring-amber-200/60 leading-relaxed">
                      <span className="font-semibold">Coach note:</span> {pattern.cfoRecommendation}
                    </p>
                  ) : null}

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        onAskCfo(
                          `I'm reviewing my recurring charge for ${pattern.merchantName} (~${formatCurrency(Math.abs(pattern.averageAmount))}, ${pattern.frequency}). Should I keep paying this or cut it?`,
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 ring-1 ring-teal-200/60 transition-colors"
                    >
                      <HelpCircle size={15} />
                      Ask Coach
                    </button>
                    <button
                      type="button"
                      onClick={() => onViewTransactions(pattern.merchantName)}
                      className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 ring-1 ring-slate-200/60 transition-colors"
                    >
                      <Search size={15} />
                      All charges
                    </button>
                    {!pattern.reviewed && latest ? (
                      <button
                        type="button"
                        onClick={() => {
                          setReviewingId(reviewing ? null : pattern.id);
                          setReviewNote("");
                        }}
                        className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 ring-1 ring-slate-200/60 transition-colors"
                      >
                        <Repeat size={15} />
                        {reviewing ? "Close review" : "Mark reviewed"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? null : pattern.id)}
                      className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 ring-1 ring-slate-200/60 transition-colors ml-auto"
                    >
                      {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                      {expanded ? "Hide history" : "Dissect charges"}
                    </button>
                  </div>
                </div>

                {reviewing && latest ? (
                  <div className="px-5 pb-5 border-t border-slate-100 bg-slate-50/70">
                    <p className="pt-4 text-sm font-semibold text-slate-900 mb-3">
                      How should your Coach treat {pattern.merchantName}?
                    </p>
                    <div className="grid sm:grid-cols-2 gap-2 mb-3">
                      {DISPOSITION_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          disabled={savingId === pattern.id}
                          onClick={() => void handleReview(pattern, option.value)}
                          className="rounded-xl bg-white px-3 py-3 text-left ring-1 ring-slate-200/80 hover:ring-teal-200 hover:bg-teal-50/40 transition-colors disabled:opacity-60"
                        >
                          <p className="text-sm font-semibold text-slate-900">{option.label}</p>
                          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{option.description}</p>
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      value={reviewNote}
                      onChange={(event) => setReviewNote(event.target.value)}
                      placeholder="Optional note (e.g. gym membership, tenant rent)"
                      className="w-full app-input px-3 py-2 text-sm"
                    />
                  </div>
                ) : null}

                {expanded ? (
                  <div className="border-t border-slate-100">
                    <ul className="divide-y divide-slate-100">
                      {pattern.transactions.map((transaction) => (
                        <li key={transaction.id} className="px-5 py-4 flex items-center justify-between gap-4">
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900 truncate">{transaction.name}</p>
                            <p className="text-xs text-slate-500 mt-1">
                              {transaction.date} · {transaction.accountName}
                              {transaction.customCategory ? ` · ${transaction.customCategory}` : ""}
                              {transaction.pending ? " · Pending" : ""}
                            </p>
                          </div>
                          <p
                            className={`font-semibold tabular-nums shrink-0 ${
                              transaction.amount > 0 ? "text-slate-900" : "text-teal-600"
                            }`}
                          >
                            {formatCurrency(Math.abs(transaction.amount))}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
