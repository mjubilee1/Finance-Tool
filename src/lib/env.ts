import { z } from "zod";

const envSchema = z.object({
  PLAID_CLIENT_ID: z.string().min(1),
  PLAID_ENV: z.enum(["sandbox", "development", "production"]).default("sandbox"),
  PLAID_SECRET: z.string().min(1).optional(),
  PLAID_TEST_SECRET: z.string().min(1).optional(),
  PLAID_PROD_SECRET: z.string().min(1).optional(),
});

function resolveSecret(parsed: z.infer<typeof envSchema>): string {
  if (parsed.PLAID_SECRET) return parsed.PLAID_SECRET;

  if (parsed.PLAID_ENV === "production") {
    if (!parsed.PLAID_PROD_SECRET) {
      throw new Error("Set PLAID_PROD_SECRET or PLAID_SECRET for production.");
    }
    return parsed.PLAID_PROD_SECRET;
  }

  if (!parsed.PLAID_TEST_SECRET) {
    throw new Error("Set PLAID_TEST_SECRET or PLAID_SECRET for sandbox/development.");
  }
  return parsed.PLAID_TEST_SECRET;
}

export function getPlaidConfig() {
  const parsed = envSchema.parse(process.env);
  return {
    clientId: parsed.PLAID_CLIENT_ID,
    secret: resolveSecret(parsed),
    env: parsed.PLAID_ENV,
  };
}
