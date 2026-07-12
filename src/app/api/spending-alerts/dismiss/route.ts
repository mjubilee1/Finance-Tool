import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  buildChargeReviewMemoryContent,
  CHARGE_REVIEW_MEMORY_TYPE,
  dispositionCustomCategory,
  getChargeReviewMemoryTitle,
  type ChargeReviewDisposition,
} from "@/lib/charge-review";
import { storeFinancialMemories } from "@/lib/financial-memory";

const dismissSchema = z.object({
  transactionId: z.string().min(1),
  merchantLabel: z.string().min(1),
  amount: z.number(),
  date: z.string().min(1),
  disposition: z.enum(["expected", "one_time", "not_concern", "will_cancel"]),
  note: z.string().max(500).optional(),
});

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = dismissSchema.parse(await req.json());
    const transaction = await prisma.transaction.findFirst({
      where: {
        id: body.transactionId,
        userId: session.user.id,
      },
    });

    if (!transaction) {
      return NextResponse.json({ error: "Transaction not found." }, { status: 404 });
    }

    const merchantLabel = body.merchantLabel.trim();
    const disposition = body.disposition as ChargeReviewDisposition;
    const memoryTitle = getChargeReviewMemoryTitle(merchantLabel);
    const memoryContent = buildChargeReviewMemoryContent({
      merchantLabel,
      amount: body.amount,
      date: body.date,
      disposition,
      note: body.note,
    });

    await storeFinancialMemories(
      session.user.id,
      [
        {
          title: memoryTitle,
          content: memoryContent,
          importanceScore: disposition === "will_cancel" ? 9 : 8,
        },
      ],
      {
        source: "Spending radar",
        type: CHARGE_REVIEW_MEMORY_TYPE,
        minImportance: 7,
        limit: 1,
      },
    );

    await prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        customCategory: dispositionCustomCategory(disposition),
        note: body.note?.trim() || transaction.note,
      },
    });

    return NextResponse.json({
      success: true,
      memoryTitle,
      message: "Saved — this charge won't show in Spending radar and your Coach will remember the context.",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    console.error("Failed to dismiss spending alert:", error);
    return NextResponse.json({ error: "Failed to save review." }, { status: 500 });
  }
}
