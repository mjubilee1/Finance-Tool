import {
  BrainCircuit,
  Car,
  Cpu,
  Flame,
  LayoutDashboard,
  MapPin,
  Receipt,
  Repeat,
  Target,
  TrendingUp,
  Utensils,
  Wallet,
  type LucideIcon,
} from "lucide-react";

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
  icon: LucideIcon;
};

export type NavGroup = {
  id: string;
  label: string;
  items: NavItem[];
};

/** Primary destinations — daily loop + goals. Shown in the mobile bottom bar. */
export const MOBILE_PRIMARY_TABS: readonly TabType[] = [
  "overview",
  "chat",
  "growth",
  "goals",
] as const;

export const NAV_ITEMS: Record<TabType, NavItem> = {
  overview: { tab: "overview", label: "Overview", icon: LayoutDashboard },
  chat: { tab: "chat", label: "Coach", icon: BrainCircuit },
  growth: { tab: "growth", label: "Growth", icon: Flame },
  goals: { tab: "goals", label: "Goals", icon: Target },
  accounts: { tab: "accounts", label: "Accounts", icon: Wallet },
  transactions: { tab: "transactions", label: "Transactions", icon: Receipt },
  recurring: { tab: "recurring", label: "Recurring", icon: Repeat },
  projections: { tab: "projections", label: "Projections", icon: TrendingUp },
  car: { tab: "car", label: "Car", icon: Car },
  calories: { tab: "calories", label: "Calories", icon: Utensils },
  tech: { tab: "tech", label: "Tech", icon: Cpu },
  dmv: { tab: "dmv", label: "DMV", icon: MapPin },
};

/** Grouped IA for desktop sidebar + mobile More sheet. */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: "daily",
    label: "Daily",
    items: [
      NAV_ITEMS.overview,
      NAV_ITEMS.chat,
      NAV_ITEMS.growth,
      NAV_ITEMS.goals,
    ],
  },
  {
    id: "money",
    label: "Money",
    items: [
      NAV_ITEMS.accounts,
      NAV_ITEMS.transactions,
      NAV_ITEMS.recurring,
      NAV_ITEMS.projections,
      NAV_ITEMS.car,
    ],
  },
  {
    id: "life",
    label: "Life",
    items: [NAV_ITEMS.calories, NAV_ITEMS.tech, NAV_ITEMS.dmv],
  },
];

export function tabLabel(tab: TabType): string {
  return NAV_ITEMS[tab].label;
}

export function isMobilePrimaryTab(tab: TabType): boolean {
  return (MOBILE_PRIMARY_TABS as readonly string[]).includes(tab);
}
