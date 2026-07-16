"use client";

import { usePlaidLink, type PlaidLinkOnSuccessMetadata } from "react-plaid-link";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

const LINK_TOKEN_STORAGE_KEY = "plaid_link_token";
const LINK_UPDATE_MODE_KEY = "plaid_link_update_mode";
const LINK_UPDATE_ITEM_KEY = "plaid_link_update_item_id";

function hasOAuthStateInUrl() {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.has("oauth_state_id");
}

export function PlaidOAuthHandler() {
  const queryClient = useQueryClient();
  const [isOAuthReturn, setIsOAuthReturn] = useState(false);
  const [linkToken, setLinkToken] = useState<string | null>(null);

  useEffect(() => {
    if (!hasOAuthStateInUrl()) return;

    const storedToken = sessionStorage.getItem(LINK_TOKEN_STORAGE_KEY);
    if (!storedToken) return;

    setIsOAuthReturn(true);
    setLinkToken(storedToken);
  }, []);

  const receivedRedirectUri = useMemo(() => {
    if (!isOAuthReturn || typeof window === "undefined") return undefined;
    return window.location.href;
  }, [isOAuthReturn]);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    receivedRedirectUri,
    onSuccess: async (publicToken: string, metadata: PlaidLinkOnSuccessMetadata) => {
      const updateMode = sessionStorage.getItem(LINK_UPDATE_MODE_KEY) === "true";
      const itemId = sessionStorage.getItem(LINK_UPDATE_ITEM_KEY);

      sessionStorage.removeItem(LINK_TOKEN_STORAGE_KEY);
      sessionStorage.removeItem(LINK_UPDATE_MODE_KEY);
      sessionStorage.removeItem(LINK_UPDATE_ITEM_KEY);

      if (updateMode && itemId) {
        const response = await fetch("/api/plaid/complete-item-update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plaidItemId: itemId }),
        });

        if (!response.ok) {
          throw new Error("Failed to restore bank connection after OAuth redirect.");
        }
      } else {
        const response = await fetch("/api/plaid/exchange-public-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            public_token: publicToken,
            institution: metadata.institution,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to link account after OAuth redirect.");
        }
      }

      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      window.history.replaceState({}, "", window.location.pathname);
    },
    onExit: () => {
      sessionStorage.removeItem(LINK_TOKEN_STORAGE_KEY);
      sessionStorage.removeItem(LINK_UPDATE_MODE_KEY);
      sessionStorage.removeItem(LINK_UPDATE_ITEM_KEY);
      window.history.replaceState({}, "", window.location.pathname);
    },
  });

  useEffect(() => {
    if (!isOAuthReturn || !ready || !linkToken) return;
    open();
  }, [isOAuthReturn, ready, linkToken, open]);

  return null;
}

export function storePlaidLinkToken(linkToken: string, options?: { updateMode?: boolean; plaidItemId?: string }) {
  sessionStorage.setItem(LINK_TOKEN_STORAGE_KEY, linkToken);
  if (options?.updateMode) {
    sessionStorage.setItem(LINK_UPDATE_MODE_KEY, "true");
    if (options.plaidItemId) {
      sessionStorage.setItem(LINK_UPDATE_ITEM_KEY, options.plaidItemId);
    }
  } else {
    sessionStorage.removeItem(LINK_UPDATE_MODE_KEY);
    sessionStorage.removeItem(LINK_UPDATE_ITEM_KEY);
  }
}
