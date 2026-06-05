import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { openai } from "@/lib/openai";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { messages } = await req.json();

    // Fetch user's recent financial context to give the AI context
    const accounts = await prisma.financialAccount.findMany({
      where: { userId: session.user.id },
    });
    
    const transactions = await prisma.transaction.findMany({
      where: { userId: session.user.id },
      orderBy: { date: "desc" },
      take: 20,
    });

    const systemPrompt = `
You are a brilliant, concise, and helpful financial AI coach for the user ${session.user.name || ""}.
You have access to their live financial data. Answer their questions directly. Keep it brief and friendly.

CURRENT ACCOUNTS:
${JSON.stringify(accounts.map(a => ({ name: a.name, balance: a.currentBalance, type: a.type })))}

RECENT TRANSACTIONS:
${JSON.stringify(transactions.map(t => ({ name: t.name, amount: t.amount, date: t.date })))}
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o", // Still using 4o as gpt-5 is not public yet via API
      messages: [
        { role: "system", content: systemPrompt },
        ...messages
      ],
    });

    return NextResponse.json({ 
      message: response.choices[0].message.content 
    });
  } catch (error: any) {
    console.error("Chat error:", error);
    return NextResponse.json({ error: "Failed to process chat" }, { status: 500 });
  }
}
