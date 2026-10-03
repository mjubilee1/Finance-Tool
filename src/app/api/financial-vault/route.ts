import { NextResponse } from "next/server";
import { getAppUser } from "@/lib/app-user";
import {
  createFinancialVaultUnlockValue,
  FINANCIAL_VAULT_COOKIE,
  getFinancialVaultStatus,
  verifyFinancialVaultCode,
} from "@/lib/financial-vault";

function vaultCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export async function GET() {
  const user = await getAppUser();
  if (!user) {
    return NextResponse.json({ error: "App user is not configured." }, { status: 503 });
  }

  return NextResponse.json(await getFinancialVaultStatus(user.id));
}

export async function POST(request: Request) {
  const user = await getAppUser();
  if (!user) {
    return NextResponse.json({ error: "App user is not configured." }, { status: 503 });
  }

  const status = await getFinancialVaultStatus(user.id);
  if (!status.configured) {
    return NextResponse.json({
      configured: false,
      unlocked: true,
      locked: false,
    });
  }

  const body = (await request.json().catch(() => null)) as { code?: string } | null;
  const code = typeof body?.code === "string" ? body.code : "";

  if (!verifyFinancialVaultCode(code)) {
    return NextResponse.json({ error: "Wrong code." }, { status: 403 });
  }

  const unlock = createFinancialVaultUnlockValue(user.id);
  const response = NextResponse.json({
    configured: true,
    unlocked: true,
    locked: false,
  });
  response.cookies.set(FINANCIAL_VAULT_COOKIE, unlock.value, vaultCookieOptions(unlock.maxAgeSeconds));
  return response;
}

export async function DELETE() {
  const user = await getAppUser();
  if (!user) {
    return NextResponse.json({ error: "App user is not configured." }, { status: 503 });
  }

  const response = NextResponse.json({
    configured: true,
    unlocked: false,
    locked: true,
  });
  response.cookies.set(FINANCIAL_VAULT_COOKIE, "", vaultCookieOptions(0));
  return response;
}
