import crypto from "crypto";
import { importJWK, jwtVerify, type JWK } from "jose";
import { plaidClient } from "@/lib/plaid";
import { prisma } from "@/lib/prisma";
import { syncTransactionsForItem } from "@/lib/plaid-sync";
import {
  markPlaidItemHealthyByPlaidId,
  PLAID_ITEM_STATUS,
  updatePlaidItemStatusByPlaidId,
} from "@/lib/plaid-item-health";

type PlaidWebhookBody = {
  webhook_type?: string;
  webhook_code?: string;
  item_id?: string;
  error?: {
    error_code?: string;
    error_message?: string;
    display_message?: string | null;
  };
};

const verificationKeyCache = new Map<string, { key: JWK; expiresAt: number }>();

function timingSafeEqualHex(a: string, b: string) {
  const aBuf = Buffer.from(a, "hex");
  const bBuf = Buffer.from(b, "hex");
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function decodeJwtHeader(jwt: string) {
  const [header] = jwt.split(".");
  if (!header) return null;
  try {
    return JSON.parse(Buffer.from(header, "base64url").toString("utf8")) as { kid?: string; alg?: string };
  } catch {
    return null;
  }
}

async function getVerificationKey(kid: string) {
  const cached = verificationKeyCache.get(kid);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.key;
  }

  const response = await plaidClient.webhookVerificationKeyGet({ key_id: kid });
  const key = response.data.key as unknown as JWK;
  verificationKeyCache.set(kid, { key, expiresAt: Date.now() + 60 * 60 * 1000 });
  return key;
}

export async function verifyPlaidWebhook(body: string, verificationHeader: string | null) {
  if (process.env.PLAID_WEBHOOK_VERIFY === "false") {
    return true;
  }

  if (!verificationHeader) {
    console.warn("[Plaid Webhook] Missing Plaid-Verification header");
    return false;
  }

  try {
    const header = decodeJwtHeader(verificationHeader);
    if (!header?.kid) return false;

    const jwk = await getVerificationKey(header.kid);
    const key = await importJWK(jwk, "ES256");
    const { payload } = await jwtVerify(verificationHeader, key, {
      algorithms: ["ES256"],
      maxTokenAge: "5 min",
    });

    const expectedHash = crypto.createHash("sha256").update(body).digest("hex");
    const requestBodySha256 =
      typeof payload.request_body_sha256 === "string" ? payload.request_body_sha256 : "";

    return timingSafeEqualHex(expectedHash, requestBodySha256);
  } catch (error) {
    console.error("[Plaid Webhook] Verification failed:", error);
    return false;
  }
}

async function triggerBackgroundSync(plaidItemId: string) {
  const item = await prisma.plaidItem.findUnique({ where: { plaidItemId } });
  if (!item || item.status === PLAID_ITEM_STATUS.LOGIN_REQUIRED || item.status === PLAID_ITEM_STATUS.REVOKED) {
    return;
  }

  try {
    await syncTransactionsForItem(item.id, { bypassCooldown: true });
  } catch (error) {
    console.error(`[Plaid Webhook] Background sync failed for item ${plaidItemId}`, error);
  }
}

export async function handlePlaidWebhook(body: PlaidWebhookBody) {
  const { webhook_type: webhookType, webhook_code: webhookCode, item_id: itemId } = body;

  if (!webhookType || !webhookCode || !itemId) {
    console.warn("[Plaid Webhook] Missing webhook fields", body);
    return;
  }

  console.log(`[Plaid Webhook] ${webhookType} / ${webhookCode} for item ${itemId}`);

  if (webhookType === "ITEM") {
    switch (webhookCode) {
      case "ERROR": {
        const errorCode = body.error?.error_code;
        if (errorCode === "ITEM_LOGIN_REQUIRED") {
          await updatePlaidItemStatusByPlaidId(itemId, {
            status: PLAID_ITEM_STATUS.LOGIN_REQUIRED,
            errorCode,
            errorMessage: body.error?.display_message ?? body.error?.error_message ?? "Bank login required.",
          });
        } else if (errorCode === "USER_PERMISSION_REVOKED") {
          await updatePlaidItemStatusByPlaidId(itemId, {
            status: PLAID_ITEM_STATUS.REVOKED,
            errorCode,
            errorMessage: body.error?.display_message ?? body.error?.error_message ?? "Bank access revoked.",
          });
        } else {
          await updatePlaidItemStatusByPlaidId(itemId, {
            status: PLAID_ITEM_STATUS.ERROR,
            errorCode,
            errorMessage: body.error?.display_message ?? body.error?.error_message ?? "Bank connection error.",
          });
        }
        break;
      }
      case "LOGIN_REPAIRED":
        await markPlaidItemHealthyByPlaidId(itemId);
        await triggerBackgroundSync(itemId);
        break;
      case "PENDING_EXPIRATION":
        await updatePlaidItemStatusByPlaidId(itemId, {
          status: PLAID_ITEM_STATUS.PENDING_EXPIRATION,
          errorCode: webhookCode,
          errorMessage: "Bank login will expire soon. Reconnect now to avoid sync interruptions.",
        });
        break;
      case "PENDING_DISCONNECT":
        await updatePlaidItemStatusByPlaidId(itemId, {
          status: PLAID_ITEM_STATUS.PENDING_EXPIRATION,
          errorCode: webhookCode,
          errorMessage: "Bank connection will disconnect soon. Reconnect to keep transactions flowing.",
        });
        break;
      case "USER_PERMISSION_REVOKED":
        await updatePlaidItemStatusByPlaidId(itemId, {
          status: PLAID_ITEM_STATUS.REVOKED,
          errorCode: webhookCode,
          errorMessage: "Bank access was revoked. Reconnect to restore it.",
        });
        break;
      default:
        break;
    }
    return;
  }

  if (webhookType === "TRANSACTIONS") {
    if (
      webhookCode === "SYNC_UPDATES_AVAILABLE" ||
      webhookCode === "INITIAL_UPDATE" ||
      webhookCode === "HISTORICAL_UPDATE" ||
      webhookCode === "DEFAULT_UPDATE"
    ) {
      await triggerBackgroundSync(itemId);
    }
  }
}
