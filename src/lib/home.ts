import { DateTime } from "luxon";

export const HOME_MORTGAGE_MONTHLY = 2659;
export const HOME_PROPERTY_LABEL = "Oxon Hill row home";

export const HOME_MAINTENANCE_TYPES = [
  { id: "plumbing", label: "Plumbing" },
  { id: "electrical", label: "Electrical" },
  { id: "hvac", label: "HVAC" },
  { id: "appliance", label: "Appliance" },
  { id: "pest", label: "Pest" },
  { id: "roof", label: "Roof / exterior" },
  { id: "flooring", label: "Flooring" },
  { id: "paint", label: "Paint / finish" },
  { id: "issue", label: "General issue" },
  { id: "other", label: "Other" },
] as const;

export type HomeMaintenanceTypeId = (typeof HOME_MAINTENANCE_TYPES)[number]["id"];

export const HOME_MAINTENANCE_STATUSES = [
  { id: "open", label: "Open" },
  { id: "in_progress", label: "In progress" },
  { id: "resolved", label: "Resolved" },
] as const;

export type HomeMaintenanceStatusId = (typeof HOME_MAINTENANCE_STATUSES)[number]["id"];

export const HOME_TENANT_STATUSES = [
  { id: "active", label: "Active" },
  { id: "moved_out", label: "Moved out" },
] as const;

/** Default room slots when the Home profile is first created (house-hack layout). */
export const HOME_DEFAULT_TENANT_SLOTS = [
  { unitLabel: "Upstairs room A", expectedRent: 900, name: "" },
  { unitLabel: "Upstairs room B", expectedRent: 700, name: "" },
  { unitLabel: "Basement", expectedRent: 1050, name: "" },
] as const;

export type HomeProfileLike = {
  mortgageMonthly: number;
  mortgageNextDue: string;
  propertyLabel: string;
  notes?: string | null;
};

export function parseIsoDate(value: string | null | undefined) {
  if (!value?.trim()) return null;
  const dt = DateTime.fromISO(value.trim(), { zone: "America/New_York" });
  return dt.isValid ? dt.startOf("day") : null;
}

/** Next mortgage due around the 1st (today if already the 1st). */
export function nextMortgageDueIso(todayIso?: string) {
  const today = todayIso
    ? DateTime.fromISO(todayIso, { zone: "America/New_York" }).startOf("day")
    : DateTime.now().setZone("America/New_York").startOf("day");
  if (!today.isValid) return "2026-08-01";

  const due =
    today.day <= 1 ? today.set({ day: 1 }) : today.plus({ months: 1 }).set({ day: 1 });
  return due.toISODate() ?? "2026-08-01";
}

export function defaultHomeProfile(todayIso?: string): HomeProfileLike {
  return {
    mortgageMonthly: HOME_MORTGAGE_MONTHLY,
    mortgageNextDue: nextMortgageDueIso(todayIso),
    propertyLabel: HOME_PROPERTY_LABEL,
    notes: null,
  };
}

export function formatHomeDueLabel(isoDate: string) {
  const dt = parseIsoDate(isoDate);
  if (!dt) return isoDate;
  return dt.toFormat("MMM d, yyyy");
}

export function homeMaintenanceTypeLabel(issueType: string) {
  return HOME_MAINTENANCE_TYPES.find((t) => t.id === issueType)?.label ?? issueType;
}

export function homeMaintenanceStatusLabel(status: string) {
  return HOME_MAINTENANCE_STATUSES.find((s) => s.id === status)?.label ?? status;
}

export type HomeUpcomingBill = {
  kind: "mortgage";
  label: string;
  amount: number;
  dueDate: string;
};

export function homeUpcomingBills(
  profile: HomeProfileLike,
  withinDays = 45,
  todayIso?: string,
): HomeUpcomingBill[] {
  const today = todayIso
    ? DateTime.fromISO(todayIso, { zone: "America/New_York" }).startOf("day")
    : DateTime.now().setZone("America/New_York").startOf("day");
  if (!today.isValid) return [];

  const horizon = today.plus({ days: withinDays });
  const due = parseIsoDate(profile.mortgageNextDue);
  if (!due || due < today || due > horizon) return [];

  return [
    {
      kind: "mortgage",
      label: "Mortgage",
      amount: profile.mortgageMonthly,
      dueDate: due.toISODate()!,
    },
  ];
}

export function formatHomeBillLine(bill: HomeUpcomingBill) {
  return `${bill.label} $${bill.amount.toFixed(0)} due ${formatHomeDueLabel(bill.dueDate)}`;
}

export function expectedRentTotal(
  tenants: Array<{ expectedRent: number; status: string }>,
) {
  return Math.round(
    tenants
      .filter((t) => t.status === "active")
      .reduce((sum, t) => sum + t.expectedRent, 0) * 100,
  ) / 100;
}

/** Sum of rent payments whose paidOn falls in the given YYYY-MM month. */
export function rentCollectedInMonth(
  payments: Array<{ amount: number; paidOn: string }>,
  monthIso?: string,
) {
  const month =
    monthIso ??
    DateTime.now().setZone("America/New_York").toFormat("yyyy-MM");
  const total = payments
    .filter((p) => p.paidOn.startsWith(month))
    .reduce((sum, p) => sum + p.amount, 0);
  return Math.round(total * 100) / 100;
}

export function homeCashFlowSummary(params: {
  mortgageMonthly: number;
  expectedRent: number;
  rentCollectedThisMonth: number;
}) {
  const expectedNet =
    Math.round((params.expectedRent - params.mortgageMonthly) * 100) / 100;
  const actualNet =
    Math.round((params.rentCollectedThisMonth - params.mortgageMonthly) * 100) / 100;
  return { expectedNet, actualNet };
}

export function tenantDisplayName(tenant: { name: string; unitLabel: string }) {
  const name = tenant.name.trim();
  if (name) return `${name} · ${tenant.unitLabel}`;
  return tenant.unitLabel;
}

/** Compact Home tab snapshot for coach / daily brief prompts. */
export function buildHomePropertyContext(params: {
  profile: HomeProfileLike;
  tenants: Array<{ name: string; unitLabel: string; expectedRent: number; status: string }>;
  payments: Array<{ amount: number; paidOn: string }>;
  openIssueCount?: number;
  todayIso?: string;
}) {
  const expected = expectedRentTotal(params.tenants);
  const month = params.todayIso
    ? DateTime.fromISO(params.todayIso, { zone: "America/New_York" }).toFormat("yyyy-MM")
    : DateTime.now().setZone("America/New_York").toFormat("yyyy-MM");
  const collected = rentCollectedInMonth(params.payments, month);
  const { expectedNet, actualNet } = homeCashFlowSummary({
    mortgageMonthly: params.profile.mortgageMonthly,
    expectedRent: expected,
    rentCollectedThisMonth: collected,
  });
  const active = params.tenants.filter((t) => t.status === "active");
  const tenantLines =
    active.length > 0
      ? active
          .map(
            (t) =>
              `  - ${tenantDisplayName(t)}: expected $${t.expectedRent.toFixed(0)}/mo`,
          )
          .join("\n")
      : "  - No active tenants logged yet.";

  const openIssues =
    params.openIssueCount != null
      ? `${params.openIssueCount} open repair/issue(s) on the Home tab`
      : "repair/issues tracked on the Home tab";

  return `
HOME PROPERTY (Oxon Hill house-hack — Home tab):
- Mortgage $${params.profile.mortgageMonthly.toFixed(0)}/mo due ${params.profile.mortgageNextDue} (${params.profile.propertyLabel}).
- Expected rent $${expected.toFixed(0)}/mo across ${active.length} active unit(s); collected ${month}: $${collected.toFixed(0)} (actual net vs mortgage this month: $${actualNet.toFixed(0)}; expected net if full rent: $${expectedNet.toFixed(0)}).
- Active tenants:
${tenantLines}
- ${openIssues}. Prefer Home tab rent logs over guessed tenant income when judging cash safety.
`.trim();
}
