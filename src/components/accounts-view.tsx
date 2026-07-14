"use client";

import { useMemo, useState } from "react";
import { DateTime } from "luxon";
import { formatCurrency } from "@/lib/format";
import type { BalanceRefreshMeta } from "@/lib/plaid-balances";
import {
  groupAccountsByInstitution,
  summarizeAccountBuckets,
  type FocusAccount,
} from "@/lib/account-focus";
import {
  calculateCreditUtilization,
  summarizeCreditCards,
} from "@/lib/credit-utilization";
import { ConnectBankButton } from "./connect-bank-button";
import {
  Star,
  Receipt,
  Building2,
  Wallet,
  TrendingDown,
  TrendingUp,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

function utilizationBarClass(status: string) {
  if (status === "maxed" || status === "high") return "bg-rose-500";
  if (status === "elevated") return "bg-amber-400";
  if (status === "ok") return "bg-teal-500";
  return "bg-slate-300";
}

type Props = {
  accounts: FocusAccount[];
  onViewTransactions: (plaidAccountId: string) => void;
  onBankLinked?: () => void;
  onRefreshBalances?: () => void | Promise<void>;
  isRefreshingBalances?: boolean;
  balanceMeta?: BalanceRefreshMeta | null;
};

type FilterTab = "primary" | "cash" | "debt" | "all";

const accountNoticeClass =
  "rounded-xl bg-[color-mix(in_srgb,var(--warn)_16%,var(--card-solid))] px-4 py-3 ring-1 ring-[color-mix(in_srgb,var(--warn)_42%,transparent)] text-sm font-medium text-[var(--ink)] leading-relaxed";

function accountKindLabel(type: string) {
  if (type === "credit" || type === "loan") return "Debt";
  if (type === "depository") return "Cash";
  if (type === "investment") return "Investment";
  return "Other";
}

function accountKindStyles(type: string) {
  if (type === "credit" || type === "loan") {
    return {
      badge: "bg-rose-50 text-rose-700 ring-rose-200/60",
      balance: "text-rose-600",
      row: "ring-rose-200/40",
    };
  }
  if (type === "depository") {
    return {
      badge: "bg-teal-50 text-teal-700 ring-teal-200/60",
      balance: "text-teal-700",
      row: "ring-teal-200/40",
    };
  }
  return {
    badge: "bg-slate-100 text-slate-600",
    balance: "text-slate-900",
    row: "ring-slate-200/60",
  };
}

function displayAccountBalance(account: FocusAccount) {
  const current = account.currentBalance ?? 0;
  const available = account.availableBalance;

  if (account.type === "depository") {
    const spendable = available ?? current;
    return {
      amount: spendable,
      sublabel:
        available != null && Math.abs(available - current) > 0.5
          ? `${formatCurrency(current)} ledger (ignore for decisions)`
          : "Spendable",
    };
  }

  return { amount: current, sublabel: null as string | null };
}

function formatBalanceUpdatedAt(updatedAt?: string | Date | null) {
  if (!updatedAt) return "Unknown";
  const iso = typeof updatedAt === "string" ? updatedAt : updatedAt.toISOString();
  const dt = DateTime.fromISO(iso);
  if (!dt.isValid) return "Unknown";
  return dt.toRelative({ style: "short" }) ?? dt.toLocaleString(DateTime.DATETIME_MED);
}

export function AccountsView({
  accounts,
  onViewTransactions,
  onBankLinked,
  onRefreshBalances,
  isRefreshingBalances = false,
  balanceMeta,
}: Props) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<FilterTab>("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [editingCreditId, setEditingCreditId] = useState<string | null>(null);
  const [savingCreditId, setSavingCreditId] = useState<string | null>(null);
  const [creditForm, setCreditForm] = useState({
    creditLimit: "",
    aprPercent: "",
    minimumPayment: "",
    dueDay: "",
    statementDay: "",
  });

  const summary = useMemo(() => summarizeAccountBuckets(accounts), [accounts]);
  const creditSummary = useMemo(() => summarizeCreditCards(accounts), [accounts]);
  const oldestUpdate = useMemo(() => {
    const timestamps = accounts
      .map((account) => account.updatedAt)
      .filter(Boolean)
      .map((value) => DateTime.fromISO(value as string).toMillis())
      .filter((value) => !Number.isNaN(value));

    if (timestamps.length === 0) return null;
    return DateTime.fromMillis(Math.min(...timestamps));
  }, [accounts]);

  const filteredAccounts = useMemo(() => {
    switch (filter) {
      case "primary":
        return summary.usingPrimaryFilter
          ? accounts.filter((account) => account.isPrimary)
          : accounts.filter((account) => account.type === "depository");
      case "cash":
        return accounts.filter((account) => account.type === "depository" || account.type === "investment");
      case "debt":
        return accounts.filter((account) => account.type === "credit" || account.type === "loan");
      default:
        return accounts;
    }
  }, [accounts, filter, summary.usingPrimaryFilter]);

  const grouped = useMemo(() => groupAccountsByInstitution(filteredAccounts), [filteredAccounts]);

  const togglePrimary = async (account: FocusAccount) => {
    if (!account.id) return;
    setUpdatingId(account.id);
    try {
      const res = await fetch("/api/accounts/primary", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: account.id, isPrimary: !account.isPrimary }),
      });
      if (!res.ok) {
        throw new Error("Failed to update");
      }
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (error) {
      console.error(error);
    } finally {
      setUpdatingId(null);
    }
  };

  const openCreditEditor = (account: FocusAccount) => {
    if (!account.id) return;
    setEditingCreditId(account.id);
    setCreditForm({
      creditLimit: account.creditLimit != null ? String(account.creditLimit) : "",
      aprPercent: account.aprPercent != null ? String(account.aprPercent) : "",
      minimumPayment: account.minimumPayment != null ? String(account.minimumPayment) : "",
      dueDay: account.dueDay != null ? String(account.dueDay) : "",
      statementDay: account.statementDay != null ? String(account.statementDay) : "",
    });
  };

  const saveCreditDetails = async (accountId: string) => {
    setSavingCreditId(accountId);
    try {
      const res = await fetch("/api/accounts/credit-details", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          creditLimit: creditForm.creditLimit,
          aprPercent: creditForm.aprPercent,
          minimumPayment: creditForm.minimumPayment,
          dueDay: creditForm.dueDay,
          statementDay: creditForm.statementDay,
        }),
      });
      if (res.ok) {
        setEditingCreditId(null);
        await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      } else {
        const data = await res.json().catch(() => null);
        alert(data?.error || "Failed to save credit details");
      }
    } finally {
      setSavingCreditId(null);
    }
  };

  if (accounts.length === 0) {
    return (
      <div className="app-card p-8 text-center">
        <p className="text-slate-500 mb-4">No accounts linked yet.</p>
        <ConnectBankButton onLinked={onBankLinked} />
      </div>
    );
  }

  const tabs: { id: FilterTab; label: string }[] = [
    { id: "all", label: "All" },
    { id: "primary", label: summary.usingPrimaryFilter ? "Primary" : "Cash (pick primary)" },
    { id: "cash", label: "Cash & invest" },
    { id: "debt", label: "Debt" },
  ];

  return (
    <div className="space-y-5">
      <div className="hidden md:flex md:items-start md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Connected accounts</h1>
          <p className="text-slate-500 mt-1 text-sm leading-relaxed">
            Star the accounts that drive your daily cash flow — checking, main savings, and cards you actively use.
            Overview and safe spend use primary accounts when any are selected.
          </p>
        </div>
        {onRefreshBalances ? (
          <button
            type="button"
            onClick={() => onRefreshBalances()}
            disabled={isRefreshingBalances}
            className="inline-flex items-center gap-2 shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold app-card hover:bg-white disabled:opacity-60"
          >
            <RefreshCw size={16} className={isRefreshingBalances ? "animate-spin" : ""} />
            Refresh balances
          </button>
        ) : null}
      </div>

      {(balanceMeta?.usedCachedBalances || (oldestUpdate && oldestUpdate < DateTime.now().minus({ hours: 2 }))) && (
        <div className={accountNoticeClass}>
          {balanceMeta?.usedCachedBalances && (balanceMeta.balanceCallLimit ?? 0) > 0
            ? `Daily Plaid balance limit reached (${balanceMeta.balanceCallsToday}/${balanceMeta.balanceCallLimit}). Amounts may be outdated — tap Refresh balances after midnight UTC, or use the header Refresh button.`
            : balanceMeta?.usedCachedBalances
              ? "Could not reach your bank just now — showing last saved balances. Tap Refresh balances to try again."
              : `Balances last updated ${formatBalanceUpdatedAt(oldestUpdate?.toISO() ?? undefined)}. Tap Refresh balances to pull the latest from your bank.`}
        </div>
      )}

      {!summary.usingPrimaryFilter && (
        <div className={accountNoticeClass}>
          No primary accounts yet. Tap the star on the accounts you care about for cash flow (usually your main checking).
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="app-card p-4 ring-2 ring-teal-200/50">
          <div className="flex items-center gap-2 mb-1">
            <Wallet size={16} className="text-teal-600" />
            <p className="app-label text-teal-700">Spendable cash</p>
          </div>
          <p className="text-2xl font-bold text-slate-900 tabular-nums">{formatCurrency(summary.primaryCash)}</p>
          <p className="text-xs text-slate-500 mt-1">
            Available balance — not ledger/current
          </p>
        </div>
        <div className="app-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Star size={16} className="text-amber-500" />
            <p className="app-label">Primary set</p>
          </div>
          <p className="text-2xl font-bold text-slate-900 tabular-nums">{summary.primaryAccountCount}</p>
          <p className="text-xs text-slate-500 mt-1">Starred for cash flow</p>
        </div>
        <div className="app-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={16} className="text-teal-600" />
            <p className="app-label">Assets</p>
          </div>
          <p className="text-2xl font-bold text-slate-900 tabular-nums">{formatCurrency(summary.totalAssets)}</p>
        </div>
        <div className="app-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown size={16} className="text-rose-500" />
            <p className="app-label">Debt</p>
          </div>
          <p className="text-2xl font-bold text-rose-600 tabular-nums">{formatCurrency(summary.totalLiabilities)}</p>
          {creditSummary.overallUtilizationPct != null ? (
            <p className="text-xs text-slate-500 mt-1">
              Cards ~{Math.round(creditSummary.overallUtilizationPct)}% used
            </p>
          ) : creditSummary.cards.length > 0 ? (
            <p className="text-xs text-amber-700 mt-1">Add limits to see utilization</p>
          ) : null}
        </div>
      </div>

      {creditSummary.cards.length > 0 ? (
        <div className="app-card p-4 space-y-3">
          <div>
            <p className="app-label mb-1">Credit cards</p>
            <p className="text-sm text-slate-600 leading-relaxed">
              Plaid shows the balance. Add each card&apos;s limit + APR so you can see how close you are to
              maxing out and which rate to pay down first.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {creditSummary.cards.map((card) => (
              <div key={card.id ?? card.name} className="rounded-xl bg-slate-50/80 p-3 ring-1 ring-slate-200/50">
                <div className="flex justify-between gap-2 mb-1">
                  <p className="font-semibold text-slate-900 text-sm truncate">{card.name}</p>
                  <p className="text-xs font-bold text-slate-600 shrink-0">{card.statusLabel}</p>
                </div>
                <p className="text-sm tabular-nums text-slate-700">
                  {formatCurrency(card.balance)}
                  {card.creditLimit != null ? ` / ${formatCurrency(card.creditLimit)}` : " · no limit set"}
                  {card.aprPercent != null ? ` · ${card.aprPercent}% APR` : ""}
                </p>
                {card.utilizationPct != null ? (
                  <div className="mt-2">
                    <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${utilizationBarClass(card.status)}`}
                        style={{ width: `${Math.min(100, card.utilizationPct)}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 tabular-nums">
                      {Math.round(card.utilizationPct)}% used
                      {card.remainingCredit != null
                        ? ` · ${formatCurrency(card.remainingCredit)} room left`
                        : ""}
                    </p>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilter(tab.id)}
            className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition ring-1 ${
              filter === tab.id
                ? "bg-teal-600 text-white ring-teal-600"
                : "bg-white text-slate-600 ring-slate-200/60 hover:bg-slate-50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {grouped.map(([institution, institutionAccounts]) => (
          <section key={institution} className="app-card overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 bg-slate-50/80 border-b border-slate-100">
              <Building2 size={16} className="text-slate-400" />
              <h2 className="font-semibold text-slate-900 text-sm">{institution}</h2>
              <span className="text-xs text-slate-400 ml-auto">{institutionAccounts.length} accounts</span>
            </div>

            <ul className="divide-y divide-slate-100">
              {institutionAccounts.map((account) => {
                const styles = accountKindStyles(account.type);
                const isUpdating = updatingId === account.id;
                const balance = displayAccountBalance(account);
                const credit =
                  account.type === "credit" ? calculateCreditUtilization(account) : null;
                const isEditing = Boolean(account.id && editingCreditId === account.id);

                return (
                  <li
                    key={account.plaidAccountId}
                    className={`px-4 py-4 flex flex-col gap-3 ring-inset ${styles.row}`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <button
                          type="button"
                          onClick={() => togglePrimary(account)}
                          disabled={isUpdating || !account.id}
                          className={`mt-0.5 shrink-0 p-1.5 rounded-lg transition ${
                            account.isPrimary
                              ? "bg-amber-50 text-amber-500 ring-1 ring-amber-200/60"
                              : "text-slate-300 hover:text-amber-400 hover:bg-slate-50"
                          }`}
                          title={account.isPrimary ? "Remove from primary" : "Mark as primary for cash flow"}
                        >
                          <Star size={18} className={account.isPrimary ? "fill-current" : ""} />
                        </button>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-slate-900 truncate">{account.name}</p>
                            <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-md ring-1 ${styles.badge}`}>
                              {accountKindLabel(account.type)}
                            </span>
                            {account.isPrimary && (
                              <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 ring-1 ring-amber-200/60">
                                Primary
                              </span>
                            )}
                            {credit?.utilizationPct != null ? (
                              <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                                {Math.round(credit.utilizationPct)}% used
                              </span>
                            ) : null}
                          </div>
                          <p className="text-sm text-slate-500 mt-0.5">
                            {[account.subtype?.replace(/_/g, " "), account.mask ? `•••• ${account.mask}` : null]
                              .filter(Boolean)
                              .join(" · ")}
                            {credit?.aprPercent != null ? ` · ${credit.aprPercent}% APR` : ""}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-4 pl-10 sm:pl-0">
                        <div className="text-right">
                          <p className={`text-xl font-bold tabular-nums tracking-tight ${styles.balance}`}>
                            {formatCurrency(balance.amount)}
                          </p>
                          {balance.sublabel ? (
                            <p className="text-[11px] text-slate-500 mt-0.5">{balance.sublabel}</p>
                          ) : null}
                          {account.updatedAt ? (
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              Updated {formatBalanceUpdatedAt(account.updatedAt)}
                            </p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => onViewTransactions(account.plaidAccountId)}
                          className="flex items-center gap-1.5 text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 px-3 py-2 rounded-lg ring-1 ring-teal-200/60 transition shrink-0"
                        >
                          <Receipt size={14} />
                          Transactions
                        </button>
                      </div>
                    </div>

                    {account.type === "credit" && account.id ? (
                      <div className="pl-10 sm:pl-11">
                        <button
                          type="button"
                          onClick={() =>
                            isEditing ? setEditingCreditId(null) : openCreditEditor(account)
                          }
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
                        >
                          {isEditing ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          {credit?.creditLimit != null || credit?.aprPercent != null
                            ? "Edit limit / APR / due date"
                            : "Add limit, APR, minimum, due date"}
                        </button>

                        {isEditing ? (
                          <div className="mt-3 grid sm:grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200/60">
                            <div>
                              <label className="app-label block mb-1">Credit limit ($)</label>
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={creditForm.creditLimit}
                                onChange={(e) =>
                                  setCreditForm({ ...creditForm, creditLimit: e.target.value })
                                }
                                className="app-input w-full px-3 py-2 text-sm"
                                placeholder="5000"
                              />
                            </div>
                            <div>
                              <label className="app-label block mb-1">APR (%)</label>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={creditForm.aprPercent}
                                onChange={(e) =>
                                  setCreditForm({ ...creditForm, aprPercent: e.target.value })
                                }
                                className="app-input w-full px-3 py-2 text-sm"
                                placeholder="24.99"
                              />
                            </div>
                            <div>
                              <label className="app-label block mb-1">Minimum payment ($)</label>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={creditForm.minimumPayment}
                                onChange={(e) =>
                                  setCreditForm({ ...creditForm, minimumPayment: e.target.value })
                                }
                                className="app-input w-full px-3 py-2 text-sm"
                                placeholder="75"
                              />
                            </div>
                            <div>
                              <label className="app-label block mb-1">Due day (1–31)</label>
                              <input
                                type="number"
                                min="1"
                                max="31"
                                value={creditForm.dueDay}
                                onChange={(e) =>
                                  setCreditForm({ ...creditForm, dueDay: e.target.value })
                                }
                                className="app-input w-full px-3 py-2 text-sm"
                                placeholder="15"
                              />
                            </div>
                            <div>
                              <label className="app-label block mb-1">Statement day (optional)</label>
                              <input
                                type="number"
                                min="1"
                                max="31"
                                value={creditForm.statementDay}
                                onChange={(e) =>
                                  setCreditForm({ ...creditForm, statementDay: e.target.value })
                                }
                                className="app-input w-full px-3 py-2 text-sm"
                                placeholder="5"
                              />
                            </div>
                            <div className="flex items-end gap-2">
                              <button
                                type="button"
                                onClick={() => setEditingCreditId(null)}
                                className="px-3 py-2 text-sm text-slate-600 hover:bg-white rounded-lg"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                disabled={savingCreditId === account.id}
                                onClick={() => saveCreditDetails(account.id!)}
                                className="inline-flex items-center gap-2 app-btn-primary px-3 py-2 text-sm disabled:opacity-50"
                              >
                                {savingCreditId === account.id ? (
                                  <Loader2 size={14} className="animate-spin" />
                                ) : null}
                                Save
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <div className="app-card p-4">
        <ConnectBankButton onLinked={onBankLinked} className="w-full sm:w-auto" />
      </div>
    </div>
  );
}
