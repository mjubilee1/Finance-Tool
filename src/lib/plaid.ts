import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  CountryCode,
} from "plaid";
import { getPlaidConfig } from "./env";

const { clientId, secret, env } = getPlaidConfig();

const plaidEnv =
  env === "production"
    ? PlaidEnvironments.production
    : env === "development"
      ? PlaidEnvironments.development
      : PlaidEnvironments.sandbox;

export const plaidClient = new PlaidApi(
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

export const plaidProducts = [Products.Transactions];
export const plaidCountryCodes = [CountryCode.Us];
