"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type ThemeMode } from "@/components/providers/theme-provider";

const LABELS: Record<ThemeMode, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, resolvedTheme, toggleLightDark, setTheme } = useTheme();

  if (compact) {
    const Icon = resolvedTheme === "dark" ? Moon : Sun;
    return (
      <button
        type="button"
        onClick={toggleLightDark}
        className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs sm:text-sm font-semibold text-[var(--ink-soft)] app-card hover:brightness-105 transition"
        title={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
        aria-label={`Currently ${resolvedTheme}. Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode.`}
      >
        <Icon size={16} />
        <span className="hidden sm:inline capitalize">{resolvedTheme}</span>
      </button>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-1 rounded-xl bg-[var(--accent-soft)] p-1 ring-1 ring-[var(--card-border)]">
      {(
        [
          { id: "light", icon: Sun, label: "Light" },
          { id: "dark", icon: Moon, label: "Dark" },
          { id: "system", icon: Monitor, label: "Auto" },
        ] as const
      ).map(({ id, icon: Icon, label }) => {
        const active = theme === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setTheme(id)}
            className={`inline-flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition ${
              active
                ? "bg-[var(--card-solid)] text-[var(--ink)] shadow-sm"
                : "text-[var(--muted)] hover:text-[var(--ink)]"
            }`}
            aria-pressed={active}
          >
            <Icon size={13} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
