"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Car,
  FileText,
  Gauge,
  Loader2,
  Pencil,
  Shield,
  Trash2,
  Wrench,
  Wallet,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  CAR_DOCUMENTS,
  CAR_FUNDED_BY,
  CAR_MAINTENANCE_TYPES,
  carDocumentsForSubsection,
  carMaintenanceTypeLabel,
  carMonthlyTotal,
  formatCarDueLabel,
  formatOdometer,
  summarizeCarPayoff,
  type CarDocumentMeta,
  type CarProfileLike,
} from "@/lib/car";
import { formatCurrency } from "@/lib/format";
import { CapitalOneProjectionChart } from "@/components/car/capital-one-projection-chart";
import { CarMaintenanceManageChart } from "@/components/car/car-maintenance-manage-chart";

type CarSubView = "payment" | "insurance" | "loan" | "health" | "documents";

type CarProfileResponse = {
  profile: CarProfileLike & { id: string };
};

type MaintenanceLog = {
  id: string;
  serviceType: string;
  serviceDate: string;
  odometerMiles: number | null;
  cost: number | null;
  notes: string | null;
  createdAt: string;
};

type ProfileForm = {
  paymentMonthly: string;
  paymentNextDue: string;
  insuranceMonthly: string;
  insuranceNextDue: string;
  loanAmount: string;
  loanBalance: string;
  loanTermMonths: string;
  loanStartDate: string;
  payoffTargetMonthly: string;
  startOdometerMiles: string;
  odometerMiles: string;
  odometerAsOf: string;
  notes: string;
};

type MaintForm = {
  serviceType: string;
  serviceDate: string;
  odometerMiles: string;
  cost: string;
  notes: string;
};

async function fetchCarProfile(): Promise<CarProfileResponse> {
  const res = await fetch("/api/car/profile");
  if (!res.ok) throw new Error("Failed to load car profile");
  return res.json();
}

async function fetchMaintenance(): Promise<{ logs: MaintenanceLog[] }> {
  const res = await fetch("/api/car/maintenance");
  if (!res.ok) throw new Error("Failed to load maintenance");
  return res.json();
}

async function openDocument(doc: CarDocumentMeta) {
  const res = await fetch(`/api/car/documents/${doc.id}`);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? "Failed to open document");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function DocumentRow({
  doc,
  onOpen,
  busyId,
}: {
  doc: CarDocumentMeta;
  onOpen: (doc: CarDocumentMeta) => void;
  busyId: string | null;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(doc)}
      disabled={busyId === doc.id}
      className="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left ring-1 ring-[var(--card-border)] bg-[color-mix(in_srgb,var(--ink)_4%,transparent)] hover:bg-[color-mix(in_srgb,var(--ink)_7%,transparent)] transition-colors disabled:opacity-60"
    >
      <FileText size={18} className="mt-0.5 shrink-0 text-blue-600" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-[var(--ink)]">{doc.title}</span>
        <span className="block text-xs text-[var(--muted)] mt-0.5">{doc.description}</span>
      </span>
      {busyId === doc.id ? <Loader2 size={16} className="animate-spin text-[var(--muted)]" /> : null}
    </button>
  );
}

function EditableField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="app-label block mb-1.5">{label}</span>
      {children}
    </label>
  );
}

function profileToForm(profile: CarProfileLike): ProfileForm {
  return {
    paymentMonthly: String(profile.paymentMonthly),
    paymentNextDue: profile.paymentNextDue,
    insuranceMonthly: String(profile.insuranceMonthly),
    insuranceNextDue: profile.insuranceNextDue,
    loanAmount: String(profile.loanAmount),
    loanBalance: String(profile.loanBalance),
    loanTermMonths: String(profile.loanTermMonths),
    loanStartDate: profile.loanStartDate,
    payoffTargetMonthly: String(profile.payoffTargetMonthly),
    startOdometerMiles: String(profile.startOdometerMiles),
    odometerMiles: String(profile.odometerMiles),
    odometerAsOf: profile.odometerAsOf,
    notes: profile.notes ?? "",
  };
}

function defaultMaintForm(profile?: CarProfileLike | null): MaintForm {
  const today = new Date().toISOString().slice(0, 10);
  return {
    serviceType: "oil_change",
    serviceDate: today,
    odometerMiles: profile ? String(Math.round(profile.odometerMiles)) : "",
    cost: "",
    notes: "",
  };
}

export function CarView() {
  const queryClient = useQueryClient();
  const [subView, setSubView] = useState<CarSubView>("payment");
  const [editing, setEditing] = useState(false);
  const [busyDocId, setBusyDocId] = useState<string | null>(null);
  const [docError, setDocError] = useState<string | null>(null);
  const [form, setForm] = useState<ProfileForm | null>(null);
  const [maintForm, setMaintForm] = useState<MaintForm>(() => defaultMaintForm());

  const { data, isLoading, error } = useQuery({
    queryKey: ["car-profile"],
    queryFn: fetchCarProfile,
  });

  const maintenanceQuery = useQuery({
    queryKey: ["car-maintenance"],
    queryFn: fetchMaintenance,
    enabled: subView === "health",
  });

  const profile = data?.profile;

  const saveMutation = useMutation({
    mutationFn: async (draft: ProfileForm) => {
      const res = await fetch("/api/car/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentMonthly: Number(draft.paymentMonthly),
          paymentNextDue: draft.paymentNextDue,
          insuranceMonthly: Number(draft.insuranceMonthly),
          insuranceNextDue: draft.insuranceNextDue,
          loanAmount: Number(draft.loanAmount),
          loanBalance: Number(draft.loanBalance),
          loanTermMonths: Number(draft.loanTermMonths),
          loanStartDate: draft.loanStartDate,
          payoffTargetMonthly: Number(draft.payoffTargetMonthly),
          startOdometerMiles: Number(draft.startOdometerMiles),
          odometerMiles: Number(draft.odometerMiles),
          odometerAsOf: draft.odometerAsOf,
          notes: draft.notes,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to save");
      }
      return res.json() as Promise<CarProfileResponse>;
    },
    onSuccess: (result) => {
      queryClient.setQueryData(["car-profile"], result);
      setEditing(false);
      setForm(null);
    },
  });

  const addMaintMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/car/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceType: maintForm.serviceType,
          serviceDate: maintForm.serviceDate,
          odometerMiles: maintForm.odometerMiles === "" ? null : Number(maintForm.odometerMiles),
          cost: maintForm.cost === "" ? null : Number(maintForm.cost),
          notes: maintForm.notes,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to save");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["car-maintenance"] });
      queryClient.invalidateQueries({ queryKey: ["car-profile"] });
      setMaintForm((f) => ({
        ...defaultMaintForm(profile),
        serviceType: f.serviceType,
      }));
    },
  });

  const deleteMaintMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/car/maintenance?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to delete");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["car-maintenance"] });
    },
  });

  const handleOpenDoc = async (doc: CarDocumentMeta) => {
    setDocError(null);
    setBusyDocId(doc.id);
    try {
      await openDocument(doc);
    } catch (err) {
      setDocError(err instanceof Error ? err.message : "Failed to open document");
    } finally {
      setBusyDocId(null);
    }
  };

  const paymentDocs = carDocumentsForSubsection("payment");
  const monthlyTotal = profile ? carMonthlyTotal(profile) : null;
  const payoff = profile ? summarizeCarPayoff(profile) : null;

  const tabs: { id: CarSubView; label: string; Icon: typeof Wallet }[] = [
    { id: "payment", label: "Payment", Icon: Wallet },
    { id: "insurance", label: "Insurance", Icon: Shield },
    { id: "loan", label: "Loan", Icon: Gauge },
    { id: "health", label: "Health", Icon: Wrench },
    { id: "documents", label: "Documents", Icon: FileText },
  ];

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Car size={22} className="text-blue-600" />
          <h1 className="text-2xl app-display text-slate-900 tracking-tight">Car</h1>
        </div>
        <p className="text-slate-500 mt-1">
          Owned vehicle from {CAR_FUNDED_BY} — payment, insurance, 3.5-year payoff, and maintenance.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setSubView(id)}
            className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ring-1 ${
              subView === id
                ? "app-nav-active ring-transparent"
                : "text-slate-600 bg-white/60 ring-[var(--card-border)] hover:bg-white"
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="app-card p-8 flex items-center justify-center gap-2 text-slate-500">
          <Loader2 className="animate-spin" size={18} />
          Loading car profile…
        </div>
      ) : error || !profile || !payoff ? (
        <div className="app-card p-6 text-rose-600 text-sm">
          Could not load car profile. Try syncing or reloading.
        </div>
      ) : (
        <>
          <div className="app-card p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <p className="app-label mb-1">Monthly from {CAR_FUNDED_BY}</p>
                <p className="text-2xl font-bold tabular-nums text-[var(--ink)]">
                  {formatCurrency(monthlyTotal ?? 0)}
                </p>
                <p className="text-xs text-[var(--muted)] mt-1">
                  Payment {formatCurrency(profile.paymentMonthly)} + insurance{" "}
                  {formatCurrency(profile.insuranceMonthly)}
                  {" · "}
                  {formatOdometer(profile.odometerMiles)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (editing) {
                    setEditing(false);
                    setForm(null);
                  } else {
                    setForm(profileToForm(profile));
                    setEditing(true);
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 ring-1 ring-[var(--card-border)] bg-white/70 hover:bg-white"
              >
                <Pencil size={14} />
                {editing ? "Cancel" : "Edit"}
              </button>
            </div>

            {editing && form ? (
              <div className="grid sm:grid-cols-2 gap-4">
                <EditableField label="Payment amount ($)">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.paymentMonthly}
                    onChange={(e) => setForm((f) => (f ? { ...f, paymentMonthly: e.target.value } : f))}
                    className="w-full rounded-xl border border-[var(--card-border)] bg-white/80 px-3 py-2 text-sm"
                  />
                </EditableField>
                <EditableField label="Payment next due">
                  <input
                    type="date"
                    value={form.paymentNextDue}
                    onChange={(e) => setForm((f) => (f ? { ...f, paymentNextDue: e.target.value } : f))}
                    className="w-full rounded-xl border border-[var(--card-border)] bg-white/80 px-3 py-2 text-sm"
                  />
                </EditableField>
                <EditableField label="Insurance amount ($)">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.insuranceMonthly}
                    onChange={(e) => setForm((f) => (f ? { ...f, insuranceMonthly: e.target.value } : f))}
                    className="w-full rounded-xl border border-[var(--card-border)] bg-white/80 px-3 py-2 text-sm"
                  />
                </EditableField>
                <EditableField label="Insurance next due">
                  <input
                    type="date"
                    value={form.insuranceNextDue}
                    onChange={(e) => setForm((f) => (f ? { ...f, insuranceNextDue: e.target.value } : f))}
                    className="w-full rounded-xl border border-[var(--card-border)] bg-white/80 px-3 py-2 text-sm"
                  />
                </EditableField>
                <EditableField label="Loan financed ($)">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.loanAmount}
                    onChange={(e) => setForm((f) => (f ? { ...f, loanAmount: e.target.value } : f))}
                    className="w-full rounded-xl border border-[var(--card-border)] bg-white/80 px-3 py-2 text-sm"
                  />
                </EditableField>
                <EditableField label="Loan balance left ($)">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.loanBalance}
                    onChange={(e) => setForm((f) => (f ? { ...f, loanBalance: e.target.value } : f))}
                    className="w-full rounded-xl border border-[var(--card-border)] bg-white/80 px-3 py-2 text-sm"
                  />
                </EditableField>
                <EditableField label="Payoff term (months)">
                  <input
                    type="number"
                    min={1}
                    step="1"
                    value={form.loanTermMonths}
                    onChange={(e) => setForm((f) => (f ? { ...f, loanTermMonths: e.target.value } : f))}
                    className="w-full rounded-xl border border-[var(--card-border)] bg-white/80 px-3 py-2 text-sm"
                  />
                </EditableField>
                <EditableField label="Loan start date">
                  <input
                    type="date"
                    value={form.loanStartDate}
                    onChange={(e) => setForm((f) => (f ? { ...f, loanStartDate: e.target.value } : f))}
                    className="w-full rounded-xl border border-[var(--card-border)] bg-white/80 px-3 py-2 text-sm"
                  />
                </EditableField>
                <EditableField label="Payoff target ($ / mo)">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.payoffTargetMonthly}
                    onChange={(e) => setForm((f) => (f ? { ...f, payoffTargetMonthly: e.target.value } : f))}
                    className="w-full rounded-xl border border-[var(--card-border)] bg-white/80 px-3 py-2 text-sm"
                  />
                </EditableField>
                <EditableField label="Start odometer (miles)">
                  <input
                    type="number"
                    min={0}
                    step="1"
                    value={form.startOdometerMiles}
                    onChange={(e) =>
                      setForm((f) => (f ? { ...f, startOdometerMiles: e.target.value } : f))
                    }
                    className="w-full rounded-xl border border-[var(--card-border)] bg-white/80 px-3 py-2 text-sm"
                  />
                </EditableField>
                <EditableField label="Current odometer (miles)">
                  <input
                    type="number"
                    min={0}
                    step="1"
                    value={form.odometerMiles}
                    onChange={(e) => setForm((f) => (f ? { ...f, odometerMiles: e.target.value } : f))}
                    className="w-full rounded-xl border border-[var(--card-border)] bg-white/80 px-3 py-2 text-sm"
                  />
                </EditableField>
                <EditableField label="Odometer as of">
                  <input
                    type="date"
                    value={form.odometerAsOf}
                    onChange={(e) => setForm((f) => (f ? { ...f, odometerAsOf: e.target.value } : f))}
                    className="w-full rounded-xl border border-[var(--card-border)] bg-white/80 px-3 py-2 text-sm"
                  />
                </EditableField>
                <div className="sm:col-span-2">
                  <EditableField label="Notes">
                    <textarea
                      value={form.notes}
                      onChange={(e) => setForm((f) => (f ? { ...f, notes: e.target.value } : f))}
                      rows={2}
                      className="w-full rounded-xl border border-[var(--card-border)] bg-white/80 px-3 py-2 text-sm"
                      placeholder="Lender, policy number, reminders…"
                    />
                  </EditableField>
                </div>
                <div className="sm:col-span-2 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => saveMutation.mutate(form)}
                    disabled={saveMutation.isPending}
                    className="rounded-xl app-btn-primary px-4 py-2 text-sm font-semibold disabled:opacity-60"
                  >
                    {saveMutation.isPending ? "Saving…" : "Save changes"}
                  </button>
                  {saveMutation.isError ? (
                    <p className="text-xs text-rose-600">
                      {saveMutation.error instanceof Error
                        ? saveMutation.error.message
                        : "Save failed"}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          {subView === "payment" && (
            <div className="space-y-4">
              <div className="app-card p-5 space-y-3">
                <p className="app-label">Car payment</p>
                <p className="text-3xl font-bold tabular-nums text-[var(--ink)]">
                  {formatCurrency(profile.paymentMonthly)}
                  <span className="text-base font-medium text-[var(--muted)]"> / mo</span>
                </p>
                <p className="text-sm text-[var(--ink-soft)]">
                  Next due <span className="font-semibold">{formatCarDueLabel(profile.paymentNextDue)}</span>
                  {" · "}funded from <span className="font-semibold">{CAR_FUNDED_BY}</span>
                </p>
                <p className="text-xs text-[var(--muted)]">
                  Payoff target {formatCurrency(profile.payoffTargetMonthly)}/mo toward the loan
                  (contract + extras when cash allows).
                </p>
                {profile.notes ? (
                  <p className="text-xs text-[var(--muted)] pt-2 border-t border-[var(--card-border)]">
                    {profile.notes}
                  </p>
                ) : null}
              </div>

              <CapitalOneProjectionChart />

              <div className="space-y-2">
                <p className="app-label px-1">Payment documents</p>
                {paymentDocs.map((doc) => (
                  <DocumentRow
                    key={doc.id}
                    doc={doc}
                    onOpen={handleOpenDoc}
                    busyId={busyDocId}
                  />
                ))}
              </div>
            </div>
          )}

          {subView === "insurance" && (
            <div className="app-card p-5 space-y-3">
              <p className="app-label">Car insurance</p>
              <p className="text-3xl font-bold tabular-nums text-[var(--ink)]">
                {formatCurrency(profile.insuranceMonthly)}
                <span className="text-base font-medium text-[var(--muted)]"> / mo</span>
              </p>
              <p className="text-sm text-[var(--ink-soft)]">
                Next due <span className="font-semibold">{formatCarDueLabel(profile.insuranceNextDue)}</span>
                {" · "}funded from <span className="font-semibold">{CAR_FUNDED_BY}</span>
              </p>
              <p className="text-xs text-[var(--muted)] pt-2 border-t border-[var(--card-border)]">
                No insurance policy PDF is attached yet — add one later if you want it here.
              </p>
            </div>
          )}

          {subView === "loan" && (
            <div className="space-y-4">
              <div className="app-card p-5 space-y-4">
                <div>
                  <p className="app-label mb-1">Loan payoff</p>
                  <p className="text-3xl font-bold tabular-nums text-[var(--ink)]">
                    {formatCurrency(payoff.loanBalance)}
                    <span className="text-base font-medium text-[var(--muted)]"> left</span>
                  </p>
                  <p className="text-sm text-[var(--ink-soft)] mt-1">
                    of {formatCurrency(payoff.loanAmount)} financed · {payoff.termMonths} months
                    (3.5 years) from {formatCarDueLabel(profile.loanStartDate)}
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs text-[var(--muted)] mb-1.5">
                    <span>{payoff.progressPct}% paid down</span>
                    <span>
                      {payoff.monthsRemainingOnTerm} mo left on term
                      {payoff.targetPayoffDate
                        ? ` · target ${formatCarDueLabel(payoff.targetPayoffDate)}`
                        : ""}
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-[color-mix(in_srgb,var(--ink)_10%,transparent)] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-blue-600 transition-[width] duration-500"
                      style={{ width: `${Math.min(100, payoff.progressPct)}%` }}
                    />
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-3 pt-1">
                  <div className="rounded-xl px-3 py-3 ring-1 ring-[var(--card-border)] bg-[color-mix(in_srgb,var(--ink)_4%,transparent)]">
                    <p className="app-label mb-1">Contract payment</p>
                    <p className="text-lg font-bold tabular-nums text-[var(--ink)]">
                      {formatCurrency(profile.paymentMonthly)}
                      <span className="text-sm font-medium text-[var(--muted)]"> / mo</span>
                    </p>
                    <p className="text-xs text-[var(--muted)] mt-1">
                      {payoff.monthsAtContractPayment != null
                        ? `~${payoff.monthsAtContractPayment} mo to clear balance at this rate`
                        : "Set a payment amount to project payoff"}
                      {payoff.payoffDateAtContract
                        ? ` · ${formatCarDueLabel(payoff.payoffDateAtContract)}`
                        : ""}
                    </p>
                  </div>
                  <div className="rounded-xl px-3 py-3 ring-1 ring-[var(--card-border)] bg-[color-mix(in_srgb,var(--ink)_4%,transparent)]">
                    <p className="app-label mb-1">Payoff target</p>
                    <p className="text-lg font-bold tabular-nums text-[var(--ink)]">
                      {formatCurrency(profile.payoffTargetMonthly)}
                      <span className="text-sm font-medium text-[var(--muted)]"> / mo</span>
                    </p>
                    <p className="text-xs text-[var(--muted)] mt-1">
                      {payoff.monthsAtPayoffTarget != null
                        ? `~${payoff.monthsAtPayoffTarget} mo at target pace`
                        : "Set an $800-style target to project"}
                      {payoff.payoffDateAtTarget
                        ? ` · ${formatCarDueLabel(payoff.payoffDateAtTarget)}`
                        : ""}
                      {payoff.onTrackForTerm === true
                        ? " · on track for 3.5y"
                        : payoff.onTrackForTerm === false
                          ? " · behind 3.5y pace"
                          : ""}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {subView === "health" && (
            <div className="space-y-4">
              <div className="app-card p-5 space-y-3">
                <p className="app-label">Odometer</p>
                <p className="text-3xl font-bold tabular-nums text-[var(--ink)]">
                  {formatOdometer(profile.odometerMiles)}
                </p>
                <p className="text-sm text-[var(--ink-soft)]">
                  As of <span className="font-semibold">{formatCarDueLabel(profile.odometerAsOf)}</span>
                  {" · "}started at{" "}
                  <span className="font-semibold">
                    {formatOdometer(profile.startOdometerMiles)}
                  </span>
                  {" · "}edit anytime, or log service with a newer reading
                </p>
                <p className="text-xs text-[var(--muted)] pt-2 border-t border-[var(--card-border)]">
                  Keep oil, tires, brakes, and wash/cleaning current so this asset stays healthy and
                  neat through the 3.5-year payoff.
                </p>
              </div>

              {maintenanceQuery.isLoading ? (
                <div className="app-card p-6 flex items-center gap-2 text-slate-500 text-sm">
                  <Loader2 className="animate-spin" size={16} />
                  Loading manage chart…
                </div>
              ) : (
                <CarMaintenanceManageChart
                  profile={profile}
                  logs={maintenanceQuery.data?.logs ?? []}
                />
              )}

              <div className="app-card p-5 space-y-4">
                <p className="app-label">Log maintenance</p>
                <div className="grid sm:grid-cols-2 gap-3">
                  <EditableField label="Service">
                    <select
                      value={maintForm.serviceType}
                      onChange={(e) => setMaintForm((f) => ({ ...f, serviceType: e.target.value }))}
                      className="w-full rounded-xl border border-[var(--card-border)] bg-white/80 px-3 py-2 text-sm"
                    >
                      {CAR_MAINTENANCE_TYPES.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </EditableField>
                  <EditableField label="Date">
                    <input
                      type="date"
                      value={maintForm.serviceDate}
                      onChange={(e) => setMaintForm((f) => ({ ...f, serviceDate: e.target.value }))}
                      className="w-full rounded-xl border border-[var(--card-border)] bg-white/80 px-3 py-2 text-sm"
                    />
                  </EditableField>
                  <EditableField label="Odometer (optional)">
                    <input
                      type="number"
                      min={0}
                      step="1"
                      value={
                        maintForm.odometerMiles ||
                        (profile ? String(Math.round(profile.odometerMiles)) : "")
                      }
                      onChange={(e) => setMaintForm((f) => ({ ...f, odometerMiles: e.target.value }))}
                      className="w-full rounded-xl border border-[var(--card-border)] bg-white/80 px-3 py-2 text-sm"
                    />
                  </EditableField>
                  <EditableField label="Cost (optional)">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={maintForm.cost}
                      onChange={(e) => setMaintForm((f) => ({ ...f, cost: e.target.value }))}
                      className="w-full rounded-xl border border-[var(--card-border)] bg-white/80 px-3 py-2 text-sm"
                    />
                  </EditableField>
                  <div className="sm:col-span-2">
                    <EditableField label="Notes">
                      <input
                        type="text"
                        value={maintForm.notes}
                        onChange={(e) => setMaintForm((f) => ({ ...f, notes: e.target.value }))}
                        className="w-full rounded-xl border border-[var(--card-border)] bg-white/80 px-3 py-2 text-sm"
                        placeholder="Shop, next due, wash notes…"
                      />
                    </EditableField>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => addMaintMutation.mutate()}
                    disabled={addMaintMutation.isPending || !maintForm.serviceDate}
                    className="rounded-xl app-btn-primary px-4 py-2 text-sm font-semibold disabled:opacity-60"
                  >
                    {addMaintMutation.isPending ? "Saving…" : "Add service"}
                  </button>
                  {addMaintMutation.isError ? (
                    <p className="text-xs text-rose-600">
                      {addMaintMutation.error instanceof Error
                        ? addMaintMutation.error.message
                        : "Save failed"}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="space-y-2">
                <p className="app-label px-1">Service history</p>
                {maintenanceQuery.isLoading ? (
                  <div className="app-card p-6 flex items-center gap-2 text-slate-500 text-sm">
                    <Loader2 className="animate-spin" size={16} />
                    Loading…
                  </div>
                ) : (maintenanceQuery.data?.logs.length ?? 0) === 0 ? (
                  <div className="app-card p-5 text-sm text-[var(--muted)]">
                    No services logged yet. Start with oil, tires, or a wash so the coach can
                    remember car health.
                  </div>
                ) : (
                  maintenanceQuery.data!.logs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-start gap-3 rounded-xl px-3 py-3 ring-1 ring-[var(--card-border)] bg-[color-mix(in_srgb,var(--ink)_4%,transparent)]"
                    >
                      <Wrench size={18} className="mt-0.5 shrink-0 text-blue-600" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-[var(--ink)]">
                          {carMaintenanceTypeLabel(log.serviceType)}
                        </p>
                        <p className="text-xs text-[var(--muted)] mt-0.5">
                          {formatCarDueLabel(log.serviceDate)}
                          {log.odometerMiles != null
                            ? ` · ${formatOdometer(log.odometerMiles)}`
                            : ""}
                          {log.cost != null ? ` · ${formatCurrency(log.cost)}` : ""}
                        </p>
                        {log.notes ? (
                          <p className="text-xs text-[var(--ink-soft)] mt-1">{log.notes}</p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => deleteMaintMutation.mutate(log.id)}
                        disabled={deleteMaintMutation.isPending}
                        className="rounded-lg p-1.5 text-[var(--muted)] hover:text-rose-600 hover:bg-white/80"
                        aria-label="Delete service log"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {subView === "documents" && (
            <div className="space-y-2">
              <p className="app-label px-1">All car documents</p>
              {CAR_DOCUMENTS.map((doc) => (
                <DocumentRow
                  key={doc.id}
                  doc={doc}
                  onOpen={handleOpenDoc}
                  busyId={busyDocId}
                />
              ))}
            </div>
          )}

          {docError ? (
            <p className="text-sm text-rose-600">{docError}</p>
          ) : null}
        </>
      )}
    </div>
  );
}
