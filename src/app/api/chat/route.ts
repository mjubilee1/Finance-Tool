import { authOptions } from "@/lib/auth";
import { CFO_AGENT_INSTRUCTIONS } from "@/lib/cfo-agent";
import { ensureFreshDailySnapshot } from "@/lib/daily-snapshot";
import { getCostControlConfig } from "@/lib/env";
import { storeFinancialMemories } from "@/lib/financial-memory";
import { openai } from "@/lib/openai";
import { prisma } from "@/lib/prisma";
import { DateTime } from "luxon";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import type { ChatCompletion } from "openai/resources/chat/completions";

type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  images?: string[];
};

type OpenAiChatMessage =
  | { role: "system" | "assistant"; content: string }
  | {
      role: "user";
      content: string | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } }
      >;
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

type ChatMemory = {
  title: string;
  content: string;
  importanceScore: number;
};

type ChatResponsePayload = {
  message: string;
  memoriesToStore: ChatMemory[];
  shouldRefreshBrief: boolean;
  spotlight?: {
    transactionId?: string;
    merchant: string;
    amount?: number;
    date?: string;
    headline: string;
    categoryGuess?: string;
    savingsTip?: string;
    severity?: "review" | "watch" | "ok";
  } | null;
};

function parseChatResponse(response: ChatCompletion): ChatResponsePayload {
  const content = response.choices[0]?.message.content;

  if (typeof content !== "string" || !content.trim()) {
    return { message: "", memoriesToStore: [], shouldRefreshBrief: false };
  }

  try {
    const parsed = JSON.parse(content) as Partial<ChatResponsePayload>;
    const message = typeof parsed.message === "string" ? parsed.message.trim() : "";
    const memoriesToStore = Array.isArray(parsed.memoriesToStore)
      ? parsed.memoriesToStore.filter((memory): memory is ChatMemory =>
          typeof memory?.title === "string" &&
          typeof memory?.content === "string" &&
          typeof memory?.importanceScore === "number",
        )
      : [];

    return {
      message,
      memoriesToStore,
      shouldRefreshBrief: parsed.shouldRefreshBrief === true,
      spotlight:
        parsed.spotlight &&
        typeof parsed.spotlight === "object" &&
        typeof parsed.spotlight.merchant === "string" &&
        typeof parsed.spotlight.headline === "string"
          ? parsed.spotlight
          : null,
    };
  } catch {
    return {
      message: content.trim(),
      memoriesToStore: [],
      shouldRefreshBrief: false,
    };
  }
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

function toOpenAiMessages(messages: ChatMessage[]): OpenAiChatMessage[] {
  return messages.map((message) => {
    if (message.role !== "user" || !message.images?.length) {
      return { role: message.role, content: message.content };
    }

    const parts: Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } }
    > = [];

    if (message.content.trim()) {
      parts.push({ type: "text", text: message.content.trim() });
    } else {
      parts.push({
        type: "text",
        text: "Please review the attached photo(s) in the context of my finances and tell me what you see and what I should do.",
      });
    }

    for (const image of message.images.slice(0, 2)) {
      parts.push({ type: "image_url", image_url: { url: image, detail: "auto" } });
    }

    return { role: "user", content: parts };
  });
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
      .filter((message: ChatMessage) => message.content?.trim() || message.images?.length)
      .slice(-6);

    const twoYearsAgo = DateTime.now().minus({ years: 2 }).toISODate();
    const [accounts, goals, recentTransactions, projectionTransactions, memoryRecords, recurringPatterns] = await Promise.all([
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
      prisma.financialMemory.findMany({
        where: { userId: session.user.id },
        orderBy: { importanceScore: "desc" },
        take: 8,
      }),
      prisma.recurringPattern.findMany({
        where: { userId: session.user.id },
        take: 25,
      }),
    ]);

    const memories = memoryRecords
      .map((memory) => memory.content)
      .join("\n");

    const projectionContext = {
      debtExcluded: buildProjectionSummary(accounts, projectionTransactions, true),
      debtIncluded: buildProjectionSummary(accounts, projectionTransactions, false),
      note: "Projection math treats Plaid positive amounts as spending and negative amounts as income. Transfers are excluded by categoryPrimary when it contains 'transfer'.",
      debtRule: "Debt accounts affect current balance/net worth only. Mortgage/loan transactions are excluded from daily income/spend.",
    };

    const systemPrompt = `
${CFO_AGENT_INSTRUCTIONS}

You are the user's personal financial CFO for ${session.user.name || "the user"}.
You have access to their live financial data. Answer questions directly, briefly, and actionably.
When the user asks for a daily brief, use this exact format:
CFO Brief
Status: stable, tight, conservative mode, or attack mode.
Cash safety: tell whether bills are covered.
Upcoming bills: list important items in the next 14 days.
Income expected: paycheck, tenant rent, Lyft income, or refunds.
Safe spend today: give one number.
Debt move: hold cash or pay extra, and which debt to target.
Spending warning: where money is leaking.
Today's move: one clear action.
System impact: one sentence on how that move hardens or grows the bigger financial system.

When answering about any transaction, recurring charge, or tradeoff, assess bigger-picture impact — not just whether money could be saved. Explain what freed cash should do next in the reinforcing loop (buffer → debt → credit → reserves → next property).
When the user asks where a projection number came from, explain the exact formula and cite the relevant totals/sources from PROJECTION CONTEXT.
When the user teaches you durable financial facts, store them in memoriesToStore so future CFO briefs and projections can use them.
Examples to remember: bill due dates, payment habits, bills already paid this month, income timing, debt APRs, minimum payments, credit limits, mortgage details, tenant rent timing, and cash-buffer preferences.
If MEMORIES include "Charge reviewed:" entries, the user already explained those merchants in Spending radar — respect that context and do not re-flag them as leaks unless asked.
Use short stable titles like "Credit card payment habit" or "Chase card due date".
Set shouldRefreshBrief to true when new or updated memories would materially change safe spend, upcoming bills, debt move, or cash safety.
Crucially, look at Current Accounts, Financial Goals, memories, recurring obligations, recent income, and recent spending patterns. 
- Treat listed active goals as important context for optimization advice.
- If multiple goals compete, weigh target date, remaining amount, and goal category before recommending tradeoffs.
- Proactively look for opportunities to optimize their daily transaction costs to help them hit their specific, high-priority goals faster.
- Do not recommend extra debt payments unless mortgage, upcoming bills, minimum payments, and emergency buffer appear covered.
- If debt APR, credit limit, minimum payment, due date, or statement date is missing, say it is missing instead of inventing it.
When the user uploads photo(s), read receipts, bills, bank notifications, credit card screenshots, or statements carefully. Extract amounts, merchants, due dates, and whether the charge looks expected, wasteful, or urgent. Tie what you see back to their goals and safe spend when relevant.

MEMORIES:
${memories}

CURRENT ACCOUNTS:
${JSON.stringify(accounts.map(a => ({
    name: a.name,
    balance: a.currentBalance,
    availableBalance: a.availableBalance,
    type: a.type,
    subtype: a.subtype,
  })))}

FINANCIAL GOALS:
${JSON.stringify(goals.map(g => ({ name: g.name, target: g.targetAmount, current: g.currentAmount, targetDate: g.targetDate, type: g.category, status: g.status })))}

RECENT TRANSACTIONS:
${JSON.stringify(recentTransactions.map(t => ({
    id: t.id,
    name: t.name,
    merchant: t.merchantName,
    amount: t.amount,
    date: t.date,
    category: t.customCategory ?? t.categoryPrimary,
    detailedCategory: t.categoryDetailed,
    flags: {
      possibleTenantRent: t.isTenantPaymentCandidate,
      food: t.isFoodCandidate,
      transportation: t.isTransportationCandidate,
      utility: t.isUtilityCandidate,
    },
  })))}

RECURRING PATTERNS:
${JSON.stringify(recurringPatterns.map(pattern => ({
    merchant: pattern.merchantName,
    amount: pattern.averageAmount,
    frequency: pattern.frequency,
    direction: pattern.direction,
    category: pattern.category,
    lastSeen: pattern.lastSeen,
    confidence: pattern.confidenceScore,
  })))}

PROJECTION CONTEXT:
${JSON.stringify(projectionContext)}

Return JSON only with this exact shape:
{
  "message": "Your conversational reply to the user.",
  "spotlight": {
    "transactionId": "optional id from RECENT TRANSACTIONS if known",
    "merchant": "Merchant or charge label",
    "amount": 29.99,
    "date": "2026-06-17",
    "headline": "One sentence explaining what this charge likely is.",
    "categoryGuess": "Optional short category label",
    "savingsTip": "Optional one-line savings action",
    "severity": "review"
  },
  "memoriesToStore": [
    {
      "title": "Short stable title",
      "content": "Durable fact in plain English that future briefs should trust.",
      "importanceScore": 9
    }
  ],
  "shouldRefreshBrief": true
}
Use spotlight null when the user is not asking about a specific transaction.
When the user asks about a specific transaction, merchant, or charge they do not recognize, explain what it likely is using RECENT TRANSACTIONS and RECURRING PATTERNS.
If you can identify the charge, include a spotlight card with merchant, amount, date, a short headline, categoryGuess, savingsTip, and severity ("review", "watch", or "ok").
If it still looks suspicious or wasteful, set severity to "review" and suggest a concrete savings action.
If the user is only asking a question and not teaching durable facts, return an empty memoriesToStore array and shouldRefreshBrief false.
`;

    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        { role: "system", content: systemPrompt },
        ...toOpenAiMessages(recentMessages),
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 3000,
      reasoning_effort: "minimal",
      verbosity: "low",
    }) as ChatCompletion;

    const chatResponse = parseChatResponse(response);
    if (!chatResponse.message) {
      throw new Error(`OpenAI returned an empty chat response. Finish reason: ${response.choices[0]?.finish_reason ?? "unknown"}`);
    }

    const savedMemoryTitles = chatResponse.memoriesToStore.length > 0
      ? await storeFinancialMemories(session.user.id, chatResponse.memoriesToStore, {
          source: "CFO Chat",
          type: "USER_INPUT",
          minImportance: 7,
          limit: 3,
        })
      : [];

    let briefRefreshed = false;
    if (savedMemoryTitles.length > 0 && chatResponse.shouldRefreshBrief) {
      try {
        await ensureFreshDailySnapshot(session.user.id, { force: true });
        briefRefreshed = true;
      } catch (refreshError) {
        console.error("Failed to refresh CFO brief after chat memory update:", refreshError);
      }
    }

    return NextResponse.json({
      message: chatResponse.message,
      spotlight: chatResponse.spotlight ?? null,
      memoriesSaved: savedMemoryTitles,
      briefRefreshed,
    });
  } catch (error) {
    console.error("Chat error:", error);

    const openAiError = error as {
      status?: number;
      code?: string;
      error?: { code?: string; message?: string };
    };

    if (
      openAiError.status === 429 ||
      openAiError.code === "insufficient_quota" ||
      openAiError.error?.code === "insufficient_quota"
    ) {
      return NextResponse.json(
        {
          error: "OpenAI quota exceeded. Add billing or credits at platform.openai.com, then try again.",
        },
        { status: 429 },
      );
    }

    return NextResponse.json({ error: "Failed to process chat" }, { status: 500 });
  }
}
