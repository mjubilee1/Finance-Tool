import { z } from "zod";

const envSchema = z.object({
  PLAID_CLIENT_ID: z.string().min(1),
  PLAID_ENV: z.enum(["sandbox", "development", "production"]).default("sandbox"),
  PLAID_SECRET: z.string().min(1).optional(),
  PLAID_TEST_SECRET: z.string().min(1).optional(),
  PLAID_PROD_SECRET: z.string().min(1).optional(),
  PLAID_DAILY_BALANCE_CALL_LIMIT: z.preprocess(
    (value) => (value === undefined || value === "" ? undefined : value),
    // Default 4: ~2 manual refreshes/day with Chase + Capital One (1 call per item).
    // Set to 0 only if you intentionally want unlimited Balance API calls.
    z.coerce.number().int().min(0).default(4),
  ),
  // Server-side gate so clients cannot spam paid /accounts/balance/get.
  PLAID_BALANCE_COOLDOWN_MINUTES: z.preprocess(
    (value) => (value === undefined || value === "" ? undefined : value),
    z.coerce.number().int().min(0).default(30),
  ),
  PLAID_DAILY_SYNC_CALL_LIMIT: z.preprocess(
    (value) => (value === undefined || value === "" ? undefined : value),
    z.coerce.number().int().min(0).default(0),
  ),
  PLAID_SYNC_COOLDOWN_MINUTES: z.preprocess(
    (value) => (value === undefined || value === "" ? undefined : value),
    z.coerce.number().int().min(0).default(0),
  ),
  AI_CHAT_DAILY_LIMIT: z.preprocess(
    (value) => (value === undefined || value === "" ? undefined : value),
    z.coerce.number().int().min(0).default(25),
  ),
  AI_DAILY_MEMORY_LIMIT: z.preprocess(
    (value) => (value === undefined || value === "" ? undefined : value),
    z.coerce.number().int().min(0).default(2),
  ),
  AI_BRIEF_REFRESH_HOURS: z.preprocess(
    (value) => (value === undefined || value === "" ? undefined : value),
    z.coerce.number().int().min(1).default(4),
  ),
  AI_MEMORY_MIN_IMPORTANCE: z.preprocess(
    (value) => (value === undefined || value === "" ? undefined : value),
    z.coerce.number().min(0).max(10).default(8),
  ),
  ENABLE_PINECONE_MEMORY: z.preprocess(
    (value) => value === "true" || value === true,
    z.boolean().default(false),
  ),
  CRON_SECRET: z.string().min(1).optional(),
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
    dailyBalanceCallLimit: parsed.PLAID_DAILY_BALANCE_CALL_LIMIT,
    balanceCooldownMinutes: parsed.PLAID_BALANCE_COOLDOWN_MINUTES,
    dailySyncCallLimit: parsed.PLAID_DAILY_SYNC_CALL_LIMIT,
    syncCooldownMinutes: parsed.PLAID_SYNC_COOLDOWN_MINUTES,
  };
}

export function getCostControlConfig() {
  const parsed = envSchema.parse(process.env);
  return {
    aiChatDailyLimit: parsed.AI_CHAT_DAILY_LIMIT,
    aiDailyMemoryLimit: parsed.AI_DAILY_MEMORY_LIMIT,
    aiBriefRefreshHours: parsed.AI_BRIEF_REFRESH_HOURS,
    aiMemoryMinImportance: parsed.AI_MEMORY_MIN_IMPORTANCE,
    enablePineconeMemory: parsed.ENABLE_PINECONE_MEMORY,
    cronSecret: parsed.CRON_SECRET,
  };
}
