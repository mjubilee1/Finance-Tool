import { authOptions } from "@/lib/auth";
import { buildKnownCashScheduleContext } from "@/lib/cfo-agent";
import { buildCoachSystemPrompt } from "@/lib/coach-chat-prompt";
import { classifyCoachIntent } from "@/lib/coach-intent";
import { ensureFreshDailySnapshot } from "@/lib/daily-snapshot";
import { getCostControlConfig } from "@/lib/env";
import { storeFinancialMemories } from "@/lib/financial-memory";
import { parseGoalSuggestion, type GoalSuggestion } from "@/lib/goal-suggestion";
import {
  createGoogleCalendarEvent,
  fetchUpcomingGoogleCalendarEvents,
  type CreateGoogleCalendarEventInput,
  type GoogleCalendarEvent,
} from "@/lib/google-calendar";
import { syncCalendarEventsToGrowth } from "@/lib/growth-calendar-sync";
import { openai } from "@/lib/openai";
import { prisma } from "@/lib/prisma";
import {
  applyTodayUpdates,
  buildTodayBriefContext,
  type TodayUpdatesPayload,
} from "@/lib/today-brief";
import { buildWeeklyOperatingPlan } from "@/lib/weekly-operating-plan";
import { loadUserPlanActivitiesBetween } from "@/lib/planner";
import { calendarDateTime, USER_TIME_ZONE, userNow } from "@/lib/user-timezone";
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

type CalendarEventRequest = {
  action: "create";
  title: string;
  start: string;
  end: string | null;
  allDay: boolean;
  timeZone: string;
  location: string | null;
  description: string | null;
};

type ChatResponsePayload = {
  message: string;
  memoriesToStore: ChatMemory[];
  shouldRefreshBrief: boolean;
  todayUpdates?: TodayUpdatesPayload | null;
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
  calendarEvent?: CalendarEventRequest | null;
};

const MAX_CONTEXT_MESSAGES = 10;
const MAX_HISTORY_MESSAGES = 50;

/** Vercel / serverless: allow vision + calendar coach turns enough time to finish. */
export const maxDuration = 60;

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

function parseCalendarEventRequest(value: unknown): CalendarEventRequest | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<Record<keyof CalendarEventRequest, unknown>>;
  if (candidate.action !== "create") return null;

  const title = typeof candidate.title === "string" ? candidate.title.trim() : "";
  const start = typeof candidate.start === "string" ? candidate.start.trim() : "";
  const end = typeof candidate.end === "string" ? candidate.end.trim() : null;
  if (!title || !start) return null;

  return {
    action: "create",
    title,
    start,
    end: end || null,
    allDay: candidate.allDay === true,
    timeZone:
      typeof candidate.timeZone === "string" && candidate.timeZone.trim()
        ? candidate.timeZone.trim()
        : USER_TIME_ZONE,
    location:
      typeof candidate.location === "string" && candidate.location.trim()
        ? candidate.location.trim()
        : null,
    description:
      typeof candidate.description === "string" && candidate.description.trim()
        ? candidate.description.trim()
        : null,
  };
}

function buildCalendarEventInput(request: CalendarEventRequest): CreateGoogleCalendarEventInput | null {
  if (request.allDay) {
    const start = DateTime.fromISO(request.start, { zone: request.timeZone });
    if (!start.isValid) return null;

    const end = request.end
      ? DateTime.fromISO(request.end, { zone: request.timeZone })
      : start.plus({ days: 1 });
    if (!end.isValid || end <= start) return null;

    return {
      summary: request.title,
      start: start.toISODate()!,
      end: end.toISODate()!,
      allDay: true,
      timeZone: request.timeZone,
      location: request.location,
      description: request.description,
    };
  }

  const start = DateTime.fromISO(request.start, { setZone: true });
  if (!start.isValid) return null;

  const end = request.end ? DateTime.fromISO(request.end, { setZone: true }) : start.plus({ minutes: 60 });
  if (!end.isValid || end <= start) return null;

  return {
    summary: request.title,
    start: start.toISO()!,
    end: end.toISO()!,
    allDay: false,
    timeZone: request.timeZone,
    location: request.location,
    description: request.description,
  };
}

function describeCalendarEvent(event: GoogleCalendarEvent) {
  const start = event.allDay
    ? calendarDateTime(event.start).toLocaleString(DateTime.DATE_MED)
    : calendarDateTime(event.start).toLocaleString(DateTime.DATETIME_MED);
  const label = start ? `${event.title} (${start})` : event.title;
  return event.htmlLink ? `${label}: ${event.htmlLink}` : label;
}

async function loadCoachWeekCalendarEvents(userId: string) {
  const now = userNow();

  try {
    const calendar = await fetchUpcomingGoogleCalendarEvents(userId, {
      timeMin: now.toJSDate(),
      timeMax: now.plus({ days: 6 }).endOf("day").toJSDate(),
      maxResults: 40,
    });

    return calendar.events;
  } catch {
    return [] as GoogleCalendarEvent[];
  }
}

async function loadCoachWeekUserPlanActivities(userId: string) {
  const now = userNow();
  const startDate = now.toISODate()!;
  const endDate = now.plus({ days: 6 }).toISODate()!;
  return loadUserPlanActivitiesBetween(userId, startDate, endDate);
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
    return {
      message: "",
      memoriesToStore: [],
      shouldRefreshBrief: false,
      todayUpdates: null,
      goalSuggestion: null,
    };
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

    const todayUpdates =
      parsed.todayUpdates && typeof parsed.todayUpdates === "object"
        ? (parsed.todayUpdates as TodayUpdatesPayload)
        : null;

    return {
      message,
      memoriesToStore,
      shouldRefreshBrief: parsed.shouldRefreshBrief === true,
      todayUpdates,
      spotlight:
        parsed.spotlight &&
        typeof parsed.spotlight === "object" &&
        typeof parsed.spotlight.merchant === "string" &&
        typeof parsed.spotlight.headline === "string"
          ? parsed.spotlight
          : null,
      goalSuggestion: parseGoalSuggestion(parsed.goalSuggestion),
      calendarEvent: parseCalendarEventRequest(parsed.calendarEvent),
    };
  } catch {
    return {
      message: content.trim(),
      memoriesToStore: [],
      shouldRefreshBrief: false,
      todayUpdates: null,
      goalSuggestion: null,
      calendarEvent: null,
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

/**
 * Once the coach has already answered a screenshot turn, drop the raw image from
 * later requests. Keeps follow-ups (e.g. "like 9pm") fast and less flaky.
 */
function stripAnsweredImages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((message, index) => {
    if (message.role !== "user" || !message.images?.length) return message;

    const alreadyAnswered = messages
      .slice(index + 1)
      .some((later) => later.role === "assistant");
    if (!alreadyAnswered) return message;

    return { role: message.role, content: message.content };
  });
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

    const recentMessages = stripAnsweredImages(
      (
        savedContextMessages.length > 0
          ? [...savedContextMessages, latestUserMessage]
          : requestMessages
      ).slice(-MAX_CONTEXT_MESSAGES),
    );

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

    const coachIntent = classifyCoachIntent(latestUserMessage.content);
    const [todayBrief, weekCalendarEvents, userPlanActivities] = await Promise.all([
      buildTodayBriefContext(session.user.id),
      loadCoachWeekCalendarEvents(session.user.id),
      loadCoachWeekUserPlanActivities(session.user.id),
    ]);
    const weeklyPlan = buildWeeklyOperatingPlan({
      start: userNow(),
      calendarEvents: weekCalendarEvents,
      userPlanActivities,
    });

    const systemPrompt = buildCoachSystemPrompt({
      intent: coachIntent,
      userName: session.user.name ?? null,
      todayBrief,
      weeklyPlan,
      calendarContext: {
        nowIso: userNow().toISO() ?? new Date().toISOString(),
        timeZone: USER_TIME_ZONE,
      },
      financePack: {
        accounts: accounts.map((a) => ({
          name: a.name,
          spendable:
            a.type === "depository" ? (a.availableBalance ?? a.currentBalance) : a.currentBalance,
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
        })),
        goals: goals.map((g) => ({
          name: g.name,
          target: g.targetAmount,
          current: g.currentAmount,
          targetDate: g.targetDate,
          type: g.category,
          status: g.status,
        })),
        recentTransactions: recentTransactions.map((t) => ({
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
        })),
        recurringPatterns: recurringPatterns.map((pattern) => ({
          merchant: pattern.merchantName,
          amount: pattern.averageAmount,
          frequency: pattern.frequency,
          direction: pattern.direction,
          category: pattern.category,
          lastSeen: pattern.lastSeen,
          confidence: pattern.confidenceScore,
        })),
        projectionContext,
        memories,
        cashSchedule: buildKnownCashScheduleContext(DateTime.local(), { typicalPaycheck }),
        typicalPaycheck,
      },
    });

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

    const todayUpdates = chatResponse.todayUpdates;
    const hasTodayChanges = Boolean(
      todayUpdates &&
        (todayUpdates.skipPlanBlock ||
          todayUpdates.markMoveStatus ||
          todayUpdates.regenerateTodaysMove ||
          todayUpdates.logActivity?.title),
    );

    let todayApplied: string[] = [];
    let refreshedMoveAction: string | null = null;
    if (hasTodayChanges && todayUpdates) {
      const result = await applyTodayUpdates(session.user.id, todayUpdates, todayBrief);
      todayApplied = result.applied;
      refreshedMoveAction = result.refreshedMove?.action ?? null;
    }

    let calendarEventCreated: GoogleCalendarEvent | null = null;
    let calendarEventError: string | null = null;
    if (chatResponse.calendarEvent) {
      const eventInput = buildCalendarEventInput(chatResponse.calendarEvent);
      if (!eventInput) {
        calendarEventError = "I need a clear title, date, and start time before I can create that calendar event.";
      } else {
        try {
          calendarEventCreated = await createGoogleCalendarEvent(session.user.id, eventInput);
          if (!calendarEventCreated) {
            calendarEventError = "Google Calendar created the event, but I could not read back the event details.";
          } else {
            await syncCalendarEventsToGrowth(session.user.id, { daysBack: 14 }).catch((syncError) => {
              console.error("Calendar → Growth sync after create failed:", syncError);
            });
          }
        } catch (calendarError) {
          calendarEventError =
            calendarError instanceof Error
              ? calendarError.message
              : "Google Calendar could not create that event.";
        }
      }
    }

    let assistantHistoryMessage = chatResponse.message;
    if (savedMemoryTitles.length > 0) {
      assistantHistoryMessage += `\n\nSaved for your financial overview: ${savedMemoryTitles.join(", ")}.`;
    }
    if (briefRefreshed) {
      assistantHistoryMessage += "\n\nI refreshed your daily brief. Check Overview for the updated daily spend limit.";
    }
    if (todayApplied.length > 0) {
      assistantHistoryMessage += `\n\nUpdated today: ${todayApplied.join("; ")}.`;
      if (refreshedMoveAction) {
        assistantHistoryMessage += `\nNew move for the rest of today: ${refreshedMoveAction}`;
      }
    }
    if (calendarEventCreated) {
      assistantHistoryMessage += `\n\nCreated on Google Calendar: ${describeCalendarEvent(calendarEventCreated)}`;
    } else if (calendarEventError) {
      assistantHistoryMessage += `\n\nCalendar not updated: ${calendarEventError}`;
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
      intent: coachIntent,
      spotlight: chatResponse.spotlight ?? null,
      goalSuggestion: chatResponse.goalSuggestion ?? null,
      calendarEventCreated,
      calendarEventError,
      memoriesSaved: savedMemoryTitles,
      briefRefreshed,
      todayUpdated: todayApplied.length > 0,
      todayApplied,
      refreshedMoveAction,
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
