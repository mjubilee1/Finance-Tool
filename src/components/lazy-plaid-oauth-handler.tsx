"use client";

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";

const PlaidOAuthHandler = dynamic(
  () => import("./plaid-oauth-handler").then((m) => m.PlaidOAuthHandler),
  { ssr: false },
);

function subscribeToUrl() {
  // oauth_state_id is only present on initial load after a Plaid redirect;
  // no live subscription needed beyond the first client snapshot.
  return () => {};
}

function getOAuthSnapshot() {
  return new URLSearchParams(window.location.search).has("oauth_state_id");
}

function getServerSnapshot() {
  return false;
}

/**
 * Only download react-plaid-link when returning from a Plaid OAuth redirect.
 * Normal dashboard boots skip that dependency entirely.
 */
export function LazyPlaidOAuthHandler() {
  const shouldLoad = useSyncExternalStore(subscribeToUrl, getOAuthSnapshot, getServerSnapshot);
  if (!shouldLoad) return null;
  return <PlaidOAuthHandler />;
}
