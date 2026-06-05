"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { formatCurrency } from "@/lib/format";
import { ConnectBankButton } from "./connect-bank-button";
import { Projections } from "./projections";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useMemo } from "react";
import { Search, ChevronLeft, ChevronRight, ArrowDownUp } from "lucide-react";

function fetchDashboard() {
  return fetch("/api/dashboard").then((res) => res.json());
}

export function Dashboard() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session, status } = useSession();
  
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: fetchDashboard,
    enabled: status === "authenticated",
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"date" | "amount_desc" | "amount_asc">("amount_desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const itemsPerPage = 10;

  const { transactions = [], snapshots = [], aiInsight, accounts = [] } = data || {};

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

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1);
  };

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSortOrder(e.target.value as any);
    setCurrentPage(1);
  };

  const handleBankLinked = async () => {
    // 1. Fetch account balances to populate the database
    await fetch("/api/plaid/accounts");
    // 2. Trigger a transaction sync
    await fetch("/api/plaid/sync", { method: "POST" });
    // 3. Refresh dashboard data
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  // Early returns must happen AFTER all hooks (useState, useMemo, etc) are called
  if (status === "loading") return <div className="p-8 text-center">Loading...</div>;

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

  if (isLoading) return <div className="p-8 text-center">Loading your financial data...</div>;

  return (
    <div className="mx-auto max-w-4xl p-4 pb-24 space-y-8">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Hello, {session?.user?.name || "User"}</h1>
          <p className="text-zinc-500">Your daily financial intelligence.</p>
        </div>
        <button onClick={() => signOut()} className="text-sm text-zinc-500 underline">Sign out</button>
      </header>

      {/* Connection Area */}
      {accounts.length === 0 ? (
        <div className="bg-emerald-50 border border-emerald-200 p-6 rounded-2xl">
          <h2 className="font-semibold text-emerald-900 mb-2">Link your accounts to start</h2>
          <ConnectBankButton onLinked={handleBankLinked} />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold">Your Accounts</h2>
            <ConnectBankButton onLinked={handleBankLinked} className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200 border-none min-h-0 py-2 px-4 text-xs w-auto" />
          </div>
          {selectedAccountId && (
            <button 
              onClick={() => { setSelectedAccountId(null); setCurrentPage(1); }}
              className="text-xs text-emerald-600 font-medium hover:underline mb-2 block"
            >
              Clear filter (Show all transactions)
            </button>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {accounts.map((acc: any) => (
              <div 
                key={acc.id} 
                onClick={() => { 
                  setSelectedAccountId(prev => prev === acc.plaidAccountId ? null : acc.plaidAccountId);
                  setCurrentPage(1);
                }}
                className={`p-5 rounded-2xl border bg-white shadow-sm flex flex-col justify-between transition-all hover:border-emerald-200 hover:shadow-md cursor-pointer ${
                  selectedAccountId === acc.plaidAccountId 
                    ? 'border-emerald-500 ring-1 ring-emerald-500 bg-emerald-50/30' 
                    : 'border-zinc-200'
                }`}
              >
                <div>
                  <p className="font-semibold text-zinc-900 truncate" title={acc.name}>{acc.name}</p>
                  <p className="text-xs text-zinc-500 uppercase tracking-wider mt-0.5">
                    {acc.subtype} {acc.mask ? `•••• ${acc.mask}` : ''}
                  </p>
                </div>
                <p className="text-2xl font-bold mt-4 text-zinc-900">
                  {formatCurrency(acc.currentBalance ?? 0)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Coach Panel */}
      {aiInsight && (
        <div className="bg-zinc-900 text-white p-6 rounded-3xl shadow-xl">
          <div className="flex justify-between items-start mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <span className="bg-emerald-500 w-2 h-2 rounded-full animate-pulse"></span>
              AI Coach
            </h2>
            <div className="text-right">
              <p className="text-xs text-zinc-400 uppercase tracking-wider">Health Score</p>
              <p className="text-2xl font-bold text-emerald-400">{aiInsight.financialHealthScore}/100</p>
            </div>
          </div>
          
          <p className="text-lg mb-6 leading-relaxed">
            {aiInsight.dailySummary}
          </p>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="bg-white/10 p-4 rounded-xl">
              <p className="text-xs uppercase text-emerald-400 font-semibold mb-1">Win</p>
              <p className="text-sm">{aiInsight.wins?.[0] || "Doing great."}</p>
            </div>
            <div className="bg-white/10 p-4 rounded-xl">
              <p className="text-xs uppercase text-orange-400 font-semibold mb-1">Warning</p>
              <p className="text-sm">{aiInsight.warnings?.[0] || "Nothing urgent."}</p>
            </div>
          </div>

          {aiInsight.recommendedActions?.[0] && (
            <div className="mt-4 bg-emerald-500/20 border border-emerald-500/30 p-4 rounded-xl">
              <p className="text-xs uppercase text-emerald-300 font-semibold mb-1">Next Action</p>
              <p className="text-sm font-medium">{aiInsight.recommendedActions[0].title}</p>
              <p className="text-xs text-zinc-300 mt-1">{aiInsight.recommendedActions[0].reason}</p>
            </div>
          )}
        </div>
      )}

      {/* Charts */}
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

      {/* Projections */}
      {accounts.length > 0 && (
        <Projections />
      )}

      {/* Recent Transactions Feed */}
      <div className="bg-white border border-zinc-200 rounded-3xl overflow-hidden">
        <div className="p-6 border-b border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className="font-semibold whitespace-nowrap">Recent Transactions</h2>
          
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <input
                type="text"
                placeholder="Search transactions..."
                value={searchQuery}
                onChange={handleSearch}
                className="w-full pl-9 pr-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            
            <div className="relative w-full sm:w-auto flex items-center">
              <ArrowDownUp className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <select
                value={sortOrder}
                onChange={handleSortChange}
                className="w-full sm:w-auto appearance-none pl-9 pr-8 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
              >
                <option value="amount_desc">Highest Amount</option>
                <option value="amount_asc">Lowest Amount</option>
                <option value="date">Most Recent</option>
              </select>
            </div>
          </div>
        </div>
        
        <ul className="divide-y divide-zinc-100">
          {paginatedTransactions.length > 0 ? (
            paginatedTransactions.map((t: any) => (
              <li key={t.id} className="p-4 flex justify-between items-center hover:bg-zinc-50 transition-colors">
                <div>
                  <p className="font-medium">{t.name}</p>
                  <p className="text-xs text-zinc-500 mt-1 flex items-center flex-wrap gap-2">
                    <span>{t.date}</span>
                    <span>•</span>
                    <span>{t.categoryPrimary || "Uncategorized"}</span>
                    {t.isTenantPaymentCandidate && <span className="text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider">Possible Rent</span>}
                  </p>
                </div>
                <p className={`font-semibold text-lg ${t.amount > 0 ? "text-zinc-900" : "text-emerald-600"}`}>
                  {formatCurrency(Math.abs(t.amount))}
                </p>
              </li>
            ))
          ) : (
            <li className="p-8 text-center text-zinc-500">No transactions found.</li>
          )}
        </ul>
        
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-zinc-100 flex items-center justify-between bg-zinc-50/50">
            <p className="text-sm text-zinc-500">
              Page <span className="font-medium text-zinc-900">{currentPage}</span> of <span className="font-medium text-zinc-900">{totalPages}</span>
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-2 rounded-lg border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-2 rounded-lg border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}