import { authOptions } from "@/lib/auth";
import { buildKnownCashScheduleContext, CFO_AGENT_INSTRUCTIONS } from "@/lib/cfo-agent";
import { ensureFreshDailySnapshot } from "@/lib/daily-snapshot";
import { getCostControlConfig } from "@/lib/env";
import { storeFinancialMemories } from "@/lib/financial-memory";
import { parseGoalSuggestion, GOAL_SUGGESTION_RULES, type GoalSuggestion } from "@/lib/goal-suggestion";
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
  availableBalance: number | null;
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
  goalSuggestion?: GoalSuggestion | null;
};

const MAX_CONTEXT_MESSAGES = 10;
const MAX_HISTORY_MESSAGES = 50;

function sanitizeChatMessages(messages: unknown): ChatMessage[] {
  return (Array.isArray(messages) ? messages : [])
    .filter((message): message is ChatMessage => {
      const candidate = message as Partial<ChatMessage>;
      return candidate.role === "user" || candidate.role === "assistant";
    })
    .map((message) => ({
      role: message.role,
      content: typeof message.content === "string" ? message.content : "",
      images: Array.isArray(message.images)
        ? message.images.filter((image): image is string => typeof image === "string" && image.startsWith("data:image/"))
        : undefined,
    }))
    .filter((message) => message.content.trim() || message.images?.length);
}

function buildCoachSessionTitle(message: ChatMessage) {
  const title = message.content.trim() || "Screenshot review";
  return title.length > 60 ? `${title.slice(0, 57)}...` : title;
}

function parseStoredJson<T>(value: string | null): T | null {
  if (!value) return null;

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function stringifyStoredJson(value: unknown) {
  if (!value) return null;

  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function parseChatResponse(response: ChatCompletion): ChatResponsePayload {
  const content = response.choices[0]?.message.content;

  if (typeof content !== "string" || !content.trim()) {
    return { message: "", memoriesToStore: [], shouldRefreshBrief: false, goalSuggestion: null };
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
      goalSuggestion: parseGoalSuggestion(parsed.goalSuggestion),
    };
  } catch {
    return {
      message: content.trim(),
      memoriesToStore: [],
      shouldRefreshBrief: false,
      goalSuggestion: null,
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
    if (account.type === "credit" || account.type === "loan") {
      return sum - Math.abs(account.currentBalance ?? 0);
    }
    if (account.type === "depository") {
      return sum + (account.availableBalance ?? account.currentBalance ?? 0);
    }
    return sum + (account.currentBalance ?? 0);
  }, 0);

  return {
    mode: excludeDebt ? "debt excluded" : "debt included",
    includedAccounts: includedAccounts.map((account) => ({
      name: account.name,
      type: account.type,
      subtype: account.subtype,
      spendable:
        account.type === "depository"
          ? (account.availableBalance ?? account.currentBalance)
          : account.currentBalance,
      ledgerCurrent: account.currentBalance,
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
        text: "Please review the attached photo(s). Extract durable money or life facts (receipts, bills, schedules, gym plans, calendars, goals) and tell me what you see plus what I should do or remember.",
      });
    }

    for (const image of message.images.slice(0, 2)) {
      parts.push({ type: "image_url", image_url: { url: image, detail: "auto" } });
    }

    return { role: "user", content: parts };
  });
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const requestedSessionId = new URL(req.url).searchParams.get("sessionId");
    const sessions = await prisma.coachSession.findMany({
      where: { userId: session.user.id },
      orderBy: { updatedAt: "desc" },
      take: 25,
      include: {
        _count: { select: { messages: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { content: true, createdAt: true },
        },
      },
    });

    const coachSession = requestedSessionId
      ? await prisma.coachSession.findFirst({
          where: { id: requestedSessionId, userId: session.user.id },
        })
      : (sessions[0] ?? null);

    const sessionSummaries = sessions.map((historySession) => ({
      id: historySession.id,
      title: historySession.title,
      createdAt: historySession.createdAt,
      updatedAt: historySession.updatedAt,
      messageCount: historySession._count.messages,
      lastMessage: historySession.messages[0]?.content ?? null,
      lastMessageAt: historySession.messages[0]?.createdAt ?? null,
    }));

    if (requestedSessionId && !coachSession) {
      return NextResponse.json({ error: "Coach session not found" }, { status: 404 });
    }

    if (!coachSession) {
      return NextResponse.json({ session: null, sessions: sessionSummaries, messages: [] });
    }

    const messages = await prisma.coachMessage.findMany({
      where: { sessionId: coachSession.id, userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: MAX_HISTORY_MESSAGES,
    });

    return NextResponse.json({
      session: {
        id: coachSession.id,
        title: coachSession.title,
        createdAt: coachSession.createdAt,
        updatedAt: coachSession.updatedAt,
      },
      sessions: sessionSummaries,
      messages: messages.reverse().map((message) => ({
        id: message.id,
        role: message.role === "assistant" ? "assistant" : "user",
        content: message.content,
        images: message.images.length > 0 ? message.images : undefined,
        spotlight: parseStoredJson(message.spotlightJson),
        goalSuggestion: parseStoredJson(message.goalSuggestionJson),
        createdAt: message.createdAt,
      })),
    });
  } catch (error) {
    console.error("Failed to load coach history:", error);
    return NextResponse.json({ error: "Failed to load coach history" }, { status: 500 });
  }
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

    const body = await req.json();
    const requestMessages = sanitizeChatMessages(body.messages);
    const latestUserMessage = [...requestMessages].reverse().find((message) => message.role === "user");
    if (!latestUserMessage) {
      return NextResponse.json({ error: "Send a message or upload a screenshot first." }, { status: 400 });
    }

    const requestedSessionId = typeof body.sessionId === "string" ? body.sessionId : null;
    let coachSession = requestedSessionId
      ? await prisma.coachSession.findFirst({
          where: { id: requestedSessionId, userId: session.user.id },
        })
      : null;

    coachSession ??= await prisma.coachSession.create({
      data: {
        userId: session.user.id,
        title: buildCoachSessionTitle(latestUserMessage),
      },
    });

    const persistedContext = await prisma.coachMessage.findMany({
      where: { sessionId: coachSession.id, userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: MAX_CONTEXT_MESSAGES,
    });

    const savedContextMessages: ChatMessage[] = persistedContext
      .reverse()
      .map((message) => ({
        role: message.role === "assistant" ? "assistant" : "user",
        content: message.content,
        images: message.images.length > 0 ? message.images : undefined,
      }));

    const recentMessages = (
      savedContextMessages.length > 0
        ? [...savedContextMessages, latestUserMessage]
        : requestMessages
    ).slice(-MAX_CONTEXT_MESSAGES);

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

    const typicalPaycheck = (() => {
      const payroll = recentTransactions.find((t) => {
        if (t.amount >= 0) return false;
        const label = `${t.name} ${t.merchantName ?? ""}`.toLowerCase();
        return label.includes("amergis") || label.includes("payroll");
      });
      return payroll ? Math.abs(payroll.amount) : null;
    })();

    const systemPrompt = `
${CFO_AGENT_INSTRUCTIONS}

You are the user's Life OS coach for ${session.user.name || "the user"} — money core plus career, body, network, and intentional joy.
You have access to their live financial data and life context (memories, goals, schedule). Answer questions directly, briefly, and actionably.
You must distinguish Trell's emotional safety instinct from the financially optimal CFO move: if he wants to hold extra cash because it feels better, respect that, then show whether the math says cash is actually needed or whether paying down high-APR debt is the stronger move.
When the user asks for a daily brief, use this exact format:
Daily Brief
Status: stable, tight, conservative mode, or attack mode.
Cash safety: tell whether bills are covered.
Upcoming bills: list important items in the next 14 days.
Income expected: paycheck, tenant rent, Lyft income, or refunds.
Safe spend today: give one number.
Debt move: hold cash or pay extra, and which debt to target.
Spending warning: where money is leaking.
Today's move: one clear action (can be money or life leverage).
System impact: one sentence on how that move hardens cash OR compounds career/body/network.

When answering about any transaction, recurring charge, or tradeoff, assess bigger-picture impact — not just whether money could be saved. Explain what freed cash should do next in the reinforcing loop (buffer → debt → credit → reserves → next property).
When the user asks where a projection number came from, explain the exact formula and cite the relevant totals/sources from PROJECTION CONTEXT.
When the user teaches durable facts — money OR life — store them in memoriesToStore so future briefs, planner, and coaching can use them.
Examples to remember: bill due dates, payment habits, bills already paid this month, income timing, debt APRs, minimum payments, credit limits, mortgage details, tenant rent timing, cash-buffer preferences, gym schedule, workout plan, promotion deadline/target, WFH vs office changes, travel dates, and body/weight targets.
If MEMORIES include "Charge reviewed:" entries, the user already explained those merchants in Spending radar — respect that context and do not re-flag them as leaks unless asked.
Use short stable titles like "Credit card payment habit", "Gym schedule", or "Promotion target".
Set shouldRefreshBrief to true when new or updated memories would materially change safe spend, upcoming bills, debt move, cash safety, or today's life allocation.
Crucially, look at Current Accounts, Financial Goals, memories, recurring obligations, recent income, and recent spending patterns.
- Treat listed active goals as important context — money goals and life/career goals both count.
- If multiple goals compete, weigh target date, remaining amount, domain (cash vs career vs body), and goal category before recommending tradeoffs.
- Proactively look for opportunities to optimize daily costs to hit high-priority money goals faster without starving career/body leverage.
- Do not recommend extra debt payments unless mortgage, upcoming bills, minimum payments, and emergency buffer appear covered.
- If debt APR, credit limit, minimum payment, due date, or statement date is missing, say it is missing instead of inventing it.
When the user uploads photo(s), read them carefully:
- Money screenshots (receipts, bills, bank/credit alerts, statements): extract amounts, merchants, due dates; flag expected vs wasteful vs urgent; tie to goals and safe spend.
- Life screenshots (gym schedule, calendar, workout plan, goal boards, travel plans): extract the durable schedule/facts into memoriesToStore so the Today Planner and coach stay current — do not leave that knowledge only in this chat turn.
Joy preferences mentioned by the user are a menu of options, not an automatic assignment for today.

${GOAL_SUGGESTION_RULES}

${buildKnownCashScheduleContext(DateTime.local(), { typicalPaycheck })}

MEMORIES:
${memories}

CURRENT ACCOUNTS:
${JSON.stringify(accounts.map(a => ({
    name: a.name,
    spendable: a.type === "depository" ? (a.availableBalance ?? a.currentBalance) : a.currentBalance,
    ledgerCurrent: a.currentBalance,
    availableBalance: a.availableBalance,
    type: a.type,
    subtype: a.subtype,
    creditLimit: a.creditLimit,
    aprPercent: a.aprPercent,
    minimumPayment: a.minimumPayment,
    dueDay: a.dueDay,
    statementDay: a.statementDay,
    utilizationPct:
      a.type === "credit" && a.creditLimit && a.creditLimit > 0
        ? Math.round(((a.currentBalance ?? 0) / a.creditLimit) * 1000) / 10
        : null,
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
  "goalSuggestion": {
    "action": "create | update",
    "goalId": "optional existing id when action is update",
    "matchName": "optional name match when id unknown",
    "name": "Extra to highest-APR card from canceled Canva",
    "type": "debt_payoff",
    "reason": "You freed ~$15/mo. Buffer and near-term trip look covered — point that surplus at high-APR debt instead of a new trip goal.",
    "targetAmount": 500,
    "monthlyRedirect": 15,
    "addAmount": 15,
    "priority": 1,
    "targetDate": null
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
Use goalSuggestion null unless one high-value tracked goal clearly helps (see GOAL SUGGESTIONS rules). Never invent many goals.
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
          source: "Life OS Coach",
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
        console.error("Failed to refresh daily brief after chat memory update:", refreshError);
      }
    }

    let assistantHistoryMessage = chatResponse.message;
    if (savedMemoryTitles.length > 0) {
      assistantHistoryMessage += `\n\nSaved for your financial overview: ${savedMemoryTitles.join(", ")}.`;
    }
    if (briefRefreshed) {
      assistantHistoryMessage += "\n\nI refreshed your daily brief. Check Overview for the updated daily spend limit.";
    }

    await prisma.$transaction([
      prisma.coachMessage.create({
        data: {
          sessionId: coachSession.id,
          userId: session.user.id,
          role: "user",
          content: latestUserMessage.content,
          images: latestUserMessage.images ?? [],
        },
      }),
      prisma.coachMessage.create({
        data: {
          sessionId: coachSession.id,
          userId: session.user.id,
          role: "assistant",
          content: assistantHistoryMessage,
          spotlightJson: stringifyStoredJson(chatResponse.spotlight),
          goalSuggestionJson: stringifyStoredJson(chatResponse.goalSuggestion),
        },
      }),
      prisma.coachSession.update({
        where: { id: coachSession.id },
        data: {
          updatedAt: new Date(),
          ...(coachSession.title ? {} : { title: buildCoachSessionTitle(latestUserMessage) }),
        },
      }),
    ]);

    return NextResponse.json({
      sessionId: coachSession.id,
      message: chatResponse.message,
      spotlight: chatResponse.spotlight ?? null,
      goalSuggestion: chatResponse.goalSuggestion ?? null,
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
