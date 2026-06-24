"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Send, User, BrainCircuit } from "lucide-react";
import type { SpendingAlert } from "@/lib/spending-alerts";
import type { ChargeReviewDisposition } from "@/lib/charge-review";
import { SpendingRadar } from "./chat/spending-radar";
import { TransactionSpotlightCard, type TransactionSpotlight } from "./chat/transaction-spotlight";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  spotlight?: TransactionSpotlight | null;
};

type SpendingAlertsResponse = {
  alerts: SpendingAlert[];
  estimatedMonthlyLeak: number;
};

function fetchSpendingAlerts() {
  return fetch("/api/spending-alerts").then(async (res) => {
    if (!res.ok) {
      throw new Error("Failed to load spending alerts.");
    }
    return res.json() as Promise<SpendingAlertsResponse>;
  });
}

export function ChatInterface() {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Hi there. I am your personal CFO agent. Ask me for today's CFO brief, safe spend number, debt move, or spending leaks. Tap a charge in Spending radar below, or ask me what a mystery transaction is.",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [dismissingId, setDismissingId] = useState<string | null>(null);

  const { data: radarData, isLoading: radarLoading } = useQuery({
    queryKey: ["spending-alerts"],
    queryFn: fetchSpendingAlerts,
  });

  const handleAskAboutAlert = (alert: SpendingAlert) => {
    const label = alert.merchantName ?? alert.name;
    const prompt = `What is the ${label} transaction for ${alert.amount.toFixed(2)} on ${alert.date}? Is this something I should keep paying or cancel?`;
    setInput(prompt);
    inputRef.current?.focus();
  };

  const handleDismissAlert = async (
    alert: SpendingAlert,
    disposition: ChargeReviewDisposition,
    note?: string,
  ) => {
    setDismissingId(alert.id);

    try {
      const response = await fetch("/api/spending-alerts/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionId: alert.id,
          merchantLabel: alert.merchantName ?? alert.name,
          amount: alert.amount,
          date: alert.date,
          disposition,
          note,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to save review.");
      }

      await queryClient.invalidateQueries({ queryKey: ["spending-alerts"] });

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Got it — I saved that "${alert.merchantName ?? alert.name}" is reviewed and won't keep flagging it in Spending radar.${note?.trim() ? ` Note saved: ${note.trim()}` : ""}`,
        },
      ]);
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: err instanceof Error ? err.message : "Couldn't save that review. Try again.",
        },
      ]);
    } finally {
      setDismissingId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: userMessage }];
    setMessages(nextMessages);
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map(({ role, content }) => ({ role, content })),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Failed to process chat");
      }

      let assistantMessage = data.message as string;

      if (Array.isArray(data.memoriesSaved) && data.memoriesSaved.length > 0) {
        assistantMessage += `\n\nSaved for your financial overview: ${data.memoriesSaved.join(", ")}.`;
      }

      if (data.briefRefreshed) {
        assistantMessage += "\n\nI refreshed your CFO brief. Check Overview for the updated daily spend limit.";
        await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: assistantMessage,
          spotlight: data.spotlight ?? null,
        },
      ]);
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            err instanceof Error ? err.message : "Sorry, I encountered an error answering your question.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <SpendingRadar
        alerts={radarData?.alerts ?? []}
        estimatedMonthlyLeak={radarData?.estimatedMonthlyLeak ?? 0}
        isLoading={radarLoading}
        dismissingId={dismissingId}
        onAskAbout={handleAskAboutAlert}
        onDismiss={handleDismissAlert}
      />

      <div className="flex flex-col h-[500px] app-card overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  m.role === "user" ? "bg-teal-100 text-teal-700" : "bg-slate-100 text-teal-600"
                }`}
              >
                {m.role === "user" ? <User size={16} /> : <BrainCircuit size={16} />}
              </div>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                  m.role === "user"
                    ? "bg-teal-600 text-white shadow-sm shadow-teal-600/15"
                    : "bg-slate-50 text-slate-800 ring-1 ring-slate-200/60"
                }`}
              >
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.content}</p>
                {m.spotlight ? <TransactionSpotlightCard spotlight={m.spotlight} /> : null}
              </div>
            </div>
          ))}
          {isLoading ? (
            <div className="flex gap-3 flex-row">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 bg-slate-100 text-teal-600">
                <BrainCircuit size={16} />
              </div>
              <div className="bg-slate-50 ring-1 ring-slate-200/60 text-slate-800 rounded-2xl px-4 py-3 flex items-center gap-1">
                <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" />
                <div
                  className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"
                  style={{ animationDelay: "0.1s" }}
                />
                <div
                  className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"
                  style={{ animationDelay: "0.2s" }}
                />
              </div>
            </div>
          ) : null}
        </div>

        <form onSubmit={handleSubmit} className="p-4 border-t border-slate-100 bg-slate-50/50">
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="What is SPSQP WORKSHOP? Should I cancel it?"
              className="w-full pl-4 pr-12 py-3 app-input rounded-full text-sm"
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 bg-teal-600 text-white rounded-full flex items-center justify-center disabled:opacity-50 hover:bg-teal-700 transition-colors"
            >
              <Send size={14} className="ml-[-1px]" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
