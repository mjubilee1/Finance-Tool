"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Landmark, Loader2, LogOut, Palette, X } from "lucide-react";
import { useEffect, useState } from "react";
import { AppVersion } from "@/components/app-version";
import { ConnectBankButton } from "@/components/connect-bank-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { syncFeedbackClassName, type SyncFeedbackTone } from "@/lib/sync-messages";

type CalendarStatus = {
  connected: boolean;
  connectAvailable: boolean;
  status: "active" | "needs_reconnect" | "not_connected";
  connectedAt: string | null;
  lastSyncAt: string | null;
  error?: string;
};

type SettingsViewProps = {
  userName?: string | null;
  userEmail?: string | null;
  accountsCount: number;
  syncStatus: "idle" | "loading" | "success" | "error";
  syncFeedback: { tone: SyncFeedbackTone; message: string } | null;
  onBankLinked: () => void;
  onSync: () => void;
  onSignOut: () => void;
  onClose: () => void;
};

function calendarCopy(calendar: CalendarStatus) {
  if (calendar.status === "active") {
    return {
      title: "Google Calendar connected",
      body: "Coach can read your day and create events. Reconnect only if Google asks again.",
    };
  }
  if (calendar.status === "needs_reconnect") {
    return {
      title: "Google Calendar needs reconnect",
      body: "Saved credentials expired or can’t be used. Reconnect once — after publishing the OAuth app, this should last.",
    };
  }
  return {
    title: "Google Calendar not connected",
      body: "Connect so Today and Coach can use your real calendar.",
  };
}

export function SettingsView({
  userName,
  userEmail,
  accountsCount,
  syncStatus,
  syncFeedback,
  onBankLinked,
  onSync,
  onSignOut,
  onClose,
}: SettingsViewProps) {
  const queryClient = useQueryClient();
  const [connectMessage, setConnectMessage] = useState<string | null>(null);

  const calendarQuery = useQuery({
    queryKey: ["google-calendar-status"],
    queryFn: async () => {
      const res = await fetch("/api/integrations/google-calendar");
      if (!res.ok) throw new Error("Could not load calendar status");
      return res.json() as Promise<CalendarStatus>;
    },
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("google_calendar");
    if (!status) return;

    const reason = params.get("google_calendar_reason");
    if (status === "connected") {
      setConnectMessage("Google Calendar connected. Coach can create events now.");
      void queryClient.invalidateQueries({ queryKey: ["google-calendar-status"] });
      void queryClient.invalidateQueries({ queryKey: ["overview-today"] });
    } else {
      setConnectMessage(
        reason === "state"
          ? "OAuth session expired or cookies were blocked. Try Connect again."
          : reason === "denied"
            ? "Google access was denied."
            : reason === "exchange"
              ? "Google token exchange failed. Check GOOGLE_CLIENT_SECRET and redirect URI on Vercel."
              : "Google Calendar connection failed. Try Connect again.",
      );
    }

    params.delete("google_calendar");
    params.delete("google_calendar_reason");
    const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
    window.history.replaceState({}, "", next);
  }, [queryClient]);

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/integrations/google-calendar", { method: "DELETE" });
      if (!res.ok) throw new Error("Could not disconnect calendar");
    },
    onSuccess: async () => {
      setConnectMessage("Google Calendar disconnected.");
      await queryClient.invalidateQueries({ queryKey: ["google-calendar-status"] });
      await queryClient.invalidateQueries({ queryKey: ["overview-today"] });
    },
  });

  const calendar = calendarQuery.data;
  const copy = calendar ? calendarCopy(calendar) : null;
  const needsAction =
    calendar?.status === "needs_reconnect" || calendar?.status === "not_connected";

  return (
    <div className="mx-auto w-full max-w-xl space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="app-label text-[var(--accent-strong)] mb-1">App</p>
          <h1 className="app-display text-2xl text-[var(--ink)]">Settings</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Connections, theme, and account — one place.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl p-2 text-[var(--muted)] hover:bg-[var(--accent-soft)]"
          aria-label="Close settings"
        >
          <X size={20} />
        </button>
      </div>

      {connectMessage ? (
        <div
          className={`rounded-xl px-4 py-3 text-sm ring-1 ${
            connectMessage.startsWith("Google Calendar connected")
              ? "bg-teal-500/15 text-teal-950 ring-teal-400/35 dark:text-teal-100"
              : "bg-amber-500/15 text-amber-950 ring-amber-400/35 dark:text-amber-100"
          }`}
        >
          {connectMessage}
        </div>
      ) : null}

      <section className="app-card space-y-3 p-4">
        <div className="flex items-center gap-2">
          <CalendarDays size={18} className="text-[var(--accent-strong)]" />
          <h2 className="text-sm font-semibold text-[var(--ink)]">Google Calendar</h2>
        </div>
        {calendarQuery.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-[var(--muted)]">
            <Loader2 size={14} className="animate-spin" />
            Checking connection…
          </p>
        ) : calendar && copy ? (
          <>
            <p className="text-sm font-medium text-[var(--ink)]">{copy.title}</p>
            <p className="text-xs leading-relaxed text-[var(--muted)]">{copy.body}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => window.location.assign("/api/integrations/google-calendar/connect")}
                disabled={!calendar.connectAvailable}
                className="app-btn-primary rounded-full px-3.5 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-60"
              >
                {needsAction
                  ? calendar.status === "needs_reconnect"
                    ? "Reconnect"
                    : "Connect"
                  : "Reconnect"}
              </button>
              {calendar.status !== "not_connected" ? (
                <button
                  type="button"
                  onClick={() => disconnectMutation.mutate()}
                  disabled={disconnectMutation.isPending}
                  className="rounded-full px-3.5 py-2 text-xs font-semibold text-[var(--ink-soft)] ring-1 ring-[var(--card-border)] hover:bg-[var(--accent-soft)] disabled:opacity-60"
                >
                  Disconnect
                </button>
              ) : null}
            </div>
            {!calendar.connectAvailable ? (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable this.
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-[var(--muted)]">Couldn’t load calendar status.</p>
        )}
      </section>

      <section className="app-card space-y-3 p-4">
        <div className="flex items-center gap-2">
          <Landmark size={18} className="text-[var(--accent-strong)]" />
          <h2 className="text-sm font-semibold text-[var(--ink)]">Banks</h2>
        </div>
        <p className="text-xs text-[var(--muted)]">
          {accountsCount > 0
            ? `${accountsCount} account${accountsCount === 1 ? "" : "s"} linked. Chase is primary; Capital One is the car/goals bucket.`
            : "Link Chase and Capital One so cash, car bills, and goals stay accurate."}
        </p>
        <ConnectBankButton onLinked={onBankLinked} className="w-full sm:w-auto" />
        {accountsCount > 0 ? (
          <button
            type="button"
            onClick={onSync}
            disabled={syncStatus === "loading"}
            className="app-btn-primary w-full rounded-lg px-3 py-2 text-xs sm:w-auto disabled:opacity-60"
          >
            {syncStatus === "loading" ? "Syncing…" : "Sync transactions"}
          </button>
        ) : null}
        {syncFeedback ? (
          <p className={`text-xs leading-relaxed ${syncFeedbackClassName(syncFeedback.tone)}`}>
            {syncFeedback.message}
          </p>
        ) : null}
      </section>

      <section className="app-card space-y-3 p-4">
        <div className="flex items-center gap-2">
          <Palette size={18} className="text-[var(--accent-strong)]" />
          <h2 className="text-sm font-semibold text-[var(--ink)]">Theme</h2>
        </div>
        <ThemeToggle />
      </section>

      <section className="app-card space-y-3 p-4">
        <h2 className="text-sm font-semibold text-[var(--ink)]">Account</h2>
        <p className="truncate text-sm text-[var(--ink-soft)]">{userName || "User"}</p>
        {userEmail ? <p className="truncate text-xs text-[var(--muted)]">{userEmail}</p> : null}
        <button
          type="button"
          onClick={onSignOut}
          className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-[var(--muted)] ring-1 ring-[var(--card-border)] hover:text-[var(--ink)]"
        >
          <LogOut size={16} />
          Sign out
        </button>
        <AppVersion />
      </section>
    </div>
  );
}
