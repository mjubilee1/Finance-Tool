"use client";

import { formatCurrency } from "@/lib/format";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownUp, Search, BrainCircuit, LayoutDashboard, Wallet, Receipt, TrendingUp, Menu, X, RefreshCw, type LucideIcon } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ConnectBankButton } from "./connect-bank-button";
import { PlaidOAuthHandler } from "./plaid-oauth-handler";
import { Projections } from "./projections";
import { ChatInterface } from "./chat-interface";
import { GoalsView } from "./goals-view";
import { OverviewHome } from "./overview/overview-home";
import { AccountsView } from "./accounts-view";
import { DashboardSkeleton } from "./dashboard-skeleton";
import { calculateGoalPace } from "@/lib/cash-flow";
import { sumDepositoryCash } from "@/lib/account-focus";
import { getSyncFeedback, postPlaidSync, syncFeedbackClassName, type SyncFeedbackTone } from "@/lib/sync-messages";
import { Target } from "lucide-react";

type TabType = 'chat' | 'overview' | 'accounts' | 'transactions' | 'projections' | 'goals';

type DashboardAccount = {
  id: string;
  plaidAccountId: string;
  plaidItemId?: string;
  name: string;
  type: string;
  subtype?: string | null;
  mask?: string | null;
  currentBalance?: number | null;
  availableBalance?: number | null;
  isPrimary?: boolean;
  institutionName?: string | null;
};

type DashboardTransaction = {
  id: string;
  accountId: string;
  date: string;
  name: string;
  merchantName?: string | null;
  amount: number;
  categoryPrimary?: string | null;
  isTenantPaymentCandidate?: boolean;
};

type RecommendedAction = {
  title: string;
  reason: string;
};

type RecurringReview = {
  merchant: string;
  averageAmount: number;
  frequency: string;
  recommendation: string;
};

type CfoBrief = {
  status?: string;
  cashSafety?: string;
  upcomingBills?: string[];
  incomeExpected?: string[];
  safeSpendToday?: number;
  safeSpendTodayReason?: string;
  debtMove?: string;
  spendingWarning?: string;
  todaysMove?: string;
};

type DashboardInsight = {
  cfoBrief?: CfoBrief;
  dailySummary?: string;
  financialHealthScore?: number;
  recommendedActions?: RecommendedAction[];
  recurringTransactionsToReview?: RecurringReview[];
};

type BriefRefresh = {
  status: "created" | "updated" | "fresh" | "no_transactions";
  refreshHours: number;
  lastUpdatedAt: string | null;
  nextRefreshAt: string | null;
};

type CashFlowData = {
  today: {
    spentToday: number;
    incomeToday: number;
    dailyAllowance: number;
    remainingToday: number;
    spentPercent: number;
  };
  weekly: {
    days: Array<{
      date: string;
      label: string;
      spent: number;
      income: number;
      net: number;
      isToday: boolean;
      isFuture: boolean;
    }>;
    weekSpent: number;
    weekIncome: number;
    weekNet: number;
    weeklyBudget: number;
    budgetToDate: number;
    budgetUsedPercent: number;
    paceStatus: "ahead" | "on_track" | "behind" | "at_risk";
    paceMessage: string;
  };
  netDailyAverage: number;
  safeDailySpend: number;
};

type DashboardGoal = {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate?: string | null;
  priority?: number;
  category?: string;
};

type DashboardData = {
  transactions: DashboardTransaction[];
  snapshots: Array<Record<string, unknown>>;
  aiInsight: DashboardInsight | null;
  accounts: DashboardAccount[];
  goals: DashboardGoal[];
  briefRefresh: BriefRefresh | null;
  cashFlow?: CashFlowData;
  plaidUsage?: {
    balanceRefreshesToday: number;
    dailyBalanceCallLimit: number;
  };
};

function fetchDashboard() {
  return fetch("/api/dashboard").then(async (res) => {
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? "Failed to load dashboard.");
    }
    return res.json() as Promise<DashboardData>;
  });
}

export function Dashboard() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session, status } = useSession();
  
  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["dashboard"],
    queryFn: fetchDashboard,
    enabled: status === "authenticated",
  });

  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const briefRefreshTriggered = useRef(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"date" | "amount_desc" | "amount_asc">("amount_desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [actionStatuses, setActionStatuses] = useState<Record<string, 'idle' | 'loading' | 'sent'>>({});
  const [syncStatus, setSyncStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [syncFeedback, setSyncFeedback] = useState<{ tone: SyncFeedbackTone; message: string } | null>(null);
  const itemsPerPage = 10;

  const handleTakeAction = async (sub: RecurringReview) => {
    setActionStatuses(prev => ({ ...prev, [sub.merchant]: 'loading' }));
    try {
      const res = await fetch("/api/action/remind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchant: sub.merchant,
          amount: sub.averageAmount,
          frequency: sub.frequency
        })
      });
      if (res.ok) {
        setActionStatuses(prev => ({ ...prev, [sub.merchant]: 'sent' }));
      } else {
        setActionStatuses(prev => ({ ...prev, [sub.merchant]: 'idle' }));
        alert("Failed to send reminder.");
      }
    } catch {
      setActionStatuses(prev => ({ ...prev, [sub.merchant]: 'idle' }));
      alert("Failed to send reminder.");
    }
  };

  const handleRefreshData = async () => {
    await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    await refetch();
  };

  const handleRefreshAll = async () => {
    setIsRefreshing(true);
    setSyncStatus('loading');
    setSyncFeedback(null);

    try {
      const syncData = await postPlaidSync(true);
      const feedback = getSyncFeedback(syncData);
      if (feedback) {
        setSyncFeedback(feedback);
      }
      setSyncStatus('success');

      await fetch("/api/dashboard/refresh-brief", { method: "POST" }).catch(() => {});
      await handleRefreshData();
    } catch (err) {
      console.error(err);
      setSyncStatus('error');
      setSyncFeedback({
        tone: "error",
        message: err instanceof Error ? err.message : "Failed to refresh data.",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (!data || status !== "authenticated") return;
    if (data.transactions.length > 0 && !data.aiInsight && !briefRefreshTriggered.current) {
      briefRefreshTriggered.current = true;
      fetch("/api/dashboard/refresh-brief", { method: "POST" })
        .then(() => queryClient.invalidateQueries({ queryKey: ["dashboard"] }))
        .catch(() => {});
    }
  }, [data, status, queryClient]);

  const { transactions = [], snapshots = [], aiInsight = null, accounts = [], goals = [], plaidUsage, briefRefresh, cashFlow } = data || {};
  const displayInsight: DashboardInsight = aiInsight ?? {
    dailySummary:
      transactions.length > 0
        ? "Your cash flow is ready. Tap Refresh to generate your full CFO brief."
        : "Link a bank account and sync transactions to get started.",
    cfoBrief: cashFlow
      ? {
          safeSpendTodayReason: "Based on your linked account balances and recent spending.",
          todaysMove: "Review today's spending and mark primary accounts in Accounts.",
        }
      : undefined,
  };
  const cfoBrief = aiInsight?.cfoBrief;
  const recurringReviews = aiInsight?.recurringTransactionsToReview ?? [];
  const briefRefreshInfo = briefRefresh;
  const briefUpdatedLabel = briefRefreshInfo?.lastUpdatedAt
    ? new Date(briefRefreshInfo.lastUpdatedAt).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;
  const nextBriefLabel = briefRefreshInfo?.nextRefreshAt
    ? new Date(briefRefreshInfo.nextRefreshAt).toLocaleString([], {
        hour: "numeric",
        minute: "2-digit",
      })
    : null;
  const fallbackSafeSpendToday = Math.max(0,
    (sumDepositoryCash(accounts) * 0.4) / 14
  );
  const safeSpendToday = typeof cfoBrief?.safeSpendToday === 'number'
    ? cfoBrief.safeSpendToday
    : fallbackSafeSpendToday;
  const availableCheckingCash = sumDepositoryCash(accounts);
  const protectedCashBuffer = Math.max(500, availableCheckingCash * 0.25);
  const monthlySafeSpend = safeSpendToday * 30;
  const sixMonthSafeSpend = safeSpendToday * 180;
  const safeSpendRaiseFactors = [
    "Paycheck, tenant rent, Lyft profit, or refunds clear in checking.",
    "Mortgage, utilities, IRS, insurance, subscriptions, and card minimums are covered.",
    "Food, convenience, travel, house repairs, and fun spending stay under the daily cap.",
  ];
  const safeSpendHurtFactors = [
    "Rent is late, expected income misses, or checking drops near the cash buffer.",
    "A mortgage, utility, insurance, tax, subscription, or card minimum is coming due.",
    "Large food, travel, house-repair, interest, or credit-card spending hits.",
  ];

  const priorityGoal = useMemo(() => {
    const sorted = [...goals].sort((a, b) => (a.priority ?? 3) - (b.priority ?? 3));
    const top = sorted[0];
    if (!top || !cashFlow) return null;
    const pace = calculateGoalPace({
      targetAmount: top.targetAmount,
      currentAmount: top.currentAmount,
      targetDate: top.targetDate,
      netDailyAverage: cashFlow.netDailyAverage,
    });
    return { name: top.name, paceMessage: pace.paceMessage, onTrack: pace.onTrack };
  }, [goals, cashFlow]);

  const filteredAndSortedTransactions = useMemo(() => {
    let result = [...transactions];

    if (selectedAccountId) {
      result = result.filter(t => t.accountId === selectedAccountId);
    }
    
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(t => 
        t.name?.toLowerCase().includes(q) || 
        t.merchantName?.toLowerCase().includes(q) ||
        t.categoryPrimary?.toLowerCase().includes(q)
      );
    }

    if (sortOrder === "amount_desc") {
      result.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
    } else if (sortOrder === "amount_asc") {
      result.sort((a, b) => Math.abs(a.amount) - Math.abs(b.amount));
    } else {
      result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }

    return result;
  }, [transactions, searchQuery, sortOrder, selectedAccountId]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSortedTransactions.length / itemsPerPage));
  const paginatedTransactions = filteredAndSortedTransactions.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleBankLinked = async () => {
    await fetch("/api/plaid/accounts");
    await handleSyncTransactions({ silent: true });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const handleSyncTransactions = async (options?: { silent?: boolean; bypassCooldown?: boolean }) => {
    setSyncStatus('loading');
    setSyncFeedback(null);

    try {
      const data = await postPlaidSync(options?.bypassCooldown ?? true);
      const feedback = getSyncFeedback(data);
      if (feedback && !options?.silent) {
        setSyncFeedback(feedback);
      }

      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setSyncStatus('success');
    } catch (err) {
      console.error(err);
      setSyncStatus('error');
      if (!options?.silent) {
        setSyncFeedback({
          tone: "error",
          message: err instanceof Error ? err.message : "Failed to sync transactions.",
        });
      }
    }
  };

  if (status === "loading") {
    return (
      <div className="flex h-screen app-page overflow-hidden">
        <aside className="hidden md:flex w-64 bg-white border-r border-slate-200/80 flex-col" />
        <main className="flex-1 p-4 md:p-8">
          <DashboardSkeleton />
        </main>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 app-page">
        <div className="app-card-elevated p-8 max-w-sm w-full text-center">
          <div className="w-12 h-12 rounded-2xl bg-teal-50 flex items-center justify-center mx-auto mb-4 ring-1 ring-teal-200/60">
            <BrainCircuit className="text-teal-600" size={24} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight mb-2">Personal CFO</h1>
          <p className="text-slate-500 mb-8 leading-relaxed">
            Connect your banks, get a daily CFO brief, and turn transactions into clear next actions.
          </p>
          <button
            onClick={() => router.push("/login")}
            className="app-btn-primary px-6 py-3 w-full"
          >
            Sign in
          </button>
        </div>
      </div>
    );
  }

  const renderNavItem = (tab: TabType, Icon: LucideIcon, label: string) => (
    <button
      key={tab}
      onClick={() => { setActiveTab(tab); setIsSidebarOpen(false); }}
      className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl transition-all text-sm ${
        activeTab === tab
          ? "bg-teal-50 text-teal-900 font-semibold ring-1 ring-teal-200/60"
          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
      }`}
    >
      <Icon size={18} className={activeTab === tab ? "text-teal-600" : "text-slate-400"} />
      {label}
    </button>
  );

  return (
    <div className="flex h-screen app-page overflow-hidden">
      <PlaidOAuthHandler />
      
      {/* Mobile Menu Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200/80 transform transition-transform duration-200 ease-in-out md:translate-x-0 md:static md:flex flex-col shadow-sm ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5 px-2">
            <div className="w-9 h-9 bg-teal-600 rounded-xl flex items-center justify-center shadow-sm shadow-teal-600/25">
              <BrainCircuit className="text-white" size={18} />
            </div>
            <span className="font-bold text-base tracking-tight text-slate-900">CFO Agent</span>
          </div>
          <button className="md:hidden p-2 text-slate-400 hover:bg-slate-50 rounded-lg" onClick={() => setIsSidebarOpen(false)}>
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
          {renderNavItem("overview", LayoutDashboard, "Overview")}
          {renderNavItem("chat", BrainCircuit, "CFO Chat")}
          {renderNavItem("goals", Target, "Goals")}
          {renderNavItem("projections", TrendingUp, "Projections")}
          {renderNavItem("accounts", Wallet, "Accounts")}
          {renderNavItem("transactions", Receipt, "Transactions")}
        </nav>

        <div className="p-4 border-t border-slate-200/80">
          <div className="app-card p-3 mb-4 text-center text-sm">
             {accounts.length > 0 ? (
               <>
                 <p className="font-medium text-slate-900 mb-2">{accounts.length} accounts linked</p>
                 <ConnectBankButton onLinked={handleBankLinked} className="w-full bg-slate-50 text-slate-800 hover:bg-slate-100 border-none py-1.5 px-3 text-xs shadow-none ring-1 ring-slate-200/60" />
                 <button
                   type="button"
                   onClick={() => handleSyncTransactions({ bypassCooldown: true })}
                   disabled={syncStatus === 'loading'}
                   className="mt-2 w-full rounded-lg app-btn-primary px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                 >
                   {syncStatus === 'loading' ? 'Syncing...' : 'Sync transactions'}
                 </button>
                 {syncFeedback ? (
                   <p className={`mt-2 text-xs leading-relaxed ${syncFeedbackClassName(syncFeedback.tone)}`}>
                     {syncFeedback.message}
                   </p>
                 ) : null}
               </>
             ) : (
               <ConnectBankButton onLinked={handleBankLinked} className="w-full text-sm" />
             )}
          </div>

          <div className="flex items-center justify-between px-2">
            <span className="text-sm font-medium text-slate-700 truncate pr-2">
              {session?.user?.name || "User"}
            </span>
            <button onClick={() => signOut()} className="text-xs text-slate-400 hover:text-slate-700 transition">
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full min-w-0 bg-transparent">
        <header className="flex items-center justify-between px-4 py-3 border-b border-slate-200/60 bg-white/70 backdrop-blur-md sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <button onClick={() => setIsSidebarOpen(true)} className="md:hidden p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-lg">
              <Menu size={22} />
            </button>
            <span className="md:hidden font-semibold text-base capitalize text-slate-900">{activeTab}</span>
          </div>

          {plaidUsage && activeTab === "accounts" && (
            <div className="text-xs font-medium px-3 py-1.5 rounded-full bg-slate-50 text-slate-600 ring-1 ring-slate-200/60 ml-auto mr-2">
              Balance refreshes: {plaidUsage.balanceRefreshesToday}/{plaidUsage.dailyBalanceCallLimit}
            </div>
          )}

          <div className="flex items-center gap-2 ml-auto">
            {error ? (
              <span className="hidden sm:inline text-xs text-rose-600 max-w-[12rem] truncate">
                {error instanceof Error ? error.message : "Failed to load"}
              </span>
            ) : null}
            <button
              type="button"
              onClick={handleRefreshAll}
              disabled={isRefreshing || isLoading || isFetching}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 app-card hover:bg-white disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              title="Sync transactions and refresh your CFO brief"
            >
              <RefreshCw size={16} className={isRefreshing || isFetching ? "animate-spin" : ""} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-4xl mx-auto w-full h-full flex flex-col">
            
            {/* View: CHAT */}
            {activeTab === 'chat' && (
              <div className="flex-1 flex flex-col">
                <div className="mb-6 hidden md:block">
                  <h1 className="text-2xl font-bold text-slate-900 tracking-tight">CFO Chat</h1>
                  <p className="text-slate-500 mt-1">Ask what to do today, whether to hold cash, or which debt to attack next.</p>
                </div>
                <div className="flex-1 h-full min-h-[500px]">
                  <ChatInterface />
                </div>
              </div>
            )}

            {/* View: OVERVIEW */}
            {activeTab === 'overview' && (
              isLoading && !data ? (
                <DashboardSkeleton />
              ) : cashFlow ? (
                <OverviewHome
                  aiInsight={displayInsight}
                  cashFlow={cashFlow}
                  safeSpendToday={safeSpendToday}
                  protectedCashBuffer={protectedCashBuffer}
                  monthlySafeSpend={monthlySafeSpend}
                  sixMonthSafeSpend={sixMonthSafeSpend}
                  safeSpendRaiseFactors={safeSpendRaiseFactors}
                  safeSpendHurtFactors={safeSpendHurtFactors}
                  briefUpdatedLabel={briefUpdatedLabel}
                  nextBriefLabel={nextBriefLabel}
                  refreshHours={briefRefreshInfo?.refreshHours}
                  snapshots={snapshots}
                  recurringReviews={recurringReviews}
                  onTakeAction={handleTakeAction}
                  actionStatuses={actionStatuses}
                  onOpenChat={() => setActiveTab('chat')}
                  priorityGoal={priorityGoal}
                  isBriefPending={!aiInsight && transactions.length > 0}
                />
              ) : (
                <div className="app-card p-8 text-center text-slate-500 leading-relaxed space-y-4">
                  <p>Link a bank account and sync transactions to see your daily cash flow.</p>
                  <ConnectBankButton onLinked={handleBankLinked} className="mx-auto" />
                </div>
              )
            )}

            {/* View: ACCOUNTS */}
            {activeTab === 'accounts' && (
              <AccountsView
                accounts={accounts}
                onBankLinked={handleBankLinked}
                onViewTransactions={(plaidAccountId) => {
                  setSelectedAccountId(plaidAccountId);
                  setActiveTab('transactions');
                  setCurrentPage(1);
                }}
              />
            )}

            {/* View: TRANSACTIONS */}
            {activeTab === 'transactions' && (
              <div className="space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                  <h1 className="text-2xl font-bold text-slate-900 tracking-tight hidden md:block">Transactions</h1>
                  <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                    <div className="relative flex-1 md:flex-none min-w-[140px]">
                      <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <select
                        value={selectedAccountId || ""}
                        onChange={(e) => {
                          setSelectedAccountId(e.target.value || null);
                          setCurrentPage(1);
                        }}
                        className="app-input appearance-none pl-9 pr-8 py-2 w-full text-sm cursor-pointer"
                      >
                        <option value="">All Accounts</option>
                        {accounts.map((acc) => (
                          <option key={acc.id} value={acc.plaidAccountId}>
                            {acc.name} {acc.mask ? `(••${acc.mask})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="relative flex-1 md:flex-none">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Search..."
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          setCurrentPage(1);
                        }}
                        className="app-input pl-9 pr-4 py-2 w-full text-sm"
                      />
                    </div>
                    <div className="relative flex-1 md:flex-none">
                      <ArrowDownUp className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <select
                        value={sortOrder}
                        onChange={(e) => {
                          setSortOrder(e.target.value as typeof sortOrder);
                          setCurrentPage(1);
                        }}
                        className="app-input appearance-none pl-9 pr-8 py-2 w-full text-sm cursor-pointer"
                      >
                        <option value="amount_desc">Highest</option>
                        <option value="amount_asc">Lowest</option>
                        <option value="date">Recent</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="app-card overflow-hidden">
                  <ul className="divide-y divide-slate-100">
                    {paginatedTransactions.length > 0 ? (
                      paginatedTransactions.map((t) => (
                        <li key={t.id} className="p-4 flex justify-between items-center hover:bg-slate-50/80 transition-colors">
                          <div>
                            <p className="font-medium text-slate-900">{t.name}</p>
                            <p className="text-xs text-slate-500 mt-1 flex items-center flex-wrap gap-2">
                              <span>{t.date}</span>
                              <span>•</span>
                              <span>{t.categoryPrimary || "Uncategorized"}</span>
                              {t.isTenantPaymentCandidate && (
                                <span className="text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase ring-1 ring-teal-200/60">
                                  Rent
                                </span>
                              )}
                            </p>
                          </div>
                          <p className={`font-semibold text-lg tabular-nums ${t.amount > 0 ? "text-slate-900" : "text-teal-600"}`}>
                            {formatCurrency(Math.abs(t.amount))}
                          </p>
                        </li>
                      ))
                    ) : (
                      <li className="p-12 text-center text-slate-500">No transactions found.</li>
                    )}
                  </ul>
                  {totalPages > 1 && (
                    <div className="p-4 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between">
                      <p className="text-sm text-slate-500">
                        Page <span className="font-medium text-slate-900">{currentPage}</span> of{" "}
                        <span className="font-medium text-slate-900">{totalPages}</span>
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                          className="px-4 py-2 rounded-xl app-card text-sm font-semibold text-slate-700 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          Previous
                        </button>
                        <button
                          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                          disabled={currentPage === totalPages}
                          className="px-4 py-2 rounded-xl app-card text-sm font-semibold text-slate-700 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* View: PROJECTIONS */}
            {activeTab === 'projections' && (
              <div className="space-y-6">
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight hidden md:block mb-6">Projections</h1>
                <div className="app-card p-6">
                  {accounts.length > 0 ? <Projections /> : <p className="text-slate-500 text-center p-8">Link an account to see projections.</p>}
                </div>
              </div>
            )}

            {/* View: GOALS */}
            {activeTab === 'goals' && (
              <GoalsView goals={goals} netDailyAverage={cashFlow?.netDailyAverage ?? 0} />
            )}

          </div>
        </div>
      </main>
    </div>
  );
}