"use client";

import { formatCurrency } from "@/lib/format";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownUp, Search, BrainCircuit, LayoutDashboard, Wallet, Receipt, TrendingUp, Menu, X } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ConnectBankButton } from "./connect-bank-button";
import { Projections } from "./projections";
import { ChatInterface } from "./chat-interface";

function fetchDashboard() {
  return fetch("/api/dashboard").then((res) => res.json());
}

type TabType = 'chat' | 'overview' | 'accounts' | 'transactions' | 'projections';

export function Dashboard() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session, status } = useSession();
  
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: fetchDashboard,
    enabled: status === "authenticated",
  });

  const [activeTab, setActiveTab] = useState<TabType>('chat');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"date" | "amount_desc" | "amount_asc">("amount_desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [actionStatuses, setActionStatuses] = useState<Record<string, 'idle' | 'loading' | 'sent'>>({});
  const itemsPerPage = 10;

  const handleTakeAction = async (sub: any) => {
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
    } catch (e) {
      setActionStatuses(prev => ({ ...prev, [sub.merchant]: 'idle' }));
      alert("Failed to send reminder.");
    }
  };

  const { transactions = [], snapshots = [], aiInsight, accounts = [], plaidUsage } = data || {};

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
    await fetch("/api/plaid/sync", { method: "POST" });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  if (status === "loading") return <div className="p-8 text-center flex-1 h-screen flex items-center justify-center">Loading...</div>;

  if (status === "unauthenticated") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <h1 className="text-2xl font-bold mb-4">Daily Financial Coach</h1>
        <p className="text-zinc-600 mb-8 text-center max-w-sm">
          Connect your banks, get daily AI insights, and track your financial health over time.
        </p>
        <button 
          onClick={() => router.push("/login")}
          className="bg-zinc-900 text-white px-6 py-3 rounded-xl font-medium w-full max-w-[200px]"
        >
          Sign In
        </button>
      </div>
    );
  }

  const renderNavItem = (tab: TabType, Icon: any, label: string) => (
    <button
      key={tab}
      onClick={() => { setActiveTab(tab); setIsSidebarOpen(false); }}
      className={`flex items-center gap-3 w-full p-3 rounded-xl transition-all ${
        activeTab === tab 
          ? 'bg-zinc-200 text-zinc-900 font-semibold shadow-sm' 
          : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
      }`}
    >
      <Icon size={20} className={activeTab === tab ? 'text-zinc-900' : 'text-zinc-500'} />
      {label}
    </button>
  );

  return (
    <div className="flex h-screen bg-zinc-50 overflow-hidden">
      
      {/* Mobile Menu Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/20 z-40 md:hidden" 
          onClick={() => setIsSidebarOpen(false)} 
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-zinc-50/80 backdrop-blur-xl border-r border-zinc-200 transform transition-transform duration-200 ease-in-out md:translate-x-0 md:static md:flex flex-col ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-2 px-2">
            <div className="w-8 h-8 bg-zinc-900 rounded-full flex items-center justify-center">
              <BrainCircuit className="text-white" size={18} />
            </div>
            <span className="font-bold text-lg tracking-tight text-zinc-900">Coach AI</span>
          </div>
          <button className="md:hidden p-2 text-zinc-500 hover:bg-zinc-100 rounded-lg" onClick={() => setIsSidebarOpen(false)}>
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {renderNavItem("chat", BrainCircuit, "AI Chat")}
          {renderNavItem("overview", LayoutDashboard, "Overview")}
          {renderNavItem("projections", TrendingUp, "Projections")}
          {renderNavItem("accounts", Wallet, "Accounts")}
          {renderNavItem("transactions", Receipt, "Transactions")}
        </nav>

        <div className="p-4 border-t border-zinc-200">
          <div className="bg-white border border-zinc-200 p-3 rounded-xl mb-4 text-center text-sm shadow-sm">
             {accounts.length > 0 ? (
               <>
                 <p className="font-medium text-zinc-900 mb-2">{accounts.length} Accounts Linked</p>
                 <ConnectBankButton onLinked={handleBankLinked} className="w-full bg-zinc-100 text-zinc-900 hover:bg-zinc-200 border-none py-1.5 px-3 text-xs shadow-none" />
               </>
             ) : (
               <ConnectBankButton onLinked={handleBankLinked} className="w-full text-sm" />
             )}
          </div>

          <div className="flex items-center justify-between px-2">
            <span className="text-sm font-medium text-zinc-700 truncate pr-2">
              {session?.user?.name || "User"}
            </span>
            <button onClick={() => signOut()} className="text-xs text-zinc-500 hover:text-zinc-900 hover:underline">
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full min-w-0 bg-white">
        {/* Header */}
        <header className="flex items-center justify-between p-4 border-b border-zinc-100 bg-white/80 backdrop-blur-md sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <button onClick={() => setIsSidebarOpen(true)} className="md:hidden p-2 -ml-2 text-zinc-600 hover:bg-zinc-100 rounded-lg">
              <Menu size={24} />
            </button>
            <span className="md:hidden font-semibold text-lg capitalize">{activeTab}</span>
          </div>
          
          {plaidUsage && (
            <div className="text-xs font-medium px-3 py-1.5 rounded-full border bg-zinc-50 text-zinc-600 border-zinc-200 shadow-sm ml-auto">
              Plaid API calls today: <span className="text-zinc-900">{plaidUsage.totalCalls}</span>
            </div>
          )}
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-4xl mx-auto w-full h-full flex flex-col">
            
            {/* View: CHAT */}
            {activeTab === 'chat' && (
              <div className="flex-1 flex flex-col">
                <div className="mb-6 hidden md:block">
                  <h1 className="text-2xl font-bold text-zinc-900">Chat with AI Coach</h1>
                  <p className="text-zinc-500 mt-1">Ask questions about your finances, get advice, and analyze your spending.</p>
                </div>
                <div className="flex-1 h-full min-h-[500px]">
                  <ChatInterface />
                </div>
              </div>
            )}

            {/* View: OVERVIEW */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                <h1 className="text-2xl font-bold text-zinc-900 hidden md:block mb-6">Financial Overview</h1>
                
                {aiInsight ? (
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="bg-emerald-900 text-white p-6 rounded-3xl shadow-xl flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <h2 className="text-lg font-semibold flex items-center gap-2">
                            <span className="bg-emerald-400 w-2 h-2 rounded-full animate-pulse"></span>
                            Safe to Spend Today
                          </h2>
                        </div>
                        <p className="text-zinc-300 text-sm mb-4">
                          Based on your current balance, upcoming recurring bills, and daily average spend.
                        </p>
                      </div>
                      
                      <div className="bg-black/20 p-6 rounded-2xl border border-white/10 text-center">
                        <p className="text-5xl font-bold text-emerald-400 mb-2">
                          {formatCurrency(
                            Math.max(0, 
                              (accounts.reduce((sum: number, acc: any) => sum + (acc.currentBalance || 0), 0) * 0.4) / 14
                            )
                          )}
                        </p>
                        <p className="text-sm text-emerald-200/70 uppercase tracking-wider font-semibold">Remaining Daily Allowance</p>
                      </div>
                    </div>

                    <div className="bg-zinc-900 text-white p-6 rounded-3xl shadow-xl">
                      <div className="flex justify-between items-start mb-4">
                        <h2 className="text-lg font-semibold flex items-center gap-2">
                          AI Financial Coach
                        </h2>
                        <div className="text-right">
                          <p className="text-xs text-zinc-400 uppercase tracking-wider">Health Score</p>
                          <p className="text-2xl font-bold text-emerald-400">{aiInsight.financialHealthScore}/100</p>
                        </div>
                      </div>
                      
                      <p className="text-sm sm:text-base mb-6 leading-relaxed text-zinc-200">
                        {aiInsight.dailySummary}
                      </p>

                      {aiInsight.recommendedActions?.[0] && (
                        <div className="bg-emerald-500/20 border border-emerald-500/30 p-4 rounded-xl">
                          <p className="text-xs uppercase text-emerald-300 font-semibold mb-1">Recommended Action</p>
                          <p className="text-sm font-medium">{aiInsight.recommendedActions[0].title}</p>
                          <p className="text-xs text-zinc-300 mt-1">{aiInsight.recommendedActions[0].reason}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="p-8 border border-dashed border-zinc-300 rounded-3xl text-center text-zinc-500">
                    Your AI insights are generating. Check back soon.
                  </div>
                )}

                {aiInsight?.recurringTransactionsToReview?.length > 0 && (
                  <div className="bg-white border border-rose-200 p-6 rounded-3xl shadow-sm">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="bg-rose-100 p-2 rounded-lg">
                        <span className="text-xl">✂️</span>
                      </div>
                      <div>
                        <h2 className="font-semibold text-rose-900 text-lg">Subscriptions to Review</h2>
                        <p className="text-sm text-zinc-500">The AI flagged these recurring charges.</p>
                      </div>
                    </div>
                    
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {aiInsight.recurringTransactionsToReview.map((sub: any, i: number) => (
                        <div key={i} className="border border-rose-100 bg-rose-50/50 p-5 rounded-2xl flex flex-col justify-between">
                          <div>
                            <div className="flex justify-between items-start mb-2">
                              <p className="font-bold text-rose-950 truncate pr-2">{sub.merchant}</p>
                              <p className="font-bold text-rose-700">{formatCurrency(sub.averageAmount)}</p>
                            </div>
                            <p className="text-xs uppercase tracking-wider text-rose-500/80 font-semibold mb-3">{sub.frequency}</p>
                            <p className="text-sm text-rose-900/80 leading-relaxed">{sub.recommendation}</p>
                          </div>
                          <button 
                            onClick={() => handleTakeAction(sub)}
                            disabled={actionStatuses[sub.merchant] === 'loading' || actionStatuses[sub.merchant] === 'sent'}
                            className={`mt-4 w-full border text-sm font-semibold py-2 rounded-xl transition-colors ${
                              actionStatuses[sub.merchant] === 'sent'
                                ? 'bg-emerald-100 border-emerald-200 text-emerald-700'
                                : 'bg-white border-rose-200 text-rose-700 hover:bg-rose-100'
                            }`}
                          >
                            {actionStatuses[sub.merchant] === 'loading' ? 'Sending...' : 
                             actionStatuses[sub.merchant] === 'sent' ? 'Reminder Sent!' : 
                             'Take Action'}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {snapshots.length > 0 && (
                  <div className="bg-white border border-zinc-200 p-6 rounded-3xl">
                    <h2 className="font-semibold mb-6">Daily Spending (Last 30 Days)</h2>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={snapshots}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" />
                          <XAxis dataKey="date" tick={{fontSize: 12}} tickMargin={10} stroke="#666" />
                          <YAxis tick={{fontSize: 12}} tickFormatter={(val) => `$${val}`} stroke="#666" />
                          <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                          <Line type="monotone" dataKey="totalSpent" stroke="#10b981" strokeWidth={3} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* View: ACCOUNTS */}
            {activeTab === 'accounts' && (
              <div className="space-y-6">
                <h1 className="text-2xl font-bold text-zinc-900 hidden md:block mb-6">Connected Accounts</h1>
                
                {accounts.length === 0 ? (
                  <div className="p-8 text-center border-dashed border-2 border-zinc-200 rounded-3xl">
                    <p className="text-zinc-500 mb-4">No accounts linked yet.</p>
                    <ConnectBankButton onLinked={handleBankLinked} />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {accounts.map((acc: any) => (
                      <div key={acc.id} className="p-6 rounded-3xl border border-zinc-200 bg-white shadow-sm flex flex-col justify-between">
                        <div>
                          <p className="font-semibold text-lg text-zinc-900 truncate" title={acc.name}>{acc.name}</p>
                          <p className="text-sm text-zinc-500 uppercase tracking-wider mt-1 font-medium">
                            {acc.subtype} {acc.mask ? `•••• ${acc.mask}` : ''}
                          </p>
                        </div>
                        <p className="text-3xl font-bold mt-6 text-zinc-900">
                          {formatCurrency(acc.currentBalance ?? 0)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* View: TRANSACTIONS */}
            {activeTab === 'transactions' && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 hidden md:flex mb-6">
                  <h1 className="text-2xl font-bold text-zinc-900">Transactions</h1>
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                      <input
                        type="text"
                        placeholder="Search..."
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          setCurrentPage(1);
                        }}
                        className="pl-9 pr-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div className="relative">
                      <ArrowDownUp className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                      <select
                        value={sortOrder}
                        onChange={(e) => {
                          setSortOrder(e.target.value as any);
                          setCurrentPage(1);
                        }}
                        className="appearance-none pl-9 pr-8 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                      >
                        <option value="amount_desc">Highest</option>
                        <option value="amount_asc">Lowest</option>
                        <option value="date">Recent</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-zinc-200 rounded-3xl overflow-hidden">
                  <ul className="divide-y divide-zinc-100">
                    {paginatedTransactions.length > 0 ? (
                      paginatedTransactions.map((t: any) => (
                        <li key={t.id} className="p-4 flex justify-between items-center hover:bg-zinc-50 transition-colors">
                          <div>
                            <p className="font-medium text-zinc-900">{t.name}</p>
                            <p className="text-xs text-zinc-500 mt-1 flex items-center flex-wrap gap-2 font-medium">
                              <span>{t.date}</span>
                              <span>•</span>
                              <span className="uppercase tracking-wider">{t.categoryPrimary || "Uncategorized"}</span>
                              {t.isTenantPaymentCandidate && <span className="text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded uppercase tracking-wider">Rent</span>}
                            </p>
                          </div>
                          <p className={`font-semibold text-lg ${t.amount > 0 ? "text-zinc-900" : "text-emerald-600"}`}>
                            {formatCurrency(Math.abs(t.amount))}
                          </p>
                        </li>
                      ))
                    ) : (
                      <li className="p-12 text-center text-zinc-500">No transactions found.</li>
                    )}
                  </ul>
                  {totalPages > 1 && (
                    <div className="p-4 bg-zinc-50 border-t border-zinc-100 flex items-center justify-between">
                      <p className="text-sm text-zinc-500">
                        Page <span className="font-medium text-zinc-900">{currentPage}</span> of <span className="font-medium text-zinc-900">{totalPages}</span>
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                          className="px-4 py-2 rounded-xl border border-zinc-200 bg-white text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                        >
                          Previous
                        </button>
                        <button
                          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                          disabled={currentPage === totalPages}
                          className="px-4 py-2 rounded-xl border border-zinc-200 bg-white text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
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
                <h1 className="text-2xl font-bold text-zinc-900 hidden md:block mb-6">Financial Projections</h1>
                <div className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-sm">
                  {accounts.length > 0 ? <Projections /> : <p className="text-zinc-500 text-center p-8">Link an account to see projections.</p>}
                </div>
              </div>
            )}

          </div>
        </div>
      </main>
    </div>
  );
}