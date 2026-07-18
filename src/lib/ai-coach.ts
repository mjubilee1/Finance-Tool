import { openai } from "./openai";
import { prisma } from "./prisma";
import { getCostControlConfig } from "./env";
import {
  carUpcomingBills,
  formatCarBillLine,
  formatOdometer,
  summarizeCarPayoff,
  type CarProfileLike,
} from "./car";
import { getOrCreateCarProfile } from "./car-profile";
import { buildKnownCashScheduleContext, CFO_AGENT_INSTRUCTIONS, CFO_BRIEF_JSON_CONTRACT } from "./cfo-agent";
import { calculateDailyBriefMetrics } from "./daily-brief";
import { filterTransactionsByFocus, getFocusAccounts } from "./account-focus";
import { storeFinancialMemories } from "./financial-memory";
import { DateTime } from "luxon";

type NewMemory = {
  title: string;
  content: string;
  importanceScore: number;
};

type PromptAccount = {
  name: string;
  type: string;
  subtype: string | null;
  currentBalance: number | null;
  availableBalance: number | null;
  isPrimary?: boolean;
  creditLimit?: number | null;
  aprPercent?: number | null;
  minimumPayment?: number | null;
  dueDay?: number | null;
  statementDay?: number | null;
};

type PromptGoal = {
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string | null;
};

type CfoAccount = {
  name: string;
  type: string;
  subtype: string | null;
  currentBalance: number | null;
  availableBalance: number | null;
};

type CfoTransaction = {
  name: string;
  merchantName: string | null;
  amount: number;
  categoryPrimary: string | null;
  customCategory: string | null;
  isTenantPaymentCandidate: boolean;
  isFoodCandidate: boolean;
  isTransportationCandidate: boolean;
  isUtilityCandidate: boolean;
  date: string;
};

type CfoRecurringPattern = {
  merchantName: string | null;
  averageAmount: number;
  frequency: string;
  direction: string;
  category: string | null;
  lastSeen: string;
};

function mergeUpcomingBills(
  aiBills: unknown,
  carBills: string[],
  fallbackBills: string[],
) {
  const fromAi = Array.isArray(aiBills)
    ? aiBills.filter((item): item is string => typeof item === "string")
    : [];
  const base = fromAi.length > 0 ? fromAi : fallbackBills;
  const merged = [...carBills];
  for (const bill of base) {
    const isCarBill = /car (payment|insurance)/i.test(bill);
    if (isCarBill && carBills.some((car) => bill.includes(car.split(" • ")[1] ?? ""))) {
      continue;
    }
    if (!merged.includes(bill)) merged.push(bill);
  }
  return merged.slice(0, 10);
}

function buildFallbackCfoInsight(params: {
  accounts: CfoAccount[];
  recentTransactions: CfoTransaction[];
  recurringPatterns: CfoRecurringPattern[];
  carProfile?: CarProfileLike | null;
}) {
  const checkingBalance = params.accounts
    .filter((account) => account.type === "depository")
    .reduce((sum, account) => sum + (account.availableBalance ?? account.currentBalance ?? 0), 0);
  const totalCreditDebt = params.accounts
    .filter((account) => account.type === "credit")
    .reduce((sum, account) => sum + Math.max(0, account.currentBalance ?? 0), 0);
  const recentIncome = params.recentTransactions
    .filter((transaction) => transaction.amount < 0)
    .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
  const recentSpend = params.recentTransactions
    .filter((transaction) => transaction.amount > 0)
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const foodSpend = params.recentTransactions
    .filter((transaction) => transaction.isFoodCandidate)
    .reduce((sum, transaction) => sum + Math.max(0, transaction.amount), 0);
  const tenantRentSeen = params.recentTransactions.some((transaction) => transaction.isTenantPaymentCandidate);
  const recurringBills = params.recurringPatterns
    .filter((pattern) => pattern.direction === "expense")
    .slice(0, 5)
    .map((pattern) => `Date needed • ${pattern.merchantName ?? "Recurring bill"} • ${pattern.frequency} • $${Math.abs(pattern.averageAmount).toFixed(2)}`);
  const carBills = params.carProfile
    ? carUpcomingBills(params.carProfile, 45).map((bill) => {
        const day = DateTime.fromISO(bill.dueDate).toFormat("ccc LLL d");
        return `${day} • ${bill.label} • $${bill.amount.toFixed(0)} • ${bill.account}`;
      })
    : [];
  const upcomingBills = [...carBills, ...recurringBills].slice(0, 8);

  const buffer = 1000;
  const safeSpendToday = Math.max(0, Math.min(40, Math.floor((checkingBalance - buffer) / 14)));
  const status = checkingBalance < 1500 || !tenantRentSeen ? "conservative mode" : "stable";
  const debtMove = checkingBalance <= buffer + 500
    ? "Hold cash today. Do not make an extra debt payment until mortgage, minimum payments, car obligations, and the emergency buffer are clearly protected."
    : "Hold extra debt payments until APRs, minimum payments, credit limits, and due dates are entered. Then use avalanche and target the highest APR card first.";

  return {
    cfoBrief: {
      status,
      cashSafety: `Checking shows about ${checkingBalance.toFixed(2)} available. Protect mortgage, minimums, Capital One car payment + insurance, and at least a ${buffer.toFixed(0)} cash buffer before extra debt payments.`,
      upcomingBills: upcomingBills.length > 0
        ? upcomingBills
        : ["Date needed • No due-date data is stored yet. Add due dates for mortgage, cards, utilities, IRS, car insurance, and subscriptions."],
      incomeExpected: tenantRentSeen
        ? [`Timing needed • Tenant rent pattern detected recently. Keep Capital One car payment and insurance current.`]
        : [`Timing needed • No tenant rent, paycheck, or refund pattern detected in the current transaction set.`],
      safeSpendToday,
      safeSpendTodayReason: `Default discretionary target is about $40/day for food/fun variable spend — not income and not bill coverage. Gas and car operating costs sit outside this number. Capital One funds the owned-car payment and insurance. This keeps checking above the protected cash buffer while bill due dates and debt minimums are incomplete.`,
      debtMove,
      spendingWarning: foodSpend > 0
        ? `Food/convenience spending appears in the recent transactions. Keep food tight today and avoid using credit cards for food.`
        : `Recent leakage is more visible in interest charges, travel/transportation, and house-related spending than food data so far.`,
      todaysMove: safeSpendToday > 0
        ? `Keep spending under ${safeSpendToday.toFixed(0)} today and hold cash until upcoming bill dates and card minimums are confirmed.`
        : "Hold cash today. Do not make extra debt payments until the buffer and upcoming bills are covered.",
    },
    dailySummary: `Conservative mode because checking is limited relative to mortgage, credit card debt, and missing bill due-date/minimum-payment data.`,
    financialHealthScore: checkingBalance > buffer ? 70 : 55,
    scoreReasoning: "Fallback score based on checking buffer, visible credit debt, and incomplete upcoming bill/debt-detail data.",
    spendingTrend: {
      dailyAverageLast7Days: recentSpend / 7,
      dailyAveragePrevious7Days: 0,
      difference: recentSpend / 7,
      status: "stable",
    },
    wins: recentIncome > 0 ? [`Recent payments/income total about ${recentIncome.toFixed(2)}.`] : [],
    warnings: [
      `Visible credit card balances total about ${totalCreditDebt.toFixed(2)}.`,
      "APR, minimum payment, credit limit, due date, and statement date data is incomplete.",
    ],
    recommendedActions: [
      {
        title: "Hold cash and confirm bill/debt details",
        estimatedSavings: 0,
        difficulty: "easy",
        reason: "Coach rules require mortgage, minimum payments, upcoming bills, and the cash buffer to be protected before extra debt payments.",
      },
    ],
    recurringTransactionsToReview: [],
    possibleTenantPayments: [],
    newMemoriesToStore: [],
  };
}

export function calculateFinancialHealthScore(params: {
  current7DayAvg: number;
  prev7DayAvg: number;
  monthlyIncome: number;
  monthlySpend: number;
  isRecurringStable: boolean;
  hasOverdraftRisk: boolean;
  discretionarySpend: number;
  discretionaryTarget: number;
  foodSpendIncreasing: boolean;
  recurringBillsIncreased: boolean;
  balanceTrendingDown: boolean;
  uncategorizedCount: number;
}): number {
  let score = 70;

  if (params.current7DayAvg < params.prev7DayAvg) score += 10;
  if (params.monthlyIncome > params.monthlySpend) score += 10;
  if (params.isRecurringStable) score += 5;
  if (!params.hasOverdraftRisk) score += 5;
  if (params.discretionarySpend <= params.discretionaryTarget) score += 5;

  if (params.current7DayAvg > params.discretionaryTarget * 1.2) score -= 10; // "above target for 3+ days" proxy
  if (params.foodSpendIncreasing) score -= 10;
  if (params.recurringBillsIncreased) score -= 10;
  if (params.monthlySpend > params.monthlyIncome) score -= 15;
  if (params.balanceTrendingDown) score -= 10;
  if (params.uncategorizedCount > 10) score -= 5;

  return Math.max(0, Math.min(100, score));
}

export async function generateDailyInsight(userId: string) {
  const {
    aiDailyMemoryLimit,
    aiMemoryMinImportance,
  } = getCostControlConfig();

  // 1. Fetch relevant user context
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");

  const today = new Date();
  const past30Days = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  const todayDate = today.toISOString().slice(0, 10);
  const past30DaysDate = past30Days.toISOString().slice(0, 10);

  const recentTransactions = await prisma.transaction.findMany({
    where: {
      userId,
      date: { gte: past30DaysDate },
    },
    orderBy: { date: "desc" },
    take: 100,
  });

  const [recurringPatterns, memoryRecords, accounts, goals, carProfile] = await Promise.all([
    prisma.recurringPattern.findMany({
      where: { userId },
      take: 20,
    }),
    prisma.financialMemory.findMany({
      where: { userId },
      orderBy: { importanceScore: "desc" },
      take: 5,
    }),
    prisma.financialAccount.findMany({
      where: { userId },
    }),
    prisma.financialGoal.findMany({
      where: { userId, status: "active" },
    }),
    getOrCreateCarProfile(userId),
  ]);

  const carBillLines = carUpcomingBills(carProfile, 45).map(formatCarBillLine);

  const focusAccounts = getFocusAccounts(accounts);
  const focusTransactions = filterTransactionsByFocus(recentTransactions, accounts);

  const dailyMetrics = calculateDailyBriefMetrics({
    date: todayDate,
    transactions: focusTransactions,
    accounts: focusAccounts,
  });

  const memories = memoryRecords
    .map((memory: { content: string }) => memory.content)
    .join("\n");

  // 3. Build Prompt
  const prompt = `
${CFO_AGENT_INSTRUCTIONS}

Analyze the user's data and provide JSON. This is the daily brief, so lead with concrete next actions and only use numbers supported by the supplied data.
Assess impact on the bigger financial system — not just savings tips. Explain how today's move hardens stability or accelerates growth (debt, credit, reserves, rental readiness).
Crucially, look at Current Accounts, Financial Goals, recent income, recurring obligations, debt accounts, and spending patterns. Look for opportunities to optimize daily transaction costs while protecting mortgage, minimum payments, upcoming bills, and cash buffer first.

${buildKnownCashScheduleContext(DateTime.local(), { carProfile })}

OWNED CAR OBLIGATIONS (Capital One — include in upcomingBills when due):
${carBillLines.length > 0 ? carBillLines.map((line) => `- ${line}`).join("\n") : "- None due in the next 45 days; still track payment and insurance next-due dates from the Car profile."}
- Loan: ~$${carProfile.loanBalance.toFixed(0)} remaining of $${carProfile.loanAmount.toFixed(0)} financed; ${carProfile.loanTermMonths}-month (3.5y) payoff horizon; aim ~$${carProfile.payoffTargetMonthly}/mo toward the loan when cash allows (contract payment ~$${carProfile.paymentMonthly}).
- Odometer: ${formatOdometer(carProfile.odometerMiles)} as of ${carProfile.odometerAsOf}. Keep maintenance current so the asset stays healthy through payoff.
- Payoff pace: ${(() => {
  const payoff = summarizeCarPayoff(carProfile);
  return `~${payoff.monthsRemainingOnTerm} mo left on term` +
    (payoff.payoffDateAtTarget ? `; at $${carProfile.payoffTargetMonthly}/mo target ~${payoff.monthsAtPayoffTarget} mo` : "") +
    (payoff.onTrackForTerm === false ? " — behind 3.5y target pace at current target" : payoff.onTrackForTerm ? " — on track for 3.5y target" : "");
})()}.

MEMORIES:
${memories}

CURRENT ACCOUNTS (For cash decisions use available/spendable, not ledger current. Primary accounts drive cash-flow math when starred. For credit cards use balance + creditLimit + aprPercent for utilization and avalanche.):
${JSON.stringify((accounts as PromptAccount[]).map((a) => ({
    name: a.name,
    type: a.type,
    subtype: a.subtype,
    spendable: a.type === "depository" ? (a.availableBalance ?? a.currentBalance) : a.currentBalance,
    ledgerCurrent: a.currentBalance,
    availableBalance: a.availableBalance,
    isPrimary: a.isPrimary ?? false,
    creditLimit: a.creditLimit ?? null,
    aprPercent: a.aprPercent ?? null,
    minimumPayment: a.minimumPayment ?? null,
    dueDay: a.dueDay ?? null,
    statementDay: a.statementDay ?? null,
    utilizationPct:
      a.type === "credit" && a.creditLimit && a.creditLimit > 0
        ? Math.round(((a.currentBalance ?? 0) / a.creditLimit) * 1000) / 10
        : null,
  })))}

PRIMARY CASH-FLOW ACCOUNTS IN USE (spendable balances):
${JSON.stringify(focusAccounts.map((a) => ({
    name: a.name,
    type: a.type,
    spendable: a.type === "depository" ? (a.availableBalance ?? a.currentBalance) : a.currentBalance,
    availableBalance: a.availableBalance,
  })))}

FINANCIAL GOALS:
${JSON.stringify((goals as PromptGoal[]).map((g) => ({ name: g.name, target: g.targetAmount, current: g.currentAmount, targetDate: g.targetDate })))}

SYSTEM-CALCULATED DAILY LIMIT:
${JSON.stringify({
    date: dailyMetrics.date,
    dailyAllowance: dailyMetrics.dailyAllowance,
    safeSpendToday: dailyMetrics.safeSpendToday,
    safeSpendTodayReason: dailyMetrics.safeSpendTodayReason,
    cashAvailable: dailyMetrics.cashAvailable,
    discretionarySpentToday: dailyMetrics.discretionarySpentToday,
    foodSpend: dailyMetrics.foodSpend,
    transportationSpend: dailyMetrics.transportationSpend,
    billsSpend: dailyMetrics.billsSpend,
    totalSpentToday: dailyMetrics.totalSpent,
    incomeToday: dailyMetrics.totalIncome,
    recentDailySpendAverage: dailyMetrics.recentDailySpendAverage,
  })}
safeSpendToday is remaining food/fun room today. dailyAllowance is the ~$40/day food/fun target. Gas, car costs, and bills do NOT count against it. Never raise safeSpendToday above the system-calculated dailyAllowance.
Capital One funds the owned-car payment and insurance — keep those current before Cap One fun/goals spend.

RECENT TRANSACTIONS (last 30 days, primary accounts when set):
${JSON.stringify(focusTransactions.slice(0, 60).map((transaction: {
    name: string;
    merchantName: string | null;
    amount: number;
    categoryPrimary: string | null;
    categoryDetailed: string | null;
    customCategory: string | null;
    isTenantPaymentCandidate: boolean;
    isFoodCandidate: boolean;
    isTransportationCandidate: boolean;
    isUtilityCandidate: boolean;
    date: string;
  }) => ({
    name: transaction.name,
    merchant: transaction.merchantName,
    amount: transaction.amount,
    category: transaction.customCategory ?? transaction.categoryPrimary,
    detailedCategory: transaction.categoryDetailed,
    date: transaction.date,
    flags: {
      possibleTenantRent: transaction.isTenantPaymentCandidate,
      food: transaction.isFoodCandidate,
      transportation: transaction.isTransportationCandidate,
      utility: transaction.isUtilityCandidate,
    },
  })))}

RECURRING PATTERNS:
${JSON.stringify(recurringPatterns.map((pattern: {
    merchantName: string | null;
    averageAmount: number;
    frequency: string;
    direction: string;
    category: string | null;
    lastSeen: string;
    confidenceScore: number;
  }) => ({
    merchant: pattern.merchantName,
    amount: pattern.averageAmount,
    freq: pattern.frequency,
    direction: pattern.direction,
    category: pattern.category,
    lastSeen: pattern.lastSeen,
    confidence: pattern.confidenceScore,
  })))}

${CFO_BRIEF_JSON_CONTRACT}

Generate a JSON response exactly matching this structure:
{
  "cfoBrief": {
    "status": "stable",
    "cashSafety": "...",
    "upcomingBills": ["Mon Jul 13 • Netflix • $18.99", "Date needed • Credit card minimum • amount unknown"],
    "incomeExpected": ["Fri Jul 17 • W2 paycheck • ~$1,555", "Timing needed • Tenant rent pattern detected recently"],
    "safeSpendToday": 40,
    "safeSpendTodayReason": "...",
    "debtMove": "...",
    "spendingWarning": "...",
    "todaysMove": "...",
    "systemImpact": "..."
  },
  "dailySummary": "...", // Connect cash flow, debt, and goals to the bigger reinforcing system — not just what happened
  "financialHealthScore": 72,
  "scoreReasoning": "...",
  "spendingTrend": {
    "dailyAverageLast7Days": 52.10,
    "dailyAveragePrevious7Days": 70.25,
    "difference": -18.15,
    "status": "improving" // or "worsening", "stable"
  },
  "wins": ["..."],
  "warnings": ["..."],
  "recommendedActions": [
    {
      "title": "...",
      "estimatedSavings": 60,
      "difficulty": "easy",
      "reason": "...", // include where freed money should flow next and what part of the system it strengthens
      "systemImpact": "..." // one sentence: protects core, funds growth, or stops a leak in the reinforcing loop
    }
  ],
  "recurringTransactionsToReview": [
    {
      "merchant": "...",
      "averageAmount": 15.99,
      "frequency": "monthly",
      "recommendation": "...", // include system impact: keep, cut, or renegotiate — and what that does for the bigger picture
    }
  ],
  "possibleTenantPayments": [
    {
      "name": "...",
      "averageAmount": 1000,
      "confidence": 0.8,
      "note": "..."
    }
  ],
  "newMemoriesToStore": [
    {
      "title": "...",
      "content": "...",
      "importanceScore": 9
    }
  ]
}
`;

  const response = await openai.chat.completions.create({
    model: "gpt-5",
    messages: [{ role: "system", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 1200,
  });

  const content = response.choices[0].message.content || "{}";
  const parsedInsight = JSON.parse(content);
  const fallbackInsight = buildFallbackCfoInsight({
    accounts: accounts as CfoAccount[],
    recentTransactions: recentTransactions as CfoTransaction[],
    recurringPatterns: recurringPatterns as CfoRecurringPattern[],
    carProfile,
  });
  const carUpcomingLines = carUpcomingBills(carProfile, 45).map((bill) => {
    const day = DateTime.fromISO(bill.dueDate).toFormat("ccc LLL d");
    return `${day} • ${bill.label} • $${bill.amount.toFixed(0)} • ${bill.account}`;
  });
  const insight = parsedInsight?.cfoBrief
    ? {
        ...fallbackInsight,
        ...parsedInsight,
        cfoBrief: {
          ...fallbackInsight.cfoBrief,
          ...parsedInsight.cfoBrief,
          upcomingBills: mergeUpcomingBills(
            parsedInsight.cfoBrief?.upcomingBills,
            carUpcomingLines,
            fallbackInsight.cfoBrief.upcomingBills,
          ),
        },
      }
    : fallbackInsight;

  // 4. Save only high-value new memories. Pinecone writes are opt-in because
  // Prisma reads are enough while each user has a small memory set.
  const memoriesToStore = Array.isArray(insight.newMemoriesToStore)
    ? (insight.newMemoriesToStore
        .filter((mem: NewMemory) => (mem.importanceScore ?? 0) >= aiMemoryMinImportance)
        .slice(0, aiDailyMemoryLimit) as NewMemory[])
    : [];

  if (memoriesToStore.length > 0) {
    await storeFinancialMemories(userId, memoriesToStore, {
      source: "Daily Insight",
      type: "AI_GENERATED",
    });
  }

  return insight;
}
