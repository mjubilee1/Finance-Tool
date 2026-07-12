"use client";

import { usePlaidLink } from "react-plaid-link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { storePlaidLinkToken } from "./plaid-oauth-handler";

type ReauthBankButtonProps = {
  plaidItemId: string;
  institutionName?: string | null;
  onReauthComplete?: () => void;
  className?: string;
  label?: string;
};

export function ReauthBankButton({
  plaidItemId,
  institutionName,
  onReauthComplete,
  className,
  label,
}: ReauthBankButtonProps) {
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plaidItemId }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Could not start bank reconnection.");
      }
      const token = data.link_token as string;
      setLinkToken(token);
      storePlaidLinkToken(token, { updateMode: true, plaidItemId });
      return token;
    } finally {
      setLoading(false);
    }
  }, [linkToken, plaidItemId]);

  const onSuccess = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/plaid/complete-item-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plaidItemId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "Failed to restore bank connection.");
      }

      onReauthComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restore bank connection.");
    } finally {
      setLoading(false);
    }
  }, [onReauthComplete, plaidItemId]);

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
      setError(err instanceof Error ? err.message : "Could not start bank reconnection.");
    }
  };

  const disabled = loading || (Boolean(linkToken) && !ready);
  const buttonLabel = label ?? `Reconnect ${institutionName ?? "bank"}`;

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={handleOpen}
        disabled={disabled}
        className={cn(
          "inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
        {buttonLabel}
      </button>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
