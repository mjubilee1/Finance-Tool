import { DateTime } from "luxon";

export const CAR_PAYMENT_MONTHLY = 513;
export const CAR_INSURANCE_MONTHLY = 352;
export const CAR_PAYMENT_DEFAULT_NEXT_DUE = "2026-08-31";
export const CAR_INSURANCE_DEFAULT_NEXT_DUE = "2026-08-17";
export const CAR_FUNDED_BY = "Capital One";

/** Financed amount on the retail installment contract. */
export const CAR_LOAN_AMOUNT = 26436;
/** Remaining principal default (same as financed until payments update it). */
export const CAR_LOAN_BALANCE = 26436;
/** 3.5-year payoff horizon. */
export const CAR_LOAN_TERM_MONTHS = 42;
export const CAR_LOAN_START_DATE = "2026-07-01";
/** Monthly amount aimed at the loan (contract payment + extras when cash allows). */
export const CAR_PAYOFF_TARGET_MONTHLY = 800;
/** Odometer at handoff (~20,313) plus a small buffer for recent miles. */
export const CAR_ODOMETER_MILES = 20340;
export const CAR_ODOMETER_AS_OF = "2026-07-18";

export const CAR_MAINTENANCE_TYPES = [
  { id: "oil_change", label: "Oil change" },
  { id: "tires", label: "Tires / rotation" },
  { id: "brakes", label: "Brakes" },
  { id: "inspection", label: "Inspection" },
  { id: "fluids", label: "Fluids" },
  { id: "wash", label: "Wash / detail" },
  { id: "other", label: "Other" },
] as const;

export type CarMaintenanceTypeId = (typeof CAR_MAINTENANCE_TYPES)[number]["id"];

export type CarDocumentSubsection = "payment" | "insurance" | "general";

export type CarDocumentMeta = {
  id: string;
  title: string;
  description: string;
  subsection: CarDocumentSubsection;
  filename: string;
};

/** Purchase / protection docs for the owned car (served from storage/car-documents). */
export const CAR_DOCUMENTS: CarDocumentMeta[] = [
  {
    id: "retail-installment",
    title: "Retail Installment Sale Contract",
    description: "Financing contract for the vehicle purchase.",
    subsection: "payment",
    filename: "Retail Installment Sale Contract 553-VA-ARB-EPS 05-2417160761753775160293.pdf",
  },
  {
    id: "gap",
    title: "GAP Coverage",
    description: "Guaranteed Asset Protection agreement.",
    subsection: "payment",
    filename: "TCA GAP5499014965261379515.pdf",
  },
  {
    id: "vsc",
    title: "Vehicle Service Contract",
    description: "Extended service / warranty contract.",
    subsection: "payment",
    filename: "TCA VSC10699911668407954593.pdf",
  },
];

export function getCarDocument(id: string) {
  return CAR_DOCUMENTS.find((doc) => doc.id === id) ?? null;
}

export function carDocumentsForSubsection(subsection: CarDocumentSubsection) {
  return CAR_DOCUMENTS.filter((doc) => doc.subsection === subsection);
}

export type CarProfileLike = {
  paymentMonthly: number;
  paymentNextDue: string;
  insuranceMonthly: number;
  insuranceNextDue: string;
  loanAmount: number;
  loanBalance: number;
  loanTermMonths: number;
  loanStartDate: string;
  payoffTargetMonthly: number;
  odometerMiles: number;
  odometerAsOf: string;
  notes?: string | null;
};

export function defaultCarProfile(): CarProfileLike {
  return {
    paymentMonthly: CAR_PAYMENT_MONTHLY,
    paymentNextDue: CAR_PAYMENT_DEFAULT_NEXT_DUE,
    insuranceMonthly: CAR_INSURANCE_MONTHLY,
    insuranceNextDue: CAR_INSURANCE_DEFAULT_NEXT_DUE,
    loanAmount: CAR_LOAN_AMOUNT,
    loanBalance: CAR_LOAN_BALANCE,
    loanTermMonths: CAR_LOAN_TERM_MONTHS,
    loanStartDate: CAR_LOAN_START_DATE,
    payoffTargetMonthly: CAR_PAYOFF_TARGET_MONTHLY,
    odometerMiles: CAR_ODOMETER_MILES,
    odometerAsOf: CAR_ODOMETER_AS_OF,
    notes: null,
  };
}

export function parseIsoDate(value: string | null | undefined) {
  if (!value?.trim()) return null;
  const dt = DateTime.fromISO(value.trim(), { zone: "America/New_York" });
  return dt.isValid ? dt.startOf("day") : null;
}

export function formatCarDueLabel(isoDate: string) {
  const dt = parseIsoDate(isoDate);
  if (!dt) return isoDate;
  return dt.toFormat("MMM d, yyyy");
}

/** Monthly car fixed costs funded from Capital One. */
export function carMonthlyTotal(profile: Pick<CarProfileLike, "paymentMonthly" | "insuranceMonthly">) {
  return Math.round((profile.paymentMonthly + profile.insuranceMonthly) * 100) / 100;
}

export type CarUpcomingBill = {
  kind: "payment" | "insurance";
  label: string;
  amount: number;
  dueDate: string;
  account: typeof CAR_FUNDED_BY;
};

export function carUpcomingBills(
  profile: CarProfileLike,
  withinDays = 45,
  todayIso?: string,
): CarUpcomingBill[] {
  const today = todayIso
    ? DateTime.fromISO(todayIso, { zone: "America/New_York" }).startOf("day")
    : DateTime.now().setZone("America/New_York").startOf("day");
  if (!today.isValid) return [];

  const horizon = today.plus({ days: withinDays });
  const bills: CarUpcomingBill[] = [];

  const paymentDue = parseIsoDate(profile.paymentNextDue);
  if (paymentDue && paymentDue >= today && paymentDue <= horizon) {
    bills.push({
      kind: "payment",
      label: "Car payment",
      amount: profile.paymentMonthly,
      dueDate: paymentDue.toISODate()!,
      account: CAR_FUNDED_BY,
    });
  }

  const insuranceDue = parseIsoDate(profile.insuranceNextDue);
  if (insuranceDue && insuranceDue >= today && insuranceDue <= horizon) {
    bills.push({
      kind: "insurance",
      label: "Car insurance",
      amount: profile.insuranceMonthly,
      dueDate: insuranceDue.toISODate()!,
      account: CAR_FUNDED_BY,
    });
  }

  return bills.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export function formatCarBillLine(bill: CarUpcomingBill) {
  return `${bill.label} $${bill.amount.toFixed(0)} from ${bill.account} due ${formatCarDueLabel(bill.dueDate)}`;
}

export function carMaintenanceTypeLabel(serviceType: string) {
  return CAR_MAINTENANCE_TYPES.find((t) => t.id === serviceType)?.label ?? serviceType;
}

export type CarPayoffSummary = {
  loanAmount: number;
  loanBalance: number;
  paidDown: number;
  progressPct: number;
  termMonths: number;
  monthsElapsed: number;
  monthsRemainingOnTerm: number;
  targetPayoffDate: string | null;
  monthsAtContractPayment: number | null;
  monthsAtPayoffTarget: number | null;
  payoffDateAtContract: string | null;
  payoffDateAtTarget: string | null;
  onTrackForTerm: boolean | null;
};

/** Payoff math for the financed car — term clock + pace at contract vs $800 target. */
export function summarizeCarPayoff(
  profile: Pick<
    CarProfileLike,
    | "loanAmount"
    | "loanBalance"
    | "loanTermMonths"
    | "loanStartDate"
    | "paymentMonthly"
    | "payoffTargetMonthly"
  >,
  todayIso?: string,
): CarPayoffSummary {
  const today = todayIso
    ? DateTime.fromISO(todayIso, { zone: "America/New_York" }).startOf("day")
    : DateTime.now().setZone("America/New_York").startOf("day");
  const start = parseIsoDate(profile.loanStartDate);
  const loanAmount = Math.max(0, profile.loanAmount);
  const loanBalance = Math.max(0, Math.min(profile.loanBalance, loanAmount || profile.loanBalance));
  const paidDown = Math.max(0, loanAmount - loanBalance);
  const progressPct =
    loanAmount > 0 ? Math.round(Math.min(100, (paidDown / loanAmount) * 1000) / 10) : 0;

  const termMonths = Math.max(1, Math.round(profile.loanTermMonths));
  const monthsElapsed =
    start && today.isValid
      ? Math.max(0, Math.floor(today.diff(start, "months").months))
      : 0;
  const monthsRemainingOnTerm = Math.max(0, termMonths - monthsElapsed);
  const targetPayoffDate =
    start?.plus({ months: termMonths }).toISODate() ?? null;

  const monthsAtRate = (monthly: number) => {
    if (loanBalance <= 0) return 0;
    if (!(monthly > 0)) return null;
    return Math.ceil(loanBalance / monthly);
  };

  const monthsAtContractPayment = monthsAtRate(profile.paymentMonthly);
  const monthsAtPayoffTarget = monthsAtRate(profile.payoffTargetMonthly);
  const payoffFromMonths = (months: number | null) => {
    if (months == null || !today.isValid) return null;
    return today.plus({ months }).toISODate();
  };

  const onTrackForTerm =
    monthsAtPayoffTarget == null
      ? null
      : monthsAtPayoffTarget <= monthsRemainingOnTerm || loanBalance <= 0;

  return {
    loanAmount,
    loanBalance,
    paidDown,
    progressPct,
    termMonths,
    monthsElapsed,
    monthsRemainingOnTerm,
    targetPayoffDate,
    monthsAtContractPayment,
    monthsAtPayoffTarget,
    payoffDateAtContract: payoffFromMonths(monthsAtContractPayment),
    payoffDateAtTarget: payoffFromMonths(monthsAtPayoffTarget),
    onTrackForTerm,
  };
}

export function formatOdometer(miles: number) {
  return `${Math.round(miles).toLocaleString("en-US")} mi`;
}
