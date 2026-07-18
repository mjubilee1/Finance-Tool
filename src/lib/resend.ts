import "server-only";

import { Resend } from "resend";

let client: Resend | null = null;

function getApiKey() {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "RESEND_API_KEY is missing. Add it to the environment and restart the server.",
    );
  }
  return key;
}

/** Lazy client so Next build can collect route data without a Resend key. */
export function getResend() {
  if (!client) {
    client = new Resend(getApiKey());
  }
  return client;
}
