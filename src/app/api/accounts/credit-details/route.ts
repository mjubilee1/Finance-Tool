import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function parseOptionalFloat(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

function parseOptionalDay(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const n = Number.parseInt(String(value), 10);
  if (!Number.isFinite(n) || n < 1 || n > 31) return undefined;
  return n;
}

export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { accountId } = body as { accountId?: string };

    if (!accountId || typeof accountId !== "string") {
      return NextResponse.json({ error: "accountId is required." }, { status: 400 });
    }

    const account = await prisma.financialAccount.findFirst({
      where: { id: accountId, userId: session.user.id },
    });

    if (!account) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    if (account.type !== "credit") {
      return NextResponse.json(
        { error: "Credit details can only be saved on credit card accounts." },
        { status: 400 },
      );
    }

    const creditLimit = parseOptionalFloat(body.creditLimit);
    const aprPercent = parseOptionalFloat(body.aprPercent);
    const minimumPayment = parseOptionalFloat(body.minimumPayment);
    const dueDay = parseOptionalDay(body.dueDay);
    const statementDay = parseOptionalDay(body.statementDay);

    if (
      creditLimit === undefined ||
      aprPercent === undefined ||
      minimumPayment === undefined ||
      dueDay === undefined ||
      statementDay === undefined
    ) {
      return NextResponse.json(
        { error: "Invalid credit details. Use numbers only (due/statement day 1–31)." },
        { status: 400 },
      );
    }

    const data: {
      creditLimit?: number | null;
      aprPercent?: number | null;
      minimumPayment?: number | null;
      dueDay?: number | null;
      statementDay?: number | null;
    } = {};

    if ("creditLimit" in body) data.creditLimit = creditLimit;
    if ("aprPercent" in body) data.aprPercent = aprPercent;
    if ("minimumPayment" in body) data.minimumPayment = minimumPayment;
    if ("dueDay" in body) data.dueDay = dueDay;
    if ("statementDay" in body) data.statementDay = statementDay;

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No updates provided." }, { status: 400 });
    }

    const updated = await prisma.financialAccount.update({
      where: { id: account.id },
      data,
    });

    return NextResponse.json({ account: updated });
  } catch (error) {
    console.error("Failed to update credit details:", error);
    return NextResponse.json({ error: "Failed to update credit details." }, { status: 500 });
  }
}
