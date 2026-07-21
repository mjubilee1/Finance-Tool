"use client";

import {
  BrainCircuit,
  Car,
  Cpu,
  Flame,
  LayoutDashboard,
  MapPin,
  MoreHorizontal,
  Receipt,
  Repeat,
  Target,
  TrendingUp,
  Utensils,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, type ReactNode } from "react";

export type TabType =
  | "chat"
  | "overview"
  | "accounts"
  | "transactions"
  | "recurring"
  | "projections"
  | "goals"
  | "growth"
  | "tech"
  | "dmv"
  | "car"
  | "calories";

export type NavItem = {
  tab: TabType;
  label: string;
  Icon: LucideIcon;
};

export type NavSection = {
  id: string;
  label: string;
  items: NavItem[];
};

/** Primary destinations — daily loop + goals. Shown in the mobile bottom bar. */
export const PRIMARY_NAV: NavItem[] = [
  { tab: "overview", label: "Overview", Icon: LayoutDashboard },
  { tab: "chat", label: "Coach", Icon: BrainCircuit },
  { tab: "growth", label: "Growth", Icon: Flame },
  { tab: "goals", label: "Goals", Icon: Target },
];

/** Secondary destinations — grouped for sidebar + More sheet. */
export const NAV_SECTIONS: NavSection[] = [
  {
    id: "daily",
    label: "Daily",
    items: PRIMARY_NAV,
  },
  {
    id: "life",
    label: "Life",
    items: [
      { tab: "calories", label: "Calories", Icon: Utensils },
      { tab: "tech", label: "Tech", Icon: Cpu },
      { tab: "dmv", label: "DMV", Icon: MapPin },
    ],
  },
  {
    id: "money",
    label: "Money",
    items: [
      { tab: "accounts", label: "Accounts", Icon: Wallet },
      { tab: "transactions", label: "Transactions", Icon: Receipt },
      { tab: "recurring", label: "Recurring", Icon: Repeat },
      { tab: "projections", label: "Projections", Icon: TrendingUp },
      { tab: "car", label: "Car", Icon: Car },
    ],
  },
];

const ALL_NAV_ITEMS = NAV_SECTIONS.flatMap((section) => section.items);

export function getTabLabel(tab: TabType): string {
  return ALL_NAV_ITEMS.find((item) => item.tab === tab)?.label ?? tab;
}

export function isPrimaryTab(tab: TabType): boolean {
  return PRIMARY_NAV.some((item) => item.tab === tab);
}

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
  const moreActive = moreOpen || !isPrimaryTab(activeTab);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 md:hidden app-mobile-tabbar"
      aria-label="Primary"
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around px-1 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {PRIMARY_NAV.map(({ tab, label, Icon }) => {
          const active = !moreOpen && activeTab === tab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => onSelectTab(tab)}
              className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 transition-colors ${
                active
                  ? "text-[var(--accent-strong)]"
                  : "text-[var(--muted)] active:text-[var(--ink)]"
              }`}
              aria-current={active ? "page" : undefined}
            >
              <Icon size={20} strokeWidth={active ? 2.25 : 1.75} />
              <span className={`truncate text-[10px] font-semibold tracking-wide ${active ? "text-[var(--ink)]" : ""}`}>
                {label}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={onToggleMore}
          className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 transition-colors ${
            moreActive
              ? "text-[var(--accent-strong)]"
              : "text-[var(--muted)] active:text-[var(--ink)]"
          }`}
          aria-expanded={moreOpen}
          aria-controls="mobile-more-sheet"
        >
          <MoreHorizontal size={20} strokeWidth={moreActive ? 2.25 : 1.75} />
          <span className={`truncate text-[10px] font-semibold tracking-wide ${moreActive ? "text-[var(--ink)]" : ""}`}>
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
  footer: ReactNode;
};

export function MobileMoreSheet({
  open,
  activeTab,
  onClose,
  onSelectTab,
  footer,
}: MobileMoreSheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const secondarySections = NAV_SECTIONS.filter((section) => section.id !== "daily");

  return (
    <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="More">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/35 backdrop-blur-[2px]"
        aria-label="Close menu"
        onClick={onClose}
      />
      <div
        id="mobile-more-sheet"
        className="app-more-sheet absolute inset-x-0 bottom-0 max-h-[min(88vh,40rem)] overflow-y-auto rounded-t-2xl app-shell-sidebar shadow-[0_-8px_32px_rgba(11,18,32,0.18)]"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--card-border)] bg-[var(--sidebar)] px-4 py-3">
          <div>
            <p className="app-display text-base text-[var(--ink)]">More</p>
            <p className="text-[11px] text-[var(--muted)]">Life, money, and settings</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-[var(--muted)] hover:bg-[var(--accent-soft)]"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-5 px-3 py-4">
          {secondarySections.map((section) => (
            <div key={section.id}>
              <p className="app-label mb-1.5 px-2">{section.label}</p>
              <div className="grid grid-cols-2 gap-1.5">
                {section.items.map(({ tab, label, Icon }) => {
                  const active = activeTab === tab;
                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => {
                        onSelectTab(tab);
                        onClose();
                      }}
                      className={`flex items-center gap-2.5 rounded-xl px-3 py-3 text-left text-sm transition-colors ${
                        active
                          ? "app-nav-active"
                          : "text-[var(--ink-soft)] hover:bg-[var(--accent-soft)]"
                      }`}
                    >
                      <Icon
                        size={18}
                        className={active ? "text-[var(--accent-strong)]" : "text-[var(--muted)]"}
                      />
                      <span className="font-medium">{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="border-t border-[var(--card-border)] pt-4">{footer}</div>
        </div>
      </div>
    </div>
  );
}

type SidebarNavProps = {
  activeTab: TabType;
  onSelectTab: (tab: TabType) => void;
};

export function SidebarNav({ activeTab, onSelectTab }: SidebarNavProps) {
  return (
    <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-2">
      {NAV_SECTIONS.map((section) => (
        <div key={section.id}>
          <p className="app-label mb-1 px-2">{section.label}</p>
          <div className="space-y-0.5">
            {section.items.map(({ tab, label, Icon }) => (
              <button
                key={tab}
                type="button"
                onClick={() => onSelectTab(tab)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all ${
                  activeTab === tab
                    ? "app-nav-active"
                    : "text-slate-600 hover:bg-blue-50/60 hover:text-slate-900"
                }`}
              >
                <Icon
                  size={18}
                  className={activeTab === tab ? "text-blue-600" : "text-slate-400"}
                />
                {label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}
