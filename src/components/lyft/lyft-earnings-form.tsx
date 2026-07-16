"use client";

import { formatCurrency } from "@/lib/format";

type Props = {
  amount: string;
  dailyTarget: number;
  onAmountChange: (value: string) => void;
  onSave: () => void;
  onSkipAmount: () => void;
  onCancel: () => void;
  busy: boolean;
  /** Compact layout when embedded on the Lyft pace card. */
  embedded?: boolean;
};

export function LyftEarningsForm({
  amount,
  dailyTarget,
  onAmountChange,
  onSave,
  onSkipAmount,
  onCancel,
  busy,
  embedded = false,
}: Props) {
  const parsed = Number(amount);
  const canSave =
    amount.trim() !== "" && Number.isFinite(parsed) && parsed >= 0;

  return (
    <div
      className={`space-y-2 rounded-xl bg-[var(--accent-soft)] p-3 ring-1 ring-[color-mix(in_srgb,var(--accent)_30%,transparent)] ${
        embedded ? "" : "mt-2"
      }`}
    >
      <p className="text-xs font-semibold text-[var(--ink)]">Lyft gross earnings</p>
      <p className="text-[11px] leading-snug text-[var(--muted)]">
        Enter the dollar amount Lyft paid you before the weekly fee. Daily target ≈{" "}
        {formatCurrency(dailyTarget)} toward $200–$400/week profit.
      </p>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step="0.01"
        value={amount}
        onChange={(e) => onAmountChange(e.target.value)}
        placeholder="e.g. 95.00"
        autoFocus={embedded}
        aria-label="Lyft gross earnings amount"
        className="w-full rounded-lg bg-[var(--card-solid)] px-3 py-2 text-sm text-[var(--ink)] ring-1 ring-[var(--card-border)] outline-none focus:ring-[var(--accent)]"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={busy || !canSave}
          className="rounded-full bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
        >
          Save earnings &amp; done
        </button>
        <button
          type="button"
          onClick={onSkipAmount}
          disabled={busy}
          className="rounded-full bg-[color-mix(in_srgb,var(--ink)_8%,transparent)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] ring-1 ring-[var(--card-border)]"
        >
          Mark done without $
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-full bg-[color-mix(in_srgb,var(--ink)_8%,transparent)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] ring-1 ring-[var(--card-border)]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
