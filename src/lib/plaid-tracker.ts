import { prisma } from "./prisma";

function getStartOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

export async function getCurrentPlaidUsage() {
  const totalCalls = await prisma.plaidApiLog.count({
    where: {
      createdAt: { gte: getStartOfToday() },
    },
  });

  return {
    totalCalls,
  };
}

export async function getDailyPlaidEndpointCalls(endpoint: string, userId?: string) {
  return prisma.plaidApiLog.count({
    where: {
      endpoint,
      userId: userId ?? null,
      createdAt: { gte: getStartOfToday() },
    },
  });
}

export async function getLatestPlaidEndpointCall(endpoint: string, userId?: string) {
  return prisma.plaidApiLog.findFirst({
    where: {
      endpoint,
      userId: userId ?? null,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function isPlaidEndpointDailyLimitReached(
  endpoint: string,
  userId: string | undefined,
  limit: number,
) {
  // 0 or negative = unlimited (no cap)
  if (limit <= 0) return false;

  const callsToday = await getDailyPlaidEndpointCalls(endpoint, userId);
  return callsToday >= limit;
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
