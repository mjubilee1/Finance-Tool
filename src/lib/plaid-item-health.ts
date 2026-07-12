import { prisma } from "@/lib/prisma";
import { isPlaidAccessRevoked, isPlaidLoginRequired, parsePlaidError } from "@/lib/plaid-errors";

export const PLAID_ITEM_STATUS = {
  ACTIVE: "active",
  LOGIN_REQUIRED: "login_required",
  PENDING_EXPIRATION: "pending_expiration",
  REVOKED: "revoked",
  ERROR: "error",
} as const;

export type PlaidItemStatus = (typeof PLAID_ITEM_STATUS)[keyof typeof PLAID_ITEM_STATUS];

export function needsPlaidReauth(status: string) {
  return (
    status === PLAID_ITEM_STATUS.LOGIN_REQUIRED ||
    status === PLAID_ITEM_STATUS.PENDING_EXPIRATION ||
    status === PLAID_ITEM_STATUS.REVOKED
  );
}

type StatusUpdate = {
  status: PlaidItemStatus;
  errorCode?: string | null;
  errorMessage?: string | null;
};

export async function findPlaidItemByPlaidId(plaidItemId: string) {
  return prisma.plaidItem.findUnique({
    where: { plaidItemId },
  });
}

export async function markPlaidItemHealthyByPlaidId(plaidItemId: string) {
  return prisma.plaidItem.updateMany({
    where: { plaidItemId },
    data: {
      status: PLAID_ITEM_STATUS.ACTIVE,
      errorCode: null,
      errorMessage: null,
      statusUpdatedAt: new Date(),
    },
  });
}

export async function markPlaidItemHealthy(itemId: string) {
  return prisma.plaidItem.update({
    where: { id: itemId },
    data: {
      status: PLAID_ITEM_STATUS.ACTIVE,
      errorCode: null,
      errorMessage: null,
      statusUpdatedAt: new Date(),
    },
  });
}

export async function markPlaidItemSynced(itemId: string) {
  return prisma.plaidItem.update({
    where: { id: itemId },
    data: {
      lastSyncedAt: new Date(),
      status: PLAID_ITEM_STATUS.ACTIVE,
      errorCode: null,
      errorMessage: null,
      statusUpdatedAt: new Date(),
    },
  });
}

export async function updatePlaidItemStatusByPlaidId(plaidItemId: string, update: StatusUpdate) {
  return prisma.plaidItem.updateMany({
    where: { plaidItemId },
    data: {
      status: update.status,
      errorCode: update.errorCode ?? null,
      errorMessage: update.errorMessage ?? null,
      statusUpdatedAt: new Date(),
    },
  });
}

export async function markPlaidItemFromError(item: { id: string; plaidItemId: string; institutionName?: string | null }, error: unknown) {
  const parsed = parsePlaidError(error);
  const institution = item.institutionName ?? "Bank";

  let status: PlaidItemStatus = PLAID_ITEM_STATUS.ERROR;
  let errorMessage = `${institution} could not be synced.`;

  if (isPlaidLoginRequired(error)) {
    status = PLAID_ITEM_STATUS.LOGIN_REQUIRED;
    errorMessage = `${institution} needs you to sign in again.`;
  } else if (isPlaidAccessRevoked(error)) {
    status = PLAID_ITEM_STATUS.REVOKED;
    errorMessage = `${institution} access was revoked. Reconnect to restore it.`;
  } else if (parsed?.displayMessage || parsed?.errorMessage) {
    errorMessage = parsed.displayMessage ?? parsed.errorMessage ?? errorMessage;
  }

  await prisma.plaidItem.update({
    where: { id: item.id },
    data: {
      status,
      errorCode: parsed?.errorCode ?? null,
      errorMessage,
      statusUpdatedAt: new Date(),
    },
  });

  return { status, errorCode: parsed?.errorCode, errorMessage };
}
