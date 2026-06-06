import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { openai } from "@/lib/openai";
import { prisma } from "@/lib/prisma";
import { getCostControlConfig } from "@/lib/env";
import { DateTime } from "luxon";
import type { ChatCompletion } from "openai/resources/chat/completions";

type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

type ProjectionAccount = {
  plaidAccountId: string;
  name: string;
  type: string;
  subtype: string | null;
  currentBalance: number | null;
};

type ProjectionTransaction = {
  accountId: string;
  date: string;
  name: string;
  merchantName: string | null;
  amount: number;
  categoryPrimary: string | null;
};

function getAssistantText(response: ChatCompletion) {
  const content = response.choices[0]?.message.content;

  if (typeof content === "string") {
    return content.trim();
  }

  return "";
}

function buildProjectionSummary(
  accounts: ProjectionAccount[],
  transactions: ProjectionTransaction[],
  excludeDebt: boolean,
) {
  const includedAccounts = accounts.filter((account) => {
    if (!excludeDebt) return true;
    return account.type !== "credit" && account.type !== "loan";
  });
  const cashflowAccountIds = new Set(
    accounts
      .filter((account) => account.type !== "credit" && account.type !== "loan")
      .map((account) => account.plaidAccountId),
  );
  const includedTransactions = transactions.filter((transaction) => cashflowAccountIds.has(transaction.accountId));
  const cashflowTransactions = includedTransactions.filter(
    (transaction) => !transaction.categoryPrimary?.toLowerCase().includes("transfer"),
  );

  let totalSpend = 0;
  let totalIncome = 0;
  let earliestMs = DateTime.now().toMillis();
  let latestMs = DateTime.now().minus({ years: 10 }).toMillis();

  const incomeBySource = new Map<string, { total: number; count: number }>();

  for (const transaction of cashflowTransactions) {
    const transactionMs = DateTime.fromISO(transaction.date).toMillis();
    earliestMs = Math.min(earliestMs, transactionMs);
    latestMs = Math.max(latestMs, transactionMs);

    if (transaction.amount > 0) {
      totalSpend += transaction.amount;
    } else if (transaction.amount < 0) {
      const income = Math.abs(transaction.amount);
      totalIncome += income;

      const account = accounts.find((candidate) => candidate.plaidAccountId === transaction.accountId);
      const source = `${transaction.merchantName ?? transaction.name} (${account?.name ?? "unknown account"})`;
      const existing = incomeBySource.get(source) ?? { total: 0, count: 0 };
      incomeBySource.set(source, { total: existing.total + income, count: existing.count + 1 });
    }
  }

  const daysAnalyzed = Math.max(1, (latestMs - earliestMs) / (24 * 60 * 60 * 1000));
  const currentTotalBalance = includedAccounts.reduce((sum, account) => {
    const balance = account.currentBalance ?? 0;
    return account.type === "credit" || account.type === "loan" ? sum - balance : sum + balance;
  }, 0);

  return {
    mode: excludeDebt ? "debt excluded" : "debt included",
    includedAccounts: includedAccounts.map((account) => ({
      name: account.name,
      type: account.type,
      subtype: account.subtype,
      balance: account.currentBalance,
    })),
    daysAnalyzed,
    totalSpend,
    totalIncome,
    dailyAverageSpend: totalSpend / daysAnalyzed,
    dailyAverageIncome: totalIncome / daysAnalyzed,
    netDailyAverage: (totalIncome - totalSpend) / daysAnalyzed,
    currentTotalBalance,
    cashflowRule: "Daily income/spend excludes credit and loan account transactions even when debt balances are included.",
    topIncomeSources: Array.from(incomeBySource.entries())
      .map(([source, value]) => ({ source, total: value.total, count: value.count }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5),
  };
}

const chatUsageByUser = new Map<string, { date: string; count: number }>();

function getTodayKey() {
  return new Date().toISOString().split("T")[0];
}

function incrementChatUsage(userId: string, dailyLimit: number) {
  if (dailyLimit <= 0) return false;

  const today = getTodayKey();
  const usage = chatUsageByUser.get(userId);
  const nextUsage = usage?.date === today
    ? { date: today, count: usage.count + 1 }
    : { date: today, count: 1 };

  if (nextUsage.count > dailyLimit) return false;

  chatUsageByUser.set(userId, nextUsage);
  return true;
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { aiChatDailyLimit } = getCostControlConfig();
    if (!incrementChatUsage(session.user.id, aiChatDailyLimit)) {
      return NextResponse.json(
        { error: "Daily chat limit reached. Please try again tomorrow." },
        { status: 429 },
      );
    }

    const { messages } = await req.json();
    const recentMessages = (Array.isArray(messages) ? messages : [])
      .filter((message: ChatMessage) => message.role === "user" || message.role === "assistant")
      .filter((message: ChatMessage) => message.content?.trim())
      .slice(-6);

    const twoYearsAgo = DateTime.now().minus({ years: 2 }).toISODate();
    const [accounts, goals, recentTransactions, projectionTransactions] = await Promise.all([
      prisma.financialAccount.findMany({
        where: { userId: session.user.id },
      }),
      prisma.financialGoal.findMany({
        where: { userId: session.user.id, status: "active" },
      }),
      prisma.transaction.findMany({
        where: { userId: session.user.id },
        orderBy: { date: "desc" },
        take: 20,
      }),
      prisma.transaction.findMany({
        where: {
          userId: session.user.id,
          date: { gte: twoYearsAgo || undefined },
        },
        orderBy: { date: "asc" },
      }),
    ]);

    const projectionContext = {
      debtExcluded: buildProjectionSummary(accounts, projectionTransactions, true),
      debtIncluded: buildProjectionSummary(accounts, projectionTransactions, false),
      note: "Projection math treats Plaid positive amounts as spending and negative amounts as income. Transfers are excluded by categoryPrimary when it contains 'transfer'.",
      debtRule: "Debt accounts affect current balance/net worth only. Mortgage/loan transactions are excluded from daily income/spend.",
    };

    const systemPrompt = `
You are a brilliant, concise, and helpful financial AI coach for the user ${session.user.name || ""}.
You have access to their live financial data. Answer their questions directly. Keep it brief and friendly.
When the user asks where a projection number came from, explain the exact formula and cite the relevant totals/sources from PROJECTION CONTEXT.
Crucially, look at their Current Accounts (debt vs positive income) and their Financial Goals. 
- Treat listed active goals as important context for optimization advice.
- If multiple goals compete, weigh target date, remaining amount, and goal category before recommending tradeoffs.
- Proactively look for opportunities to optimize their daily transaction costs to help them hit their specific, high-priority goals faster.

CURRENT ACCOUNTS:
${JSON.stringify(accounts.map(a => ({ name: a.name, balance: a.currentBalance, type: a.type })))}

FINANCIAL GOALS:
${JSON.stringify(goals.map(g => ({ name: g.name, target: g.targetAmount, current: g.currentAmount, targetDate: g.targetDate, type: g.category, status: g.status })))}

RECENT TRANSACTIONS:
${JSON.stringify(recentTransactions.map(t => ({ name: t.name, amount: t.amount, date: t.date })))}

PROJECTION CONTEXT:
${JSON.stringify(projectionContext)}
`;

    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        { role: "system", content: systemPrompt },
        ...recentMessages
      ],
      max_completion_tokens: 3000,
      reasoning_effort: "minimal",
      verbosity: "low",
    }) as ChatCompletion;

    const message = getAssistantText(response);
    if (!message) {
      throw new Error(`OpenAI returned an empty chat response. Finish reason: ${response.choices[0]?.finish_reason ?? "unknown"}`);
    }

    return NextResponse.json({ 
      message,
    });
  } catch (error) {
    console.error("Chat error:", error);
    return NextResponse.json({ error: "Failed to process chat" }, { status: 500 });
  }
}
