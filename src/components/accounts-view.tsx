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
import { ConnectBankButton } from "./connect-bank-button";
import { Star, Receipt, Building2, Wallet, TrendingDown, TrendingUp, RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

type Props = {
  accounts: FocusAccount[];
  onViewTransactions: (plaidAccountId: string) => void;
  onBankLinked?: () => void;
  onRefreshBalances?: () => void | Promise<void>;
  isRefreshingBalances?: boolean;
  balanceMeta?: BalanceRefreshMeta | null;
};

type FilterTab = "primary" | "cash" | "debt" | "all";

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
  const [filter, setFilter] = useState<FilterTab>("primary");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const summary = useMemo(() => summarizeAccountBuckets(accounts), [accounts]);
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

  if (accounts.length === 0) {
    return (
      <div className="app-card p-8 text-center">
        <p className="text-slate-500 mb-4">No accounts linked yet.</p>
        <ConnectBankButton onLinked={onBankLinked} />
      </div>
    );
  }

  const tabs: { id: FilterTab; label: string }[] = [
    { id: "primary", label: summary.usingPrimaryFilter ? "Primary" : "Cash (pick primary)" },
    { id: "all", label: "All" },
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
        <div className="rounded-xl bg-amber-50/80 px-4 py-3 ring-1 ring-amber-200/60 text-sm text-amber-950 leading-relaxed">
          {balanceMeta?.usedCachedBalances && (balanceMeta.balanceCallLimit ?? 0) > 0
            ? `Daily Plaid balance limit reached (${balanceMeta.balanceCallsToday}/${balanceMeta.balanceCallLimit}). Amounts may be outdated — tap Refresh balances after midnight UTC, or use the header Refresh button.`
            : balanceMeta?.usedCachedBalances
              ? "Could not reach your bank just now — showing last saved balances. Tap Refresh balances to try again."
              : `Balances last updated ${formatBalanceUpdatedAt(oldestUpdate?.toISO() ?? undefined)}. Tap Refresh balances to pull the latest from your bank.`}
        </div>
      )}

      {!summary.usingPrimaryFilter && (
        <div className="rounded-xl bg-amber-50/80 px-4 py-3 ring-1 ring-amber-200/60 text-sm text-amber-950 leading-relaxed">
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
        </div>
      </div>

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

                return (
                  <li
                    key={account.plaidAccountId}
                    className={`px-4 py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 ring-inset ${styles.row}`}
                  >
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
                        </div>
                        <p className="text-sm text-slate-500 mt-0.5">
                          {[account.subtype?.replace(/_/g, " "), account.mask ? `•••• ${account.mask}` : null]
                            .filter(Boolean)
                            .join(" · ")}
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
