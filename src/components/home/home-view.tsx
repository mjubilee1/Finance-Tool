"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Home,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";
import { DateTime } from "luxon";
import { useState, type ReactNode } from "react";
import { formatCurrency } from "@/lib/format";
import {
  expectedRentTotal,
  formatHomeDueLabel,
  homeCashFlowSummary,
  HOME_MAINTENANCE_STATUSES,
  HOME_MAINTENANCE_TYPES,
  homeMaintenanceStatusLabel,
  homeMaintenanceTypeLabel,
  rentCollectedInMonth,
  tenantDisplayName,
  type HomeProfileLike,
} from "@/lib/home";

type HomeSubView = "mortgage" | "tenants" | "maintenance";

type HomeProfileResponse = {
  profile: HomeProfileLike & { id: string };
};

type Tenant = {
  id: string;
  name: string;
  unitLabel: string;
  expectedRent: number;
  status: string;
  moveInDate: string | null;
  notes: string | null;
};

type RentPayment = {
  id: string;
  tenantId: string | null;
  amount: number;
  paidOn: string;
  periodLabel: string | null;
  notes: string | null;
  tenant: { id: string; name: string; unitLabel: string } | null;
};

type MaintenanceLog = {
  id: string;
  issueType: string;
  title: string;
  status: string;
  issueDate: string;
  resolvedDate: string | null;
  cost: number | null;
  notes: string | null;
};

type ProfileForm = {
  mortgageMonthly: string;
  mortgageNextDue: string;
  propertyLabel: string;
  notes: string;
};

type TenantForm = {
  name: string;
  unitLabel: string;
  expectedRent: string;
  status: string;
  moveInDate: string;
  notes: string;
};

type RentForm = {
  tenantId: string;
  amount: string;
  paidOn: string;
  periodLabel: string;
  notes: string;
};

type MaintForm = {
  issueType: string;
  title: string;
  status: string;
  issueDate: string;
  cost: string;
  notes: string;
};

async function fetchHomeProfile(): Promise<HomeProfileResponse> {
  const res = await fetch("/api/home/profile");
  if (!res.ok) throw new Error("Failed to load home profile");
  return res.json();
}

async function fetchTenants(): Promise<{ tenants: Tenant[] }> {
  const res = await fetch("/api/home/tenants");
  if (!res.ok) throw new Error("Failed to load tenants");
  return res.json();
}

async function fetchRent(): Promise<{ payments: RentPayment[] }> {
  const res = await fetch("/api/home/rent");
  if (!res.ok) throw new Error("Failed to load rent payments");
  return res.json();
}

async function fetchMaintenance(): Promise<{ logs: MaintenanceLog[] }> {
  const res = await fetch("/api/home/maintenance");
  if (!res.ok) throw new Error("Failed to load maintenance");
  return res.json();
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

function profileToForm(profile: HomeProfileLike): ProfileForm {
  return {
    mortgageMonthly: String(profile.mortgageMonthly),
    mortgageNextDue: profile.mortgageNextDue,
    propertyLabel: profile.propertyLabel,
    notes: profile.notes ?? "",
  };
}

function emptyTenantForm(): TenantForm {
  return {
    name: "",
    unitLabel: "",
    expectedRent: "",
    status: "active",
    moveInDate: "",
    notes: "",
  };
}

function defaultRentForm(): RentForm {
  const today = DateTime.now().setZone("America/New_York");
  return {
    tenantId: "",
    amount: "",
    paidOn: today.toISODate() ?? "",
    periodLabel: today.toFormat("yyyy-MM"),
    notes: "",
  };
}

function defaultMaintForm(): MaintForm {
  const today = new Date().toISOString().slice(0, 10);
  return {
    issueType: "issue",
    title: "",
    status: "open",
    issueDate: today,
    cost: "",
    notes: "",
  };
}

function statusTone(status: string) {
  if (status === "resolved") return "text-emerald-700";
  if (status === "in_progress") return "text-amber-700";
  if (status === "moved_out") return "text-slate-500";
  return "text-rose-700";
}

export function HomeView() {
  const queryClient = useQueryClient();
  const [subView, setSubView] = useState<HomeSubView>("mortgage");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ProfileForm | null>(null);
  const [tenantForm, setTenantForm] = useState<TenantForm>(() => emptyTenantForm());
  const [editingTenantId, setEditingTenantId] = useState<string | null>(null);
  const [rentForm, setRentForm] = useState<RentForm>(() => defaultRentForm());
  const [maintForm, setMaintForm] = useState<MaintForm>(() => defaultMaintForm());

  const { data, isLoading, error } = useQuery({
    queryKey: ["home-profile"],
    queryFn: fetchHomeProfile,
  });

  const tenantsQuery = useQuery({
    queryKey: ["home-tenants"],
    queryFn: fetchTenants,
  });

  const rentQuery = useQuery({
    queryKey: ["home-rent"],
    queryFn: fetchRent,
    enabled: subView === "mortgage" || subView === "tenants",
  });

  const maintenanceQuery = useQuery({
    queryKey: ["home-maintenance"],
    queryFn: fetchMaintenance,
    enabled: subView === "maintenance" || subView === "mortgage",
  });

  const profile = data?.profile;
  const tenants = tenantsQuery.data?.tenants ?? [];
  const payments = rentQuery.data?.payments ?? [];
  const logs = maintenanceQuery.data?.logs ?? [];
  const activeTenants = tenants.filter((t) => t.status === "active");
  const expectedRent = expectedRentTotal(tenants);
  const thisMonth = DateTime.now().setZone("America/New_York").toFormat("yyyy-MM");
  const collected = rentCollectedInMonth(payments, thisMonth);
  const cashFlow = profile
    ? homeCashFlowSummary({
        mortgageMonthly: profile.mortgageMonthly,
        expectedRent,
        rentCollectedThisMonth: collected,
      })
    : null;
  const openIssues = logs.filter((l) => l.status !== "resolved").length;

  const saveMutation = useMutation({
    mutationFn: async (draft: ProfileForm) => {
      const res = await fetch("/api/home/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mortgageMonthly: Number(draft.mortgageMonthly),
          mortgageNextDue: draft.mortgageNextDue,
          propertyLabel: draft.propertyLabel,
          notes: draft.notes,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to save");
      }
      return res.json() as Promise<HomeProfileResponse>;
    },
    onSuccess: (result) => {
      queryClient.setQueryData(["home-profile"], result);
      setEditing(false);
      setForm(null);
    },
  });

  const saveTenantMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: tenantForm.name,
        unitLabel: tenantForm.unitLabel,
        expectedRent: Number(tenantForm.expectedRent),
        status: tenantForm.status,
        moveInDate: tenantForm.moveInDate || null,
        notes: tenantForm.notes,
      };
      const res = await fetch("/api/home/tenants", {
        method: editingTenantId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editingTenantId ? { id: editingTenantId, ...payload } : payload,
        ),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to save tenant");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["home-tenants"] });
      setTenantForm(emptyTenantForm());
      setEditingTenantId(null);
    },
  });

  const deleteTenantMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/home/tenants?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to delete");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["home-tenants"] });
      queryClient.invalidateQueries({ queryKey: ["home-rent"] });
    },
  });

  const addRentMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/home/rent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: rentForm.tenantId || null,
          amount: Number(rentForm.amount),
          paidOn: rentForm.paidOn,
          periodLabel: rentForm.periodLabel || null,
          notes: rentForm.notes,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to save payment");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["home-rent"] });
      setRentForm((f) => ({
        ...defaultRentForm(),
        tenantId: f.tenantId,
      }));
    },
  });

  const deleteRentMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/home/rent?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to delete");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["home-rent"] });
    },
  });

  const addMaintMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/home/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issueType: maintForm.issueType,
          title: maintForm.title,
          status: maintForm.status,
          issueDate: maintForm.issueDate,
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
      queryClient.invalidateQueries({ queryKey: ["home-maintenance"] });
      setMaintForm((f) => ({
        ...defaultMaintForm(),
        issueType: f.issueType,
      }));
    },
  });

  const updateMaintStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await fetch("/api/home/maintenance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to update");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["home-maintenance"] });
    },
  });

  const deleteMaintMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/home/maintenance?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to delete");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["home-maintenance"] });
    },
  });

  const tabs: { id: HomeSubView; label: string; Icon: typeof Wallet }[] = [
    { id: "mortgage", label: "Mortgage", Icon: Wallet },
    { id: "tenants", label: "Tenants & rent", Icon: Users },
    { id: "maintenance", label: "Issues", Icon: Wrench },
  ];

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Home size={22} className="text-blue-600" />
          <h1 className="text-2xl app-display text-slate-900 tracking-tight">Home</h1>
        </div>
        <p className="text-slate-500 mt-1">
          House-hack floor — mortgage, tenant rent collected, and repairs/issues.
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
          Loading home profile…
        </div>
      ) : error || !profile || !cashFlow ? (
        <div className="app-card p-6 text-rose-600 text-sm">
          Could not load home profile. Try reloading.
        </div>
      ) : (
        <>
          <div className="app-card p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <p className="app-label mb-1">{profile.propertyLabel}</p>
                <p className="text-2xl font-bold tabular-nums text-[var(--ink)]">
                  {formatCurrency(profile.mortgageMonthly)}
                  <span className="text-base font-medium text-[var(--muted)]"> / mo mortgage</span>
                </p>
                <p className="text-xs text-[var(--muted)] mt-1">
                  Expected rent {formatCurrency(expectedRent)}
                  {" · "}collected this month {formatCurrency(collected)}
                  {" · "}
                  {openIssues > 0
                    ? `${openIssues} open issue${openIssues === 1 ? "" : "s"}`
                    : "no open issues"}
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
                <EditableField label="Mortgage amount ($)">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.mortgageMonthly}
                    onChange={(e) =>
                      setForm((f) => (f ? { ...f, mortgageMonthly: e.target.value } : f))
                    }
                    className="w-full rounded-xl border border-[var(--card-border)] bg-white/80 px-3 py-2 text-sm"
                  />
                </EditableField>
                <EditableField label="Mortgage next due">
                  <input
                    type="date"
                    value={form.mortgageNextDue}
                    onChange={(e) =>
                      setForm((f) => (f ? { ...f, mortgageNextDue: e.target.value } : f))
                    }
                    className="w-full rounded-xl border border-[var(--card-border)] bg-white/80 px-3 py-2 text-sm"
                  />
                </EditableField>
                <EditableField label="Property label">
                  <input
                    type="text"
                    value={form.propertyLabel}
                    onChange={(e) =>
                      setForm((f) => (f ? { ...f, propertyLabel: e.target.value } : f))
                    }
                    className="w-full rounded-xl border border-[var(--card-border)] bg-white/80 px-3 py-2 text-sm"
                  />
                </EditableField>
                <div className="sm:col-span-2">
                  <EditableField label="Notes">
                    <textarea
                      value={form.notes}
                      onChange={(e) =>
                        setForm((f) => (f ? { ...f, notes: e.target.value } : f))
                      }
                      rows={2}
                      className="w-full rounded-xl border border-[var(--card-border)] bg-white/80 px-3 py-2 text-sm"
                      placeholder="Servicer, escrow notes, reminders…"
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

          {subView === "mortgage" && (
            <div className="space-y-4">
              <div className="app-card p-5 space-y-3">
                <p className="app-label">Mortgage</p>
                <p className="text-3xl font-bold tabular-nums text-[var(--ink)]">
                  {formatCurrency(profile.mortgageMonthly)}
                  <span className="text-base font-medium text-[var(--muted)]"> / mo</span>
                </p>
                <p className="text-sm text-[var(--ink-soft)]">
                  Next due{" "}
                  <span className="font-semibold">
                    {formatHomeDueLabel(profile.mortgageNextDue)}
                  </span>
                  {" · "}protect this first
                </p>
                {profile.notes ? (
                  <p className="text-xs text-[var(--muted)] pt-2 border-t border-[var(--card-border)]">
                    {profile.notes}
                  </p>
                ) : null}
              </div>

              <div className="grid sm:grid-cols-3 gap-3">
                <div className="app-card p-4">
                  <p className="app-label mb-1">Expected rent</p>
                  <p className="text-xl font-bold tabular-nums text-[var(--ink)]">
                    {formatCurrency(expectedRent)}
                  </p>
                  <p className="text-xs text-[var(--muted)] mt-1">
                    {activeTenants.length} active unit
                    {activeTenants.length === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="app-card p-4">
                  <p className="app-label mb-1">Collected this month</p>
                  <p className="text-xl font-bold tabular-nums text-[var(--ink)]">
                    {formatCurrency(collected)}
                  </p>
                  <p className="text-xs text-[var(--muted)] mt-1">{thisMonth}</p>
                </div>
                <div className="app-card p-4">
                  <p className="app-label mb-1">Net vs mortgage</p>
                  <p className="text-xl font-bold tabular-nums text-[var(--ink)]">
                    {formatCurrency(cashFlow.actualNet)}
                  </p>
                  <p className="text-xs text-[var(--muted)] mt-1">
                    expected {formatCurrency(cashFlow.expectedNet)} if full rent lands
                  </p>
                </div>
              </div>
            </div>
          )}

          {subView === "tenants" && (
            <div className="space-y-4">
              <div className="app-card p-5 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="app-label">
                      {editingTenantId ? "Edit tenant" : "Add / update tenant"}
                    </p>
                    <p className="text-xs text-[var(--muted)] mt-0.5">
                      Rooms start with expected rents — add names as people move in.
                    </p>
                  </div>
                  {editingTenantId ? (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingTenantId(null);
                        setTenantForm(emptyTenantForm());
                      }}
                      className="text-xs font-semibold text-slate-600"
                    >
                      Cancel edit
                    </button>
                  ) : null}
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <EditableField label="Tenant name">
                    <input
                      type="text"
                      value={tenantForm.name}
                      onChange={(e) =>
                        setTenantForm((f) => ({ ...f, name: e.target.value }))
                      }
                      className="w-full rounded-xl border border-[var(--card-border)] bg-white/80 px-3 py-2 text-sm"
                      placeholder="Optional"
                    />
                  </EditableField>
                  <EditableField label="Unit / room">
                    <input
                      type="text"
                      value={tenantForm.unitLabel}
                      onChange={(e) =>
                        setTenantForm((f) => ({ ...f, unitLabel: e.target.value }))
                      }
                      className="w-full rounded-xl border border-[var(--card-border)] bg-white/80 px-3 py-2 text-sm"
                      placeholder="Basement, Upstairs A…"
                    />
                  </EditableField>
                  <EditableField label="Expected rent ($ / mo)">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={tenantForm.expectedRent}
                      onChange={(e) =>
                        setTenantForm((f) => ({ ...f, expectedRent: e.target.value }))
                      }
                      className="w-full rounded-xl border border-[var(--card-border)] bg-white/80 px-3 py-2 text-sm"
                    />
                  </EditableField>
                  <EditableField label="Status">
                    <select
                      value={tenantForm.status}
                      onChange={(e) =>
                        setTenantForm((f) => ({ ...f, status: e.target.value }))
                      }
                      className="w-full rounded-xl border border-[var(--card-border)] bg-white/80 px-3 py-2 text-sm"
                    >
                      <option value="active">Active</option>
                      <option value="moved_out">Moved out</option>
                    </select>
                  </EditableField>
                  <EditableField label="Move-in date">
                    <input
                      type="date"
                      value={tenantForm.moveInDate}
                      onChange={(e) =>
                        setTenantForm((f) => ({ ...f, moveInDate: e.target.value }))
                      }
                      className="w-full rounded-xl border border-[var(--card-border)] bg-white/80 px-3 py-2 text-sm"
                    />
                  </EditableField>
                  <EditableField label="Notes">
                    <input
                      type="text"
                      value={tenantForm.notes}
                      onChange={(e) =>
                        setTenantForm((f) => ({ ...f, notes: e.target.value }))
                      }
                      className="w-full rounded-xl border border-[var(--card-border)] bg-white/80 px-3 py-2 text-sm"
                      placeholder="Deposit, quirks…"
                    />
                  </EditableField>
                </div>
                <button
                  type="button"
                  onClick={() => saveTenantMutation.mutate()}
                  disabled={
                    saveTenantMutation.isPending ||
                    !tenantForm.unitLabel.trim() ||
                    tenantForm.expectedRent === ""
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl app-btn-primary px-4 py-2 text-sm font-semibold disabled:opacity-60"
                >
                  <Plus size={16} />
                  {saveTenantMutation.isPending
                    ? "Saving…"
                    : editingTenantId
                      ? "Save tenant"
                      : "Add tenant"}
                </button>
                {saveTenantMutation.isError ? (
                  <p className="text-xs text-rose-600">
                    {saveTenantMutation.error instanceof Error
                      ? saveTenantMutation.error.message
                      : "Save failed"}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <p className="app-label px-1">Tenants</p>
                {tenantsQuery.isLoading ? (
                  <div className="app-card p-6 flex items-center gap-2 text-slate-500 text-sm">
                    <Loader2 className="animate-spin" size={16} />
                    Loading tenants…
                  </div>
                ) : tenants.length === 0 ? (
                  <div className="app-card p-5 text-sm text-[var(--muted)]">
                    No tenants yet — add rooms and expected rent above.
                  </div>
                ) : (
                  tenants.map((tenant) => (
                    <div
                      key={tenant.id}
                      className="app-card p-4 flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[var(--ink)]">
                          {tenantDisplayName(tenant)}
                        </p>
                        <p className="text-xs text-[var(--muted)] mt-0.5">
                          {formatCurrency(tenant.expectedRent)}/mo
                          {" · "}
                          <span className={statusTone(tenant.status)}>
                            {tenant.status === "active" ? "Active" : "Moved out"}
                          </span>
                          {tenant.moveInDate
                            ? ` · in ${formatHomeDueLabel(tenant.moveInDate)}`
                            : ""}
                        </p>
                        {tenant.notes ? (
                          <p className="text-xs text-[var(--muted)] mt-1">{tenant.notes}</p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingTenantId(tenant.id);
                            setTenantForm({
                              name: tenant.name,
                              unitLabel: tenant.unitLabel,
                              expectedRent: String(tenant.expectedRent),
                              status: tenant.status,
                              moveInDate: tenant.moveInDate ?? "",
                              notes: tenant.notes ?? "",
                            });
                          }}
                          className="rounded-lg p-2 text-slate-600 hover:bg-white/80"
                          aria-label="Edit tenant"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteTenantMutation.mutate(tenant.id)}
                          disabled={deleteTenantMutation.isPending}
                          className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"
                          aria-label="Delete tenant"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="app-card p-5 space-y-4">
                <div>
                  <p className="app-label">Log rent received</p>
                  <p className="text-xs text-[var(--muted)] mt-0.5">
                    What actually came in, with the payment date — not just expected rent.
                  </p>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <EditableField label="Tenant">
                    <select
                      value={rentForm.tenantId}
                      onChange={(e) =>
                        setRentForm((f) => ({ ...f, tenantId: e.target.value }))
                      }
                      className="w-full rounded-xl border border-[var(--card-border)] bg-white/80 px-3 py-2 text-sm"
                    >
                      <option value="">Unassigned</option>
                      {tenants.map((t) => (
                        <option key={t.id} value={t.id}>
                          {tenantDisplayName(t)}
                        </option>
                      ))}
                    </select>
                  </EditableField>
                  <EditableField label="Amount ($)">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={rentForm.amount}
                      onChange={(e) =>
                        setRentForm((f) => ({ ...f, amount: e.target.value }))
                      }
                      className="w-full rounded-xl border border-[var(--card-border)] bg-white/80 px-3 py-2 text-sm"
                    />
                  </EditableField>
                  <EditableField label="Payment date">
                    <input
                      type="date"
                      value={rentForm.paidOn}
                      onChange={(e) =>
                        setRentForm((f) => ({ ...f, paidOn: e.target.value }))
                      }
                      className="w-full rounded-xl border border-[var(--card-border)] bg-white/80 px-3 py-2 text-sm"
                    />
                  </EditableField>
                  <EditableField label="Covers month (YYYY-MM)">
                    <input
                      type="month"
                      value={rentForm.periodLabel}
                      onChange={(e) =>
                        setRentForm((f) => ({ ...f, periodLabel: e.target.value }))
                      }
                      className="w-full rounded-xl border border-[var(--card-border)] bg-white/80 px-3 py-2 text-sm"
                    />
                  </EditableField>
                  <div className="sm:col-span-2">
                    <EditableField label="Notes">
                      <input
                        type="text"
                        value={rentForm.notes}
                        onChange={(e) =>
                          setRentForm((f) => ({ ...f, notes: e.target.value }))
                        }
                        className="w-full rounded-xl border border-[var(--card-border)] bg-white/80 px-3 py-2 text-sm"
                        placeholder="Cash, Zelle, partial…"
                      />
                    </EditableField>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => addRentMutation.mutate()}
                  disabled={
                    addRentMutation.isPending ||
                    !rentForm.amount ||
                    !rentForm.paidOn ||
                    Number(rentForm.amount) <= 0
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl app-btn-primary px-4 py-2 text-sm font-semibold disabled:opacity-60"
                >
                  <Plus size={16} />
                  {addRentMutation.isPending ? "Saving…" : "Log payment"}
                </button>
                {addRentMutation.isError ? (
                  <p className="text-xs text-rose-600">
                    {addRentMutation.error instanceof Error
                      ? addRentMutation.error.message
                      : "Save failed"}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <p className="app-label px-1">Rent received</p>
                {rentQuery.isLoading ? (
                  <div className="app-card p-6 flex items-center gap-2 text-slate-500 text-sm">
                    <Loader2 className="animate-spin" size={16} />
                    Loading payments…
                  </div>
                ) : payments.length === 0 ? (
                  <div className="app-card p-5 text-sm text-[var(--muted)]">
                    No rent logged yet — record payments as they land.
                  </div>
                ) : (
                  payments.map((payment) => (
                    <div
                      key={payment.id}
                      className="app-card p-4 flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[var(--ink)]">
                          {formatCurrency(payment.amount)}
                          <span className="font-medium text-[var(--muted)]">
                            {" · "}
                            {payment.tenant
                              ? tenantDisplayName(payment.tenant)
                              : "Unassigned"}
                          </span>
                        </p>
                        <p className="text-xs text-[var(--muted)] mt-0.5">
                          Paid {formatHomeDueLabel(payment.paidOn)}
                          {payment.periodLabel ? ` · covers ${payment.periodLabel}` : ""}
                        </p>
                        {payment.notes ? (
                          <p className="text-xs text-[var(--muted)] mt-1">{payment.notes}</p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => deleteRentMutation.mutate(payment.id)}
                        disabled={deleteRentMutation.isPending}
                        className="rounded-lg p-2 text-rose-600 hover:bg-rose-50 shrink-0"
                        aria-label="Delete payment"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {subView === "maintenance" && (
            <div className="space-y-4">
              <div className="app-card p-5 space-y-4">
                <div>
                  <p className="app-label">Log issue or repair</p>
                  <p className="text-xs text-[var(--muted)] mt-0.5">
                    Track what breaks, what it costs, and whether it is still open.
                  </p>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <EditableField label="Type">
                    <select
                      value={maintForm.issueType}
                      onChange={(e) =>
                        setMaintForm((f) => ({ ...f, issueType: e.target.value }))
                      }
                      className="w-full rounded-xl border border-[var(--card-border)] bg-white/80 px-3 py-2 text-sm"
                    >
                      {HOME_MAINTENANCE_TYPES.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </EditableField>
                  <EditableField label="Status">
                    <select
                      value={maintForm.status}
                      onChange={(e) =>
                        setMaintForm((f) => ({ ...f, status: e.target.value }))
                      }
                      className="w-full rounded-xl border border-[var(--card-border)] bg-white/80 px-3 py-2 text-sm"
                    >
                      {HOME_MAINTENANCE_STATUSES.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </EditableField>
                  <div className="sm:col-span-2">
                    <EditableField label="Title">
                      <input
                        type="text"
                        value={maintForm.title}
                        onChange={(e) =>
                          setMaintForm((f) => ({ ...f, title: e.target.value }))
                        }
                        className="w-full rounded-xl border border-[var(--card-border)] bg-white/80 px-3 py-2 text-sm"
                        placeholder="Leaky faucet upstairs bath…"
                      />
                    </EditableField>
                  </div>
                  <EditableField label="Date noticed">
                    <input
                      type="date"
                      value={maintForm.issueDate}
                      onChange={(e) =>
                        setMaintForm((f) => ({ ...f, issueDate: e.target.value }))
                      }
                      className="w-full rounded-xl border border-[var(--card-border)] bg-white/80 px-3 py-2 text-sm"
                    />
                  </EditableField>
                  <EditableField label="Cost ($)">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={maintForm.cost}
                      onChange={(e) =>
                        setMaintForm((f) => ({ ...f, cost: e.target.value }))
                      }
                      className="w-full rounded-xl border border-[var(--card-border)] bg-white/80 px-3 py-2 text-sm"
                      placeholder="Optional"
                    />
                  </EditableField>
                  <div className="sm:col-span-2">
                    <EditableField label="Notes">
                      <textarea
                        value={maintForm.notes}
                        onChange={(e) =>
                          setMaintForm((f) => ({ ...f, notes: e.target.value }))
                        }
                        rows={2}
                        className="w-full rounded-xl border border-[var(--card-border)] bg-white/80 px-3 py-2 text-sm"
                        placeholder="Vendor, parts, follow-up…"
                      />
                    </EditableField>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => addMaintMutation.mutate()}
                  disabled={
                    addMaintMutation.isPending ||
                    !maintForm.title.trim() ||
                    !maintForm.issueDate
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl app-btn-primary px-4 py-2 text-sm font-semibold disabled:opacity-60"
                >
                  <Plus size={16} />
                  {addMaintMutation.isPending ? "Saving…" : "Add issue"}
                </button>
                {addMaintMutation.isError ? (
                  <p className="text-xs text-rose-600">
                    {addMaintMutation.error instanceof Error
                      ? addMaintMutation.error.message
                      : "Save failed"}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <p className="app-label px-1">Issue history</p>
                {maintenanceQuery.isLoading ? (
                  <div className="app-card p-6 flex items-center gap-2 text-slate-500 text-sm">
                    <Loader2 className="animate-spin" size={16} />
                    Loading issues…
                  </div>
                ) : logs.length === 0 ? (
                  <div className="app-card p-5 text-sm text-[var(--muted)]">
                    No issues logged yet — capture repairs as they come up.
                  </div>
                ) : (
                  logs.map((log) => (
                    <div key={log.id} className="app-card p-4 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[var(--ink)]">
                            {log.title}
                          </p>
                          <p className="text-xs text-[var(--muted)] mt-0.5">
                            {homeMaintenanceTypeLabel(log.issueType)}
                            {" · "}
                            <span className={statusTone(log.status)}>
                              {homeMaintenanceStatusLabel(log.status)}
                            </span>
                            {" · "}
                            {formatHomeDueLabel(log.issueDate)}
                            {log.cost != null ? ` · ${formatCurrency(log.cost)}` : ""}
                          </p>
                          {log.notes ? (
                            <p className="text-xs text-[var(--muted)] mt-1">{log.notes}</p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => deleteMaintMutation.mutate(log.id)}
                          disabled={deleteMaintMutation.isPending}
                          className="rounded-lg p-2 text-rose-600 hover:bg-rose-50 shrink-0"
                          aria-label="Delete issue"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      {log.status !== "resolved" ? (
                        <div className="flex flex-wrap gap-2">
                          {log.status === "open" ? (
                            <button
                              type="button"
                              onClick={() =>
                                updateMaintStatusMutation.mutate({
                                  id: log.id,
                                  status: "in_progress",
                                })
                              }
                              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200 bg-amber-50"
                            >
                              Mark in progress
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() =>
                              updateMaintStatusMutation.mutate({
                                id: log.id,
                                status: "resolved",
                              })
                            }
                            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200 bg-emerald-50"
                          >
                            <CheckCircle2 size={12} />
                            Mark resolved
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
