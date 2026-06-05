import { prisma } from "./prisma";

// Set a daily limit of API calls to prevent runaway scripts from racking up charges
const DAILY_LIMIT = 50;

export async function checkPlaidLimit() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const count = await prisma.plaidApiLog.count({
    where: {
      createdAt: { gte: today },
    },
  });

  if (count >= DAILY_LIMIT) {
    console.error(`[PLAID TRACKER] Daily limit of ${DAILY_LIMIT} exceeded! Blocked API call to save money.`);
    throw new Error(`Plaid daily API limit of ${DAILY_LIMIT} exceeded. This safety measure prevents unexpected charges. Contact support or increase the limit in code.`);
  }
}

export async function logPlaidCall(endpoint: string, userId?: string) {
  try {
    await prisma.plaidApiLog.create({
      data: {
        endpoint,
        userId: userId || null,
      },
    });
    console.log(`[PLAID TRACKER] Logged ${endpoint} call for user ${userId || "unknown"}`);
  } catch (err) {
    console.error("[PLAID TRACKER] Failed to log Plaid call:", err);
  }
}

/**
 * A wrapper to track and protect any Plaid API call.
 */
export async function withPlaidTracking<T>(
  endpoint: string,
  userId: string | undefined,
  apiCall: () => Promise<T>
): Promise<T> {
  await checkPlaidLimit();
  
  // Call the actual Plaid API
  const result = await apiCall();
  
  // Only log if it succeeds
  await logPlaidCall(endpoint, userId);
  
  return result;
}
