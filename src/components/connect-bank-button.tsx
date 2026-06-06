"use client";

import { usePlaidLink, type PlaidLinkOnSuccessMetadata } from "react-plaid-link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type ConnectBankButtonProps = {
  onLinked?: () => void;
  className?: string;
};

export function ConnectBankButton({ onLinked, className }: ConnectBankButtonProps) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const shouldOpenLinkRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLinkToken = useCallback(async () => {
    if (linkToken) return linkToken;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/plaid/create-link-token", {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Could not start Plaid Link.");
      }
      setLinkToken(data.link_token);
      return data.link_token as string;
    } finally {
      setLoading(false);
    }
  }, [linkToken]);

  const onSuccess = useCallback(
    async (publicToken: string, metadata: PlaidLinkOnSuccessMetadata) => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/plaid/exchange-public-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            public_token: publicToken,
            institution: metadata.institution,
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error ?? "Failed to link account.");
        }

        onLinked?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to link account.");
      } finally {
        setLoading(false);
      }
    },
    [onLinked],
  );

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
  });

  useEffect(() => {
    if (!shouldOpenLinkRef.current || !ready) return;

    open();
    shouldOpenLinkRef.current = false;
  }, [open, ready]);

  const handleOpen = async () => {
    if (loading) return;

    try {
      await fetchLinkToken();
      shouldOpenLinkRef.current = true;

      if (ready) {
        open();
        shouldOpenLinkRef.current = false;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start Plaid Link.");
    }
  };

  const disabled = loading || (Boolean(linkToken) && !ready);

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleOpen}
        disabled={disabled}
        className={cn(
          "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Link2 className="h-4 w-4" />
        )}
        Connect bank account
      </button>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
