"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const PlaidOAuthHandler = dynamic(
  () => import("./plaid-oauth-handler").then((m) => m.PlaidOAuthHandler),
  { ssr: false },
);

function hasOAuthStateInUrl() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("oauth_state_id");
}

/**
 * Only download react-plaid-link when returning from a Plaid OAuth redirect.
 * Normal dashboard boots skip that dependency entirely.
 */
export function LazyPlaidOAuthHandler() {
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    if (hasOAuthStateInUrl()) {
      setShouldLoad(true);
    }
  }, []);

  if (!shouldLoad) return null;
  return <PlaidOAuthHandler />;
}
