"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { User, BrainCircuit, Clock3, MessageSquarePlus, Volume2, VolumeX, LoaderCircle } from "lucide-react";
import type { SpendingAlert } from "@/lib/spending-alerts";
import type { ChargeReviewDisposition } from "@/lib/charge-review";
import { SpendingRadar } from "./chat/spending-radar";
import { TransactionSpotlightCard, type TransactionSpotlight } from "./chat/transaction-spotlight";
import { GoalSuggestionCard } from "./chat/goal-suggestion-card";
import type { GoalSuggestion } from "@/lib/goal-suggestion";
import { ChatComposer } from "./chat/chat-composer";
import { useCoachSpeech } from "@/hooks/use-coach-speech";
import { READ_ALOUD_STORAGE_KEY } from "@/lib/coach-speech";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  images?: string[];
  spotlight?: TransactionSpotlight | null;
  goalSuggestion?: GoalSuggestion | null;
};

type ChatHistoryResponse = {
  session: {
    id: string;
    title: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  sessions: Array<{
    id: string;
    title: string | null;
    createdAt: string;
    updatedAt: string;
    messageCount: number;
    lastMessage: string | null;
    lastMessageAt: string | null;
  }>;
  messages: Array<ChatMessage & { id: string; createdAt: string }>;
};

type SpendingAlertsResponse = {
  alerts: SpendingAlert[];
  estimatedMonthlyLeak: number;
};

const initialCoachMessages: ChatMessage[] = [
  {
    role: "assistant",
    content:
      "Hi — I'm your Life OS coach. Try “good morning” or “what should I do today” for your schedule, money headline, and today's move. You can also say “schedule gym tomorrow at 6” and, once Google Calendar is connected, I’ll add the event. Money questions, charges, and screenshots still work here.",
  },
];

function fetchChatHistory(sessionId?: string | null) {
  const params = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : "";

  return fetch(`/api/chat${params}`).then(async (res) => {
    if (!res.ok) {
      throw new Error("Failed to load coach history.");
    }
    return res.json() as Promise<ChatHistoryResponse>;
  });
}

function formatHistoryDate(value: string | null) {
  if (!value) return "No messages yet";

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function previewText(value: string | null) {
  const text = value?.replace(/\s+/g, " ").trim();
  if (!text) return "No messages saved yet.";
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

function fetchSpendingAlerts() {
  return fetch("/api/spending-alerts").then(async (res) => {
    if (!res.ok) {
      throw new Error("Failed to load spending alerts.");
    }
    return res.json() as Promise<SpendingAlertsResponse>;
  });
}

export function ChatInterface({
  seedPrompt = null,
  onSeedPromptUsed,
}: {
  seedPrompt?: string | null;
  onSeedPromptUsed?: () => void;
}) {
  const queryClient = useQueryClient();
  const historyHydratedRef = useRef(false);
  const hasLocalInteractionRef = useRef(false);
  const [messages, setMessages] = useState<ChatMessage[]>(initialCoachMessages);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [activeCoachTab, setActiveCoachTab] = useState<"chat" | "history">("chat");
  const [input, setInput] = useState("");
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingHistorySessionId, setLoadingHistorySessionId] = useState<string | null>(null);
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [readAloudEnabled, setReadAloudEnabled] = useState(false);
  const readAloudBaselineRef = useRef(0);
  const prevMessageCountRef = useRef(initialCoachMessages.length);

  const {
    speak,
    stop: stopSpeech,
    isLoadingSpeech,
    isSpeaking,
    speakingMessageIndex,
    speechError,
    clearSpeechError,
  } = useCoachSpeech();

  const { data: chatHistory } = useQuery({
    queryKey: ["chat-history"],
    queryFn: () => fetchChatHistory(),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const { data: radarData, isLoading: radarLoading } = useQuery({
    queryKey: ["spending-alerts"],
    queryFn: fetchSpendingAlerts,
  });

  useEffect(() => {
    if (!chatHistory || historyHydratedRef.current || hasLocalInteractionRef.current) return;

    historyHydratedRef.current = true;
    setSessionId(chatHistory.session?.id ?? null);
    const nextMessages =
      chatHistory.messages.length > 0
        ? chatHistory.messages.map(({ role, content, images, spotlight, goalSuggestion }) => ({
            role,
            content,
            images,
            spotlight,
            goalSuggestion,
          }))
        : initialCoachMessages;
    setMessages(nextMessages);
    readAloudBaselineRef.current = nextMessages.length;
    prevMessageCountRef.current = nextMessages.length;
  }, [chatHistory]);

  useEffect(() => {
    if (!seedPrompt?.trim()) return;
    setInput(seedPrompt.trim());
    onSeedPromptUsed?.();
  }, [seedPrompt, onSeedPromptUsed]);

  useEffect(() => {
    const stored = window.localStorage.getItem(READ_ALOUD_STORAGE_KEY);
    if (stored === "true") {
      readAloudBaselineRef.current = initialCoachMessages.length;
      prevMessageCountRef.current = initialCoachMessages.length;
      setReadAloudEnabled(true);
    }
  }, []);

  useEffect(() => {
    if (!readAloudEnabled) {
      prevMessageCountRef.current = messages.length;
      return;
    }

    if (messages.length > prevMessageCountRef.current) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage?.role === "assistant" && messages.length > readAloudBaselineRef.current) {
        void speak(lastMessage.content, { messageIndex: messages.length - 1 });
      }
    }

    prevMessageCountRef.current = messages.length;
  }, [messages, readAloudEnabled, speak]);

  const toggleReadAloud = () => {
    setReadAloudEnabled((current) => {
      const next = !current;
      window.localStorage.setItem(READ_ALOUD_STORAGE_KEY, String(next));
      readAloudBaselineRef.current = messages.length;
      prevMessageCountRef.current = messages.length;
      clearSpeechError();

      if (!next) {
        stopSpeech();
      }

      return next;
    });
  };

  const handleAskAboutAlert = (alert: SpendingAlert) => {
    const label = alert.merchantName ?? alert.name;
    const prompt = `What is the ${label} transaction for ${alert.amount.toFixed(2)} on ${alert.date}? Is this something I should keep paying or cancel?`;
    setInput(prompt);
    setActiveCoachTab("chat");
  };

  const applyChatHistory = (history: ChatHistoryResponse) => {
    setSessionId(history.session?.id ?? null);
    setMessages(
      history.messages.length > 0
        ? history.messages.map(({ role, content, images, spotlight, goalSuggestion }) => ({
            role,
            content,
            images,
            spotlight,
            goalSuggestion,
          }))
        : initialCoachMessages,
    );
  };

  const handleOpenHistorySession = async (historySessionId: string) => {
    setLoadingHistorySessionId(historySessionId);

    try {
      const history = await fetchChatHistory(historySessionId);
      historyHydratedRef.current = true;
      hasLocalInteractionRef.current = true;
      applyChatHistory(history);
      setActiveCoachTab("chat");
    } catch (err) {
      console.error(err);
      setMessages([
        {
          role: "assistant",
          content: err instanceof Error ? err.message : "Couldn't load that coach session.",
        },
      ]);
      setActiveCoachTab("chat");
    } finally {
      setLoadingHistorySessionId(null);
    }
  };

  const handleNewChat = () => {
    historyHydratedRef.current = true;
    hasLocalInteractionRef.current = true;
    setSessionId(null);
    setMessages(initialCoachMessages);
    setInput("");
    setPendingImages([]);
    setActiveCoachTab("chat");
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

      hasLocalInteractionRef.current = true;
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

  const sendMessage = async () => {
    const userMessage = input.trim();
    const images = [...pendingImages];

    if ((!userMessage && images.length === 0) || isLoading) return;

    stopSpeech();
    setInput("");
    setPendingImages([]);

    const userChatMessage: ChatMessage = {
      role: "user",
      content: userMessage || "Please review the attached photo(s).",
      images: images.length > 0 ? images : undefined,
    };

    const nextMessages: ChatMessage[] = [...messages, userChatMessage];
    hasLocalInteractionRef.current = true;
    setMessages(nextMessages);
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          messages: nextMessages.map(({ role, content, images: messageImages }) => ({
            role,
            content,
            images: messageImages,
          })),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Failed to process chat");
      }

      let assistantMessage = data.message as string;
      if (typeof data.sessionId === "string") {
        setSessionId(data.sessionId);
      }

      if (Array.isArray(data.memoriesSaved) && data.memoriesSaved.length > 0) {
        assistantMessage += `\n\nSaved for your financial overview: ${data.memoriesSaved.join(", ")}.`;
      }

      if (data.briefRefreshed) {
        assistantMessage += "\n\nI refreshed your daily brief. Check Overview for the updated daily spend limit.";
        await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      }

      if (data.todayUpdated) {
        if (Array.isArray(data.todayApplied) && data.todayApplied.length > 0) {
          assistantMessage += `\n\nUpdated today: ${data.todayApplied.join("; ")}.`;
        }
        if (typeof data.refreshedMoveAction === "string" && data.refreshedMoveAction.trim()) {
          assistantMessage += `\n\nNew move for the rest of today: ${data.refreshedMoveAction}`;
        }
        await queryClient.invalidateQueries({ queryKey: ["growth-dashboard"] });
        await queryClient.invalidateQueries({ queryKey: ["overview-today"] });
      }

      if (data.calendarEventCreated) {
        const event = data.calendarEventCreated as { title?: string; htmlLink?: string | null };
        assistantMessage += `\n\nCreated on Google Calendar: ${event.title ?? "Event"}${event.htmlLink ? `: ${event.htmlLink}` : ""}`;
        await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        await queryClient.invalidateQueries({ queryKey: ["overview-today"] });
      } else if (typeof data.calendarEventError === "string" && data.calendarEventError.trim()) {
        assistantMessage += `\n\nCalendar not updated: ${data.calendarEventError}`;
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: assistantMessage,
          spotlight: data.spotlight ?? null,
          goalSuggestion: data.goalSuggestion ?? null,
        },
      ]);
      void queryClient.invalidateQueries({ queryKey: ["chat-history"] });
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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex w-full rounded-2xl bg-[color-mix(in_srgb,var(--ink)_6%,transparent)] p-1 ring-1 ring-[var(--card-border)] sm:w-auto">
          <button
            type="button"
            onClick={() => setActiveCoachTab("chat")}
            className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition sm:flex-none ${
              activeCoachTab === "chat"
                ? "bg-[var(--card)] text-[var(--ink)] shadow-sm"
                : "text-[var(--muted)] hover:text-[var(--ink)]"
            }`}
          >
            Coach
          </button>
          <button
            type="button"
            onClick={() => setActiveCoachTab("history")}
            className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition sm:flex-none ${
              activeCoachTab === "history"
                ? "bg-[var(--card)] text-[var(--ink)] shadow-sm"
                : "text-[var(--muted)] hover:text-[var(--ink)]"
            }`}
          >
            History
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={toggleReadAloud}
            className={`inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold ring-1 transition disabled:opacity-60 ${
              readAloudEnabled
                ? "bg-[var(--accent-soft)] text-[var(--accent-strong)] ring-[var(--accent)] dark:text-[var(--accent-bright)]"
                : "bg-[var(--card)] text-[var(--ink)] ring-[var(--card-border)] hover:bg-[color-mix(in_srgb,var(--ink)_4%,transparent)]"
            }`}
            disabled={isLoading}
            title={readAloudEnabled ? "Stop reading responses aloud" : "Read coach responses aloud"}
          >
            {readAloudEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            {readAloudEnabled ? "Read aloud on" : "Read aloud off"}
          </button>

          <button
            type="button"
            onClick={handleNewChat}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-600/15 disabled:opacity-60"
            disabled={isLoading}
          >
            <MessageSquarePlus size={16} />
            New chat
          </button>
        </div>
      </div>

      {activeCoachTab === "history" ? (
        <div className="h-[500px] app-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--card-border)] px-4 py-3 sm:px-5">
            <div>
              <p className="text-sm font-semibold text-[var(--ink)]">Coach history</p>
              <p className="text-xs text-[var(--muted)]">Open a past session and continue from there.</p>
            </div>
            <Clock3 size={18} className="text-[var(--muted)]" />
          </div>

          <div className="h-[calc(500px-65px)] overflow-y-auto p-4 sm:p-5">
            {chatHistory?.sessions.length ? (
              <div className="space-y-3">
                {chatHistory.sessions.map((historySession) => {
                  const isActive = historySession.id === sessionId;
                  const isLoadingSession = loadingHistorySessionId === historySession.id;

                  return (
                    <button
                      key={historySession.id}
                      type="button"
                      onClick={() => {
                        void handleOpenHistorySession(historySession.id);
                      }}
                      className={`w-full rounded-2xl p-4 text-left ring-1 transition ${
                        isActive
                          ? "bg-[var(--accent-soft)] ring-[var(--accent)]"
                          : "bg-[color-mix(in_srgb,var(--ink)_4%,transparent)] ring-[var(--card-border)] hover:bg-[color-mix(in_srgb,var(--ink)_7%,transparent)]"
                      }`}
                      disabled={isLoadingSession}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[var(--ink)]">
                            {historySession.title || "Coach session"}
                          </p>
                          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[var(--muted)]">
                            {previewText(historySession.lastMessage)}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-[color-mix(in_srgb,var(--ink)_8%,transparent)] px-2.5 py-1 text-[11px] font-semibold text-[var(--muted)]">
                          {historySession.messageCount} msgs
                        </span>
                      </div>
                      <p className="mt-3 text-[11px] font-medium text-[var(--muted)]">
                        {isLoadingSession ? "Opening..." : formatHistoryDate(historySession.lastMessageAt ?? historySession.updatedAt)}
                      </p>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--card-border)] p-6 text-center">
                <Clock3 size={24} className="mb-3 text-[var(--muted)]" />
                <p className="text-sm font-semibold text-[var(--ink)]">No coach history yet</p>
                <p className="mt-1 max-w-sm text-xs leading-relaxed text-[var(--muted)]">
                  Send a message in Coach after running the migration, then it will appear here.
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col h-[500px] app-card overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            {messages.map((m, i) => (
              <div key={i} className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    m.role === "user"
                      ? "bg-[var(--accent-soft)] text-[var(--accent-strong)] dark:text-[var(--accent-bright)]"
                      : "bg-[color-mix(in_srgb,var(--ink)_8%,transparent)] text-[var(--accent)]"
                  }`}
                >
                  {m.role === "user" ? <User size={16} /> : <BrainCircuit size={16} />}
                </div>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                    m.role === "user"
                      ? "bg-[var(--accent)] text-white shadow-sm shadow-blue-600/15"
                      : "bg-[color-mix(in_srgb,var(--ink)_6%,transparent)] text-[var(--ink)] ring-1 ring-[var(--card-border)]"
                  }`}
                >
                  {m.images?.length ? (
                    <div className={`flex flex-wrap gap-2 ${m.content ? "mb-3" : ""}`}>
                      {m.images.map((image, imageIndex) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={`${image.slice(0, 24)}-${imageIndex}`}
                          src={image}
                          alt={`Uploaded photo ${imageIndex + 1}`}
                          className="max-h-40 rounded-xl object-cover ring-1 ring-white/20"
                        />
                      ))}
                    </div>
                  ) : null}
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.content}</p>
                    {m.role === "assistant" ? (
                      <button
                        type="button"
                        onClick={() => {
                          clearSpeechError();
                          if (isSpeaking && speakingMessageIndex === i) {
                            stopSpeech();
                            return;
                          }
                          void speak(m.content, { messageIndex: i });
                        }}
                        disabled={isLoadingSpeech && speakingMessageIndex === i}
                        className="shrink-0 rounded-lg p-1.5 text-[var(--muted)] transition hover:bg-[color-mix(in_srgb,var(--ink)_8%,transparent)] hover:text-[var(--ink)] disabled:opacity-50"
                        title={
                          isSpeaking && speakingMessageIndex === i
                            ? "Stop reading"
                            : "Read this message aloud"
                        }
                        aria-label={
                          isSpeaking && speakingMessageIndex === i
                            ? "Stop reading"
                            : "Read this message aloud"
                        }
                      >
                        {isLoadingSpeech && speakingMessageIndex === i ? (
                          <LoaderCircle size={15} className="animate-spin" />
                        ) : isSpeaking && speakingMessageIndex === i ? (
                          <VolumeX size={15} />
                        ) : (
                          <Volume2 size={15} />
                        )}
                      </button>
                    ) : null}
                  </div>
                  {m.spotlight ? <TransactionSpotlightCard spotlight={m.spotlight} /> : null}
                  {m.goalSuggestion ? <GoalSuggestionCard suggestion={m.goalSuggestion} /> : null}
                </div>
              </div>
            ))}
            {isLoading ? (
              <div className="flex gap-3 flex-row">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 bg-[color-mix(in_srgb,var(--ink)_8%,transparent)] text-[var(--accent)]">
                  <BrainCircuit size={16} />
                </div>
                <div className="bg-[color-mix(in_srgb,var(--ink)_6%,transparent)] ring-1 ring-[var(--card-border)] text-[var(--ink)] rounded-2xl px-4 py-3 flex items-center gap-1">
                  <div className="w-1.5 h-1.5 bg-[var(--muted)] rounded-full animate-bounce" />
                  <div
                    className="w-1.5 h-1.5 bg-[var(--muted)] rounded-full animate-bounce"
                    style={{ animationDelay: "0.1s" }}
                  />
                  <div
                    className="w-1.5 h-1.5 bg-[var(--muted)] rounded-full animate-bounce"
                    style={{ animationDelay: "0.2s" }}
                  />
                </div>
              </div>
            ) : null}
          </div>

          {speechError ? (
            <p className="border-t border-[var(--card-border)] px-4 py-2 text-xs text-rose-600 dark:text-rose-300">
              {speechError}
            </p>
          ) : null}

          <ChatComposer
            value={input}
            onChange={setInput}
            pendingImages={pendingImages}
            onPendingImagesChange={setPendingImages}
            onSubmit={() => {
              void sendMessage();
            }}
            disabled={isLoading}
            isLoading={isLoading}
          />
        </div>
      )}
    </div>
  );
}
