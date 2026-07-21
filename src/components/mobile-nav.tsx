"use client";

import { ThemeToggle } from "@/components/theme-toggle";
import {
  isMobilePrimaryTab,
  MOBILE_PRIMARY_TABS,
  NAV_GROUPS,
  NAV_ITEMS,
  type TabType,
} from "@/lib/nav";
import { Ellipsis, RefreshCw, RotateCcw, X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

type MobileBottomNavProps = {
  activeTab: TabType;
  moreOpen: boolean;
  onSelectTab: (tab: TabType) => void;
  onToggleMore: () => void;
};

export function MobileBottomNav({
  activeTab,
  moreOpen,
  onSelectTab,
  onToggleMore,
}: MobileBottomNavProps) {
  const moreActive = moreOpen || !isMobilePrimaryTab(activeTab);

  return (
    <nav
      className="app-shell-bottom-nav md:hidden fixed bottom-0 inset-x-0 z-40"
      aria-label="Primary"
    >
      <div className="grid grid-cols-5 gap-0.5 px-1 pt-1.5 pb-[max(0.35rem,env(safe-area-inset-bottom))]">
        {MOBILE_PRIMARY_TABS.map((tab) => {
          const item = NAV_ITEMS[tab];
          const Icon = item.icon;
          const active = !moreOpen && activeTab === tab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => onSelectTab(tab)}
              className={`flex flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 min-h-[3.25rem] transition-colors ${
                active
                  ? "text-blue-600"
                  : "text-[var(--muted)] hover:text-[var(--ink)]"
              }`}
              aria-current={active ? "page" : undefined}
            >
              <Icon size={20} strokeWidth={active ? 2.25 : 1.75} />
              <span
                className={`text-[10px] leading-tight ${
                  active ? "font-semibold" : "font-medium"
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={onToggleMore}
          className={`flex flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 min-h-[3.25rem] transition-colors ${
            moreActive
              ? "text-blue-600"
              : "text-[var(--muted)] hover:text-[var(--ink)]"
          }`}
          aria-expanded={moreOpen}
          aria-controls="mobile-more-sheet"
        >
          <Ellipsis size={20} strokeWidth={moreActive ? 2.25 : 1.75} />
          <span
            className={`text-[10px] leading-tight ${
              moreActive ? "font-semibold" : "font-medium"
            }`}
          >
            More
          </span>
        </button>
      </div>
    </nav>
  );
}

type MobileMoreSheetProps = {
  open: boolean;
  activeTab: TabType;
  onClose: () => void;
  onSelectTab: (tab: TabType) => void;
  accountsCount: number;
  connectBankSlot: ReactNode;
  syncStatus: "idle" | "loading" | "success" | "error";
  syncFeedback: ReactNode;
  onSync: () => void;
  onReload: () => void;
  userLabel: string;
  onSignOut: () => void;
  versionSlot: ReactNode;
};

export function MobileMoreSheet({
  open,
  activeTab,
  onClose,
  onSelectTab,
  accountsCount,
  connectBankSlot,
  syncStatus,
  syncFeedback,
  onSync,
  onReload,
  userLabel,
  onSignOut,
  versionSlot,
}: MobileMoreSheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const secondaryGroups = NAV_GROUPS.filter((g) => g.id !== "daily");

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-sm md:hidden"
        onClick={onClose}
        aria-hidden
      />
      <div
        id="mobile-more-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="More destinations"
        className="app-shell-more-sheet md:hidden fixed inset-x-0 bottom-0 z-50 flex max-h-[min(88dvh,40rem)] flex-col rounded-t-2xl animate-[more-sheet-in_180ms_ease-out]"
      >
        <div className="flex justify-center pt-2.5 pb-1 shrink-0" aria-hidden>
          <span className="h-1 w-10 rounded-full bg-[color-mix(in_srgb,var(--ink)_18%,transparent)]" />
        </div>
        <div className="flex items-center justify-between px-4 pt-1 pb-2 shrink-0">
          <div className="min-w-0">
            <p className="app-display text-lg text-[var(--ink)] leading-none">More</p>
            <p className="text-[11px] text-[var(--muted)] mt-1">
              Money, life, and app tools
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]"
            aria-label="Close more menu"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-[max(1rem,calc(env(safe-area-inset-bottom)+0.5rem))] space-y-4">
          {secondaryGroups.map((group) => (
            <section key={group.id}>
              <p className="app-label px-2 mb-1.5">{group.label}</p>
              <div className="grid grid-cols-2 gap-1.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = activeTab === item.tab;
                  return (
                    <button
                      key={item.tab}
                      type="button"
                      onClick={() => onSelectTab(item.tab)}
                      className={`flex items-center gap-2.5 rounded-xl px-3 py-3 text-left text-sm transition-colors ${
                        active
                          ? "app-nav-active"
                          : "bg-[color-mix(in_srgb,var(--card-solid)_70%,transparent)] text-[var(--ink-soft)] ring-1 ring-[var(--card-border)] hover:text-[var(--ink)]"
                      }`}
                    >
                      <Icon
                        size={18}
                        className={active ? "text-blue-600 shrink-0" : "text-[var(--muted)] shrink-0"}
                      />
                      <span className={active ? "font-semibold" : "font-medium"}>
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}

          <section>
            <p className="app-label px-2 mb-1.5">Accounts</p>
            <div className="rounded-xl ring-1 ring-[var(--card-border)] bg-[color-mix(in_srgb,var(--card-solid)_70%,transparent)] p-3 space-y-2">
              <p className="text-sm font-medium text-[var(--ink)] px-0.5">
                {accountsCount > 0
                  ? `${accountsCount} accounts linked`
                  : "No banks linked yet"}
              </p>
              <div className="flex flex-col gap-2">
                {connectBankSlot}
                {accountsCount > 0 ? (
                  <button
                    type="button"
                    onClick={onSync}
                    disabled={syncStatus === "loading"}
                    className="inline-flex items-center justify-center gap-2 rounded-xl app-btn-primary px-3 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <RefreshCw
                      size={16}
                      className={syncStatus === "loading" ? "animate-spin" : ""}
                    />
                    {syncStatus === "loading" ? "Syncing..." : "Sync transactions"}
                  </button>
                ) : null}
              </div>
              {syncFeedback}
            </div>
          </section>

          <section>
            <p className="app-label px-2 mb-1.5">App</p>
            <div className="space-y-2">
              <div className="rounded-xl ring-1 ring-[var(--card-border)] bg-[color-mix(in_srgb,var(--card-solid)_70%,transparent)] p-3">
                <p className="app-label mb-1.5">Theme</p>
                <ThemeToggle />
              </div>
              <button
                type="button"
                onClick={onReload}
                className="w-full flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-[var(--ink)] bg-[var(--card-solid)] ring-1 ring-[var(--card-border)]"
              >
                <RotateCcw size={16} />
                Reload app
              </button>
              <div className="flex items-center justify-between px-2 pt-1">
                <span className="text-sm font-medium text-[var(--ink-soft)] truncate pr-2">
                  {userLabel}
                </span>
                <button
                  type="button"
                  onClick={onSignOut}
                  className="text-xs text-[var(--muted)] hover:text-[var(--ink)] transition"
                >
                  Sign out
                </button>
              </div>
              <div className="px-2 text-center">{versionSlot}</div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
