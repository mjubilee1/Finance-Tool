"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Car, FileText, Loader2, Pencil, Shield, Wallet } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import {
  CAR_DOCUMENTS,
  CAR_FUNDED_BY,
  carDocumentsForSubsection,
  carMonthlyTotal,
  formatCarDueLabel,
  type CarDocumentMeta,
  type CarProfileLike,
} from "@/lib/car";
import { formatCurrency } from "@/lib/format";

type CarSubView = "payment" | "insurance" | "documents";

type CarProfileResponse = {
  profile: CarProfileLike & { id: string };
};

async function fetchCarProfile(): Promise<CarProfileResponse> {
  const res = await fetch("/api/car/profile");
  if (!res.ok) throw new Error("Failed to load car profile");
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

export function CarView() {
  const queryClient = useQueryClient();
  const [subView, setSubView] = useState<CarSubView>("payment");
  const [editing, setEditing] = useState(false);
  const [busyDocId, setBusyDocId] = useState<string | null>(null);
  const [docError, setDocError] = useState<string | null>(null);
  const [form, setForm] = useState({
    paymentMonthly: "",
    paymentNextDue: "",
    insuranceMonthly: "",
    insuranceNextDue: "",
    notes: "",
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["car-profile"],
    queryFn: fetchCarProfile,
  });

  const profile = data?.profile;

  useEffect(() => {
    if (!profile || editing) return;
    setForm({
      paymentMonthly: String(profile.paymentMonthly),
      paymentNextDue: profile.paymentNextDue,
      insuranceMonthly: String(profile.insuranceMonthly),
      insuranceNextDue: profile.insuranceNextDue,
      notes: profile.notes ?? "",
    });
  }, [profile, editing]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/car/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentMonthly: Number(form.paymentMonthly),
          paymentNextDue: form.paymentNextDue,
          insuranceMonthly: Number(form.insuranceMonthly),
          insuranceNextDue: form.insuranceNextDue,
          notes: form.notes,
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
  const monthlyTotal = profile
    ? carMonthlyTotal(profile)
    : null;

  const tabs: { id: CarSubView; label: string; Icon: typeof Wallet }[] = [
    { id: "payment", label: "Payment", Icon: Wallet },
    { id: "insurance", label: "Insurance", Icon: Shield },
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
          Owned vehicle obligations from {CAR_FUNDED_BY} — payment, insurance, and purchase docs.
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
      ) : error || !profile ? (
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
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (editing) {
                    setEditing(false);
                  } else {
                    setEditing(true);
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 ring-1 ring-[var(--card-border)] bg-white/70 hover:bg-white"
              >
                <Pencil size={14} />
                {editing ? "Cancel" : "Edit"}
              </button>
            </div>

            {editing ? (
              <div className="grid sm:grid-cols-2 gap-4">
                <EditableField label="Payment amount ($)">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.paymentMonthly}
                    onChange={(e) => setForm((f) => ({ ...f, paymentMonthly: e.target.value }))}
                    className="w-full rounded-xl border border-[var(--card-border)] bg-white/80 px-3 py-2 text-sm"
                  />
                </EditableField>
                <EditableField label="Payment next due">
                  <input
                    type="date"
                    value={form.paymentNextDue}
                    onChange={(e) => setForm((f) => ({ ...f, paymentNextDue: e.target.value }))}
                    className="w-full rounded-xl border border-[var(--card-border)] bg-white/80 px-3 py-2 text-sm"
                  />
                </EditableField>
                <EditableField label="Insurance amount ($)">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.insuranceMonthly}
                    onChange={(e) => setForm((f) => ({ ...f, insuranceMonthly: e.target.value }))}
                    className="w-full rounded-xl border border-[var(--card-border)] bg-white/80 px-3 py-2 text-sm"
                  />
                </EditableField>
                <EditableField label="Insurance next due">
                  <input
                    type="date"
                    value={form.insuranceNextDue}
                    onChange={(e) => setForm((f) => ({ ...f, insuranceNextDue: e.target.value }))}
                    className="w-full rounded-xl border border-[var(--card-border)] bg-white/80 px-3 py-2 text-sm"
                  />
                </EditableField>
                <div className="sm:col-span-2">
                  <EditableField label="Notes">
                    <textarea
                      value={form.notes}
                      onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                      rows={2}
                      className="w-full rounded-xl border border-[var(--card-border)] bg-white/80 px-3 py-2 text-sm"
                      placeholder="Lender, policy number, reminders…"
                    />
                  </EditableField>
                </div>
                <div className="sm:col-span-2 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => saveMutation.mutate()}
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
                {profile.notes ? (
                  <p className="text-xs text-[var(--muted)] pt-2 border-t border-[var(--card-border)]">
                    {profile.notes}
                  </p>
                ) : null}
              </div>
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
