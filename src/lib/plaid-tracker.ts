import { prisma } from "./prisma";

export async function getCurrentPlaidUsage() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const totalCalls = await prisma.plaidApiLog.count({
    where: {
      createdAt: { gte: today },
    },
  });

  return {
    totalCalls,
  };
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
  // Call the actual Plaid API
  const result = await apiCall();
  
  // Only log if it succeeds
  await logPlaidCall(endpoint, userId);
  
  return result;
}
