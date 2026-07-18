import { DateTime } from "luxon";
import { CAR_FUNDED_BY, carMonthlyTotal, type CarProfileLike } from "@/lib/car";

export type CapOneAccountRow = {
  plaidAccountId: string;
  plaidItemId: string;
  name: string;
  type: string;
  availableBalance: number | null;
  currentBalance: number | null;
};

export type CapOneTxnRow = {
  accountId: string;
  date: string;
  amount: number;
  name: string | null;
  merchantName: string | null;
  categoryPrimary: string | null;
};

export type CapOneProjectionPoint = {
  date: string;
  projectedBalance: number;
  /** Balance if we always reserve the car payment + insurance floor. */
  afterCarFloorBalance: number;
};

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export function isCapitalOneInstitution(name: string | null | undefined) {
  return Boolean(name && /capital\s*one/i.test(name));
}

function isLyftInflow(txn: CapOneTxnRow) {
  if (txn.amount >= 0) return false;
  const hay = `${txn.name ?? ""} ${txn.merchantName ?? ""} ${txn.categoryPrimary ?? ""}`.toLowerCase();
  return hay.includes("lyft");
}

function isInternalCapOneTransfer(txn: CapOneTxnRow) {
  const hay = `${txn.name ?? ""} ${txn.merchantName ?? ""}`.toLowerCase();
  const category = (txn.categoryPrimary ?? "").toLowerCase();
  if (!category.includes("transfer") && !hay.includes("transfer") && !hay.includes("withdrawal to") && !hay.includes("deposit from")) {
    return false;
  }
  return (
    hay.includes("360 checking") ||
    hay.includes("360 performance") ||
    hay.includes("performance savings") ||
    (hay.includes("capital one") && (hay.includes("checking") || hay.includes("savings")))
  );
}

/**
 * Build Capital One–only cash projection: Lyft + other Cap One inflows vs spend,
 * with an explicit car payment + insurance floor reserved from that account.
 */
export function buildCapitalOneProjection(params: {
  accounts: CapOneAccountRow[];
  transactions: CapOneTxnRow[];
  carProfile: Pick<CarProfileLike, "paymentMonthly" | "insuranceMonthly">;
  horizonDays?: number;
  stepDays?: number;
}) {
  const horizonDays = params.horizonDays ?? 180;
  const stepDays = params.stepDays ?? 15;
  const depository = params.accounts.filter((account) => account.type === "depository");

  const currentBalance = round2(
    depository.reduce((sum, account) => {
      const spendable = account.availableBalance ?? account.currentBalance ?? 0;
      return sum + spendable;
    }, 0),
  );

  const accountBreakdown = depository.map((account) => ({
    name: account.name,
    balance: round2(account.availableBalance ?? account.currentBalance ?? 0),
  }));

  let totalIncome = 0;
  let totalSpend = 0;
  let lyftIncome = 0;
  let earliestMs: number | null = null;
  let latestMs: number | null = null;

  for (const txn of params.transactions) {
    if (isInternalCapOneTransfer(txn)) continue;

    const ms = DateTime.fromISO(txn.date).toMillis();
    if (Number.isFinite(ms)) {
      earliestMs = earliestMs == null ? ms : Math.min(earliestMs, ms);
      latestMs = latestMs == null ? ms : Math.max(latestMs, ms);
    }

    if (txn.amount < 0) {
      const inflow = Math.abs(txn.amount);
      totalIncome += inflow;
      if (isLyftInflow(txn)) lyftIncome += inflow;
    } else if (txn.amount > 0) {
      totalSpend += txn.amount;
    }
  }

  const spanDays =
    earliestMs != null && latestMs != null
      ? Math.max(1, (latestMs - earliestMs) / (24 * 60 * 60 * 1000))
      : 1;
  const daysAnalyzed = Math.max(1, Math.round(spanDays));

  const dailyAverageIncome = totalIncome / daysAnalyzed;
  const dailyAverageSpend = totalSpend / daysAnalyzed;
  const lyftDailyAverage = lyftIncome / daysAnalyzed;
  const observedNetDaily = dailyAverageIncome - dailyAverageSpend;

  const monthlyCarFloor = carMonthlyTotal(params.carProfile);
  const carFloorDaily = monthlyCarFloor / 30.4375;
  // Reserve car floor on top of observed spend so the chart shows Cap One after obligations.
  const netAfterCarFloorDaily = observedNetDaily - carFloorDaily;

  const today = DateTime.now();
  const projectionData: CapOneProjectionPoint[] = [];
  for (let i = 0; i <= horizonDays; i += stepDays) {
    projectionData.push({
      date: today.plus({ days: i }).toISODate() ?? "",
      projectedBalance: round2(currentBalance + observedNetDaily * i),
      afterCarFloorBalance: round2(currentBalance + netAfterCarFloorDaily * i),
    });
  }

  const project = (days: number, net: number) => round2(currentBalance + net * days);

  return {
    institution: CAR_FUNDED_BY,
    metrics: {
      currentBalance,
      accountBreakdown,
      daysAnalyzed,
      totalIncome: round2(totalIncome),
      totalSpend: round2(totalSpend),
      lyftIncome: round2(lyftIncome),
      dailyAverageIncome: round2(dailyAverageIncome),
      dailyAverageSpend: round2(dailyAverageSpend),
      lyftDailyAverage: round2(lyftDailyAverage),
      observedNetDaily: round2(observedNetDaily),
      monthlyCarFloor: round2(monthlyCarFloor),
      carFloorDaily: round2(carFloorDaily),
      netAfterCarFloorDaily: round2(netAfterCarFloorDaily),
      paymentMonthly: params.carProfile.paymentMonthly,
      insuranceMonthly: params.carProfile.insuranceMonthly,
    },
    milestones: {
      balanceIn30Days: project(30, observedNetDaily),
      balanceIn90Days: project(90, observedNetDaily),
      balanceIn180Days: project(180, observedNetDaily),
      afterCarFloorIn30Days: project(30, netAfterCarFloorDaily),
      afterCarFloorIn90Days: project(90, netAfterCarFloorDaily),
      afterCarFloorIn180Days: project(180, netAfterCarFloorDaily),
    },
    projectionData,
  };
}
