import "server-only";

import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  CountryCode,
} from "plaid";
import { getPlaidConfig } from "./env";

let plaidClientInstance: PlaidApi | null = null;

function createPlaidClient() {
  const { clientId, secret, env } = getPlaidConfig();

  const plaidEnv =
    env === "production"
      ? PlaidEnvironments.production
      : env === "development"
        ? PlaidEnvironments.development
        : PlaidEnvironments.sandbox;

  return new PlaidApi(
    new Configuration({
      basePath: plaidEnv,
      baseOptions: {
        headers: {
          "PLAID-CLIENT-ID": clientId,
          "PLAID-SECRET": secret,
        },
      },
    }),
  );
}

/** Lazy client so Next build can collect route data without Plaid secrets. */
export function getPlaidClient() {
  if (!plaidClientInstance) {
    plaidClientInstance = createPlaidClient();
  }
  return plaidClientInstance;
}

/** @deprecated Prefer getPlaidClient() — kept for existing imports. */
export const plaidClient = new Proxy({} as PlaidApi, {
  get(_target, prop, receiver) {
    const instance = getPlaidClient();
    const value = Reflect.get(instance, prop, receiver);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

export const plaidProducts = [Products.Transactions];
export const plaidCountryCodes = [CountryCode.Us];
