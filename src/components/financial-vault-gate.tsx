"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Lock, Loader2 } from "lucide-react";

type Props = {
  title?: string;
  body?: string;
};

export function FinancialVaultGate({
  title = "Money is locked",
  body = "Enter your vault code to see balances, bills, banks, and money details. Coach won’t pull finances until this is unlocked.",
}: Props) {
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const unlockMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/financial-vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Could not unlock.");
      }
      return data;
    },
    onSuccess: async () => {
      setError(null);
      setCode("");
      await queryClient.invalidateQueries({ queryKey: ["financial-vault"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Wrong code.");
    },
  });

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center px-2 py-10 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-strong)]">
        <Lock size={22} />
      </div>
      <h2 className="app-display text-2xl text-[var(--ink)]">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{body}</p>

      <form
        className="mt-6 w-full space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          unlockMutation.mutate();
        }}
      >
        <label className="sr-only" htmlFor="financial-vault-code">
          Vault code
        </label>
        <input
          id="financial-vault-code"
          type="password"
          autoComplete="current-password"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="Vault code"
          className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-4 py-3 text-center text-base text-[var(--ink)] outline-none ring-[var(--accent-strong)] focus:ring-2"
        />
        <button
          type="submit"
          disabled={!code.trim() || unlockMutation.isPending}
          className="app-btn-primary flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm disabled:opacity-60"
        >
          {unlockMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : null}
          Unlock money
        </button>
      </form>

      {error ? <p className="mt-3 text-sm text-rose-600 dark:text-rose-300">{error}</p> : null}
    </div>
  );
}
