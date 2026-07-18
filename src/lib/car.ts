import { DateTime } from "luxon";

export const CAR_PAYMENT_MONTHLY = 513;
export const CAR_INSURANCE_MONTHLY = 352;
export const CAR_PAYMENT_DEFAULT_NEXT_DUE = "2026-08-31";
export const CAR_INSURANCE_DEFAULT_NEXT_DUE = "2026-08-17";
export const CAR_FUNDED_BY = "Capital One";

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
  notes?: string | null;
};

export function defaultCarProfile(): CarProfileLike {
  return {
    paymentMonthly: CAR_PAYMENT_MONTHLY,
    paymentNextDue: CAR_PAYMENT_DEFAULT_NEXT_DUE,
    insuranceMonthly: CAR_INSURANCE_MONTHLY,
    insuranceNextDue: CAR_INSURANCE_DEFAULT_NEXT_DUE,
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
