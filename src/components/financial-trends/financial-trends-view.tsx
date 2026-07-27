"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DateTime } from "luxon";
import { formatCurrency } from "@/lib/format";
import {
  FINANCIAL_EVENT_CATEGORIES,
  type MonthlyTrendPoint,
  type TrendsEvent,
  type TrendsInsight,
  type TrajectoryAnswers,
} from "@/lib/financial-trends";
import { TrendLineChart } from "@/components/financial-trends/trend-line-chart";

type Headline = {
  netWorth: number;
  cash: number;
  debt: number;
  assets: number;
  vsLastMonth: { netWorth: number; cash: number; debt: number } | null;
  vsLastQuarter: { netWorth: number; cash: number; debt: number } | null;
  vsLastYear: { netWorth: number; cash: number; debt: number } | null;
};

type TrendsResponse = {
  error?: string;
  months: number;
  expectedMonthlyRent: number;
  series: MonthlyTrendPoint[];
  events: TrendsEvent[];
  insights: TrendsInsight[];
  answers: TrajectoryAnswers;
  largeExpenses: Array<{ date: string; name: string; amount: number }>;
  headline: Headline | null;
  note?: string;
};

type RollingToggles = {
  cash: boolean;
  income: boolean;
  expenses: boolean;
  netCashFlow: boolean;
};

async function fetchTrends(months: number): Promise<TrendsResponse> {
  const res = await fetch(`/api/financial-trends?months=${months}`);
  const data = (await res.json().catch(() => ({}))) as TrendsResponse;
  if (!res.ok) throw new Error(data.error || "Failed to load financial trends");
  return data;
}

function formatSigned(amount: number) {
  if (Math.abs(amount) < 0.01) return "$0";
  return `${amount > 0 ? "+" : "-"}${formatCurrency(Math.abs(amount))}`;
}

function toneClass(tone: TrendsInsight["tone"]) {
  if (tone === "positive") return "text-[var(--accent-strong)]";
  if (tone === "negative") return "text-rose-600";
  return "text-[var(--ink)]";
}

function answerLabel(value: boolean | null, yes: string, no: string) {
  if (value == null) return "Not enough history yet";
  return value ? yes : no;
}

function answerTone(value: boolean | null, goodWhenTrue = true) {
  if (value == null) return "text-[var(--ink-soft)]";
  const good = goodWhenTrue ? value : !value;
  return good ? "text-[var(--accent-strong)]" : "text-rose-600";
}

const CATEGORY_LABELS: Record<string, string> = {
  vehicle: "Purchased vehicle",
  refund: "Insurance refund",
  repair: "Major home repair",
  vacation: "Vacation",
  tax: "Tax payment",
  tenant: "Tenant moved in/out",
  maintenance: "Unexpected maintenance",
  other: "Other",
};

export function FinancialTrendsView() {
  const queryClient = useQueryClient();
  const [months, setMonths] = useState(12);
  const [showEvents, setShowEvents] = useState(true);
  const [rolling, setRolling] = useState<RollingToggles>({
    cash: true,
    income: true,
    expenses: true,
    netCashFlow: true,
  });

  const [eventForm, setEventForm] = useState({
    date: DateTime.local().toISODate() ?? "",
    title: "",
    category: "other",
    amount: "",
    note: "",
  });
  const [rentDraft, setRentDraft] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["financial-trends", months],
    queryFn: () => fetchTrends(months),
  });

  const createEvent = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/financial-trends/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: eventForm.date,
          title: eventForm.title || CATEGORY_LABELS[eventForm.category] || "Event",
          category: eventForm.category,
          amount: eventForm.amount === "" ? null : Number(eventForm.amount),
          note: eventForm.note || null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to add event");
      return body;
    },
    onSuccess: async () => {
      setEventForm((prev) => ({ ...prev, title: "", amount: "", note: "" }));
      await queryClient.invalidateQueries({ queryKey: ["financial-trends"] });
    },
  });

  const deleteEvent = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/financial-trends/events?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to delete event");
      return body;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["financial-trends"] });
    },
  });

  const saveRent = useMutation({
    mutationFn: async (expectedMonthlyRent: number) => {
      const res = await fetch("/api/financial-trends", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedMonthlyRent }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to save rent");
      return body;
    },
    onSuccess: async () => {
      setRentDraft(null);
      await queryClient.invalidateQueries({ queryKey: ["financial-trends"] });
    },
  });

  const events = data?.events ?? [];
  const series = data?.series ?? [];
  const headline = data?.headline;

  const comparisonCards = useMemo(() => {
    if (!headline) return [];
    return [
      {
        label: "Vs last month",
        netWorth: headline.vsLastMonth?.netWorth ?? null,
        cash: headline.vsLastMonth?.cash ?? null,
        debt: headline.vsLastMonth?.debt ?? null,
      },
      {
        label: "Vs last quarter",
        netWorth: headline.vsLastQuarter?.netWorth ?? null,
        cash: headline.vsLastQuarter?.cash ?? null,
        debt: headline.vsLastQuarter?.debt ?? null,
      },
      {
        label: "Vs last year",
        netWorth: headline.vsLastYear?.netWorth ?? null,
        cash: headline.vsLastYear?.cash ?? null,
        debt: headline.vsLastYear?.debt ?? null,
      },
    ];
  }, [headline]);

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-64 rounded-lg bg-[color-mix(in_srgb,var(--ink)_12%,transparent)]" />
        <div className="h-24 rounded-xl bg-[color-mix(in_srgb,var(--ink)_6%,transparent)]" />
        <div className="h-64 rounded-xl bg-[color-mix(in_srgb,var(--ink)_6%,transparent)]" />
      </div>
    );
  }

  if (error || !data || data.error) {
    return (
      <div className="app-card p-6 text-sm text-[var(--muted)]">
        {error instanceof Error ? error.message : data?.error || "Could not load financial trends."}
      </div>
    );
  }

  const answers = data.answers;
  const expectedRentValue = rentDraft ?? String(data.expectedMonthlyRent);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="app-label mb-1">Financial trends</p>
          <h2 className="text-2xl font-semibold text-[var(--ink)] tracking-tight">
            Am I financially better off than I was?
          </h2>
          <p className="text-sm text-[var(--ink-soft)] mt-2 leading-relaxed">
            Long-term trajectory — month, quarter, and year — not today&apos;s bank refresh. Review
            this like an investor reading the business, not like someone checking balances every
            morning.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {[12, 18, 24].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setMonths(value)}
              className={`rounded-xl px-3 py-2 text-xs font-semibold ring-1 transition-colors ${
                months === value
                  ? "bg-[var(--accent-soft)] text-[var(--accent-strong)] ring-[color-mix(in_srgb,var(--accent)_28%,transparent)]"
                  : "bg-[color-mix(in_srgb,var(--ink)_4%,transparent)] text-[var(--ink-soft)] ring-[var(--card-border)]"
              }`}
            >
              {value} mo
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowEvents((v) => !v)}
            className={`rounded-xl px-3 py-2 text-xs font-semibold ring-1 transition-colors ${
              showEvents
                ? "bg-[var(--accent-soft)] text-[var(--accent-strong)] ring-[color-mix(in_srgb,var(--accent)_28%,transparent)]"
                : "bg-[color-mix(in_srgb,var(--ink)_4%,transparent)] text-[var(--ink-soft)] ring-[var(--card-border)]"
            }`}
          >
            Events {showEvents ? "on" : "off"}
          </button>
        </div>
      </div>

      {headline ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Net worth", value: headline.netWorth },
            { label: "Cash", value: headline.cash },
            { label: "Debt", value: headline.debt, invert: true },
            { label: "Assets", value: headline.assets },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl bg-[color-mix(in_srgb,var(--ink)_5%,transparent)] p-4 ring-1 ring-[var(--card-border)]"
            >
              <p className="app-label mb-1">{stat.label}</p>
              <p className="text-xl font-bold tabular-nums text-[var(--ink)] tracking-tight">
                {formatCurrency(stat.value)}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        {comparisonCards.map((card) => (
          <div key={card.label} className="app-card p-4 space-y-2">
            <p className="app-label">{card.label}</p>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-[var(--muted)]">Net worth</span>
                <span
                  className={`tabular-nums font-semibold ${
                    card.netWorth == null
                      ? "text-[var(--ink-soft)]"
                      : card.netWorth >= 0
                        ? "text-[var(--accent-strong)]"
                        : "text-rose-600"
                  }`}
                >
                  {card.netWorth == null ? "—" : formatSigned(card.netWorth)}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[var(--muted)]">Cash</span>
                <span
                  className={`tabular-nums font-semibold ${
                    card.cash == null
                      ? "text-[var(--ink-soft)]"
                      : card.cash >= 0
                        ? "text-[var(--accent-strong)]"
                        : "text-rose-600"
                  }`}
                >
                  {card.cash == null ? "—" : formatSigned(card.cash)}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[var(--muted)]">Debt</span>
                <span
                  className={`tabular-nums font-semibold ${
                    card.debt == null
                      ? "text-[var(--ink-soft)]"
                      : card.debt <= 0
                        ? "text-[var(--accent-strong)]"
                        : "text-rose-600"
                  }`}
                >
                  {card.debt == null ? "—" : formatSigned(card.debt)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="app-card p-5 space-y-4">
        <div>
          <p className="app-label mb-1">Quick answers</p>
          <h3 className="text-lg font-semibold text-[var(--ink)]">Investor checklist</h3>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              q: "Richer than 6 months ago?",
              a: answerLabel(answers.richerThanSixMonthsAgo, "Yes — net worth up", "Not yet"),
              tone: answerTone(answers.richerThanSixMonthsAgo),
            },
            {
              q: "Cash balance growing?",
              a: answerLabel(answers.cashGrowing, "Yes — reserves rising", "No — cash soft"),
              tone: answerTone(answers.cashGrowing),
            },
            {
              q: "Debt shrinking?",
              a: answerLabel(answers.debtShrinking, "Yes — debt coming down", "No — debt sticky"),
              tone: answerTone(answers.debtShrinking),
            },
            {
              q: "Spending under control?",
              a: answerLabel(
                answers.spendingUnderControl,
                "Yes — spend trend contained",
                "No — spend drifting up",
              ),
              tone: answerTone(answers.spendingUnderControl),
            },
            {
              q: "Rental helping the position?",
              a: answerLabel(
                answers.rentalHelping,
                "Yes — collection looks solid",
                "Weak — collection lagging",
              ),
              tone: answerTone(answers.rentalHelping),
            },
          ].map((item) => (
            <div
              key={item.q}
              className="rounded-xl bg-[color-mix(in_srgb,var(--ink)_4%,transparent)] p-3 ring-1 ring-[var(--card-border)]"
            >
              <p className="text-xs text-[var(--muted)] mb-1">{item.q}</p>
              <p className={`text-sm font-semibold ${item.tone}`}>{item.a}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="app-card p-5 space-y-4">
        <div>
          <p className="app-label mb-1">Insights</p>
          <h3 className="text-lg font-semibold text-[var(--ink)]">What the trend says</h3>
        </div>
        <ul className="space-y-3">
          {data.insights.map((insight) => (
            <li
              key={insight.id}
              className="rounded-xl bg-[color-mix(in_srgb,var(--ink)_4%,transparent)] p-3 ring-1 ring-[var(--card-border)]"
            >
              <p className={`text-sm font-semibold ${toneClass(insight.tone)}`}>{insight.title}</p>
              <p className="text-sm text-[var(--ink-soft)] mt-1 leading-relaxed">{insight.detail}</p>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <TrendLineChart
          title="Total net worth"
          subtitle="Assets minus debt — the main ‘am I better off?’ line."
          points={series}
          valueKey="netWorth"
          events={events}
          showEvents={showEvents}
          showRolling={false}
        />
        <TrendLineChart
          title="Total cash balance"
          subtitle="Depository spendable cash reconstructed month to month."
          points={series}
          valueKey="cash"
          rollingKey="cashRolling3"
          showRolling={rolling.cash}
          onToggleRolling={() => setRolling((r) => ({ ...r, cash: !r.cash }))}
          events={events}
          showEvents={showEvents}
        />
        <TrendLineChart
          title="Total debt balance"
          subtitle="Credit + loan balances. Down is good."
          points={series}
          valueKey="debt"
          invertGood
          events={events}
          showEvents={showEvents}
          showRolling={false}
        />
        <TrendLineChart
          title="Total assets"
          subtitle="Cash plus investments and other non-debt balances."
          points={series}
          valueKey="assets"
          events={events}
          showEvents={showEvents}
          showRolling={false}
        />
        <TrendLineChart
          title="Monthly income"
          subtitle="Posted inflows (excluding transfers)."
          points={series}
          valueKey="income"
          rollingKey="incomeRolling3"
          showRolling={rolling.income}
          onToggleRolling={() => setRolling((r) => ({ ...r, income: !r.income }))}
          events={events}
          showEvents={showEvents}
        />
        <TrendLineChart
          title="Monthly expenses"
          subtitle="Posted outflows (excluding transfers)."
          points={series}
          valueKey="expenses"
          rollingKey="expensesRolling3"
          showRolling={rolling.expenses}
          onToggleRolling={() => setRolling((r) => ({ ...r, expenses: !r.expenses }))}
          invertGood
          events={events}
          showEvents={showEvents}
        />
        <TrendLineChart
          title="Monthly net cash flow"
          subtitle="Income minus expenses each month."
          points={series}
          valueKey="netCashFlow"
          rollingKey="netCashFlowRolling3"
          showRolling={rolling.netCashFlow}
          onToggleRolling={() => setRolling((r) => ({ ...r, netCashFlow: !r.netCashFlow }))}
          events={events}
          showEvents={showEvents}
        />
        <TrendLineChart
          title="Rent collected vs expected"
          subtitle="Tenant payment candidates vs your expected monthly rent."
          points={series}
          valueKey="rentCollected"
          secondaryKey="expectedRent"
          secondaryLabel="Expected"
          events={events}
          showEvents={showEvents}
          showRolling={false}
        />
      </div>

      <div className="app-card p-5 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="app-label mb-1">Rent settings</p>
            <h3 className="text-lg font-semibold text-[var(--ink)]">Expected monthly rent</h3>
            <p className="text-sm text-[var(--muted)] mt-1">
              Default assumes upstairs + basement rooms occupied (~$2,650). Adjust if vacancy or
              rents change.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              step={50}
              value={expectedRentValue}
              onChange={(e) => setRentDraft(e.target.value)}
              className="w-32 rounded-xl border border-[var(--card-border)] bg-[var(--surface)] px-3 py-2 text-sm tabular-nums text-[var(--ink)]"
            />
            <button
              type="button"
              disabled={saveRent.isPending || rentDraft == null}
              onClick={() => saveRent.mutate(Number(expectedRentValue))}
              className="rounded-xl bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
        {saveRent.isError ? (
          <p className="text-sm text-rose-600">
            {saveRent.error instanceof Error ? saveRent.error.message : "Save failed"}
          </p>
        ) : null}
      </div>

      <div className="app-card p-5 space-y-5">
        <div>
          <p className="app-label mb-1">Event timeline</p>
          <h3 className="text-lg font-semibold text-[var(--ink)]">Context for the turns</h3>
          <p className="text-sm text-[var(--muted)] mt-1 leading-relaxed">
            Mark big moments — vehicle purchase, tax payment, tenant move-in, vacation — so trend
            bends have a story.
          </p>
        </div>

        <form
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
          onSubmit={(e) => {
            e.preventDefault();
            createEvent.mutate();
          }}
        >
          <label className="text-xs text-[var(--muted)] space-y-1">
            <span>Date</span>
            <input
              type="date"
              required
              value={eventForm.date}
              onChange={(e) => setEventForm((f) => ({ ...f, date: e.target.value }))}
              className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
            />
          </label>
          <label className="text-xs text-[var(--muted)] space-y-1">
            <span>Category</span>
            <select
              value={eventForm.category}
              onChange={(e) => setEventForm((f) => ({ ...f, category: e.target.value }))}
              className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
            >
              {FINANCIAL_EVENT_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {CATEGORY_LABELS[category] ?? category}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-[var(--muted)] space-y-1 sm:col-span-2 lg:col-span-1">
            <span>Title</span>
            <input
              type="text"
              placeholder={CATEGORY_LABELS[eventForm.category] ?? "Event"}
              value={eventForm.title}
              onChange={(e) => setEventForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
            />
          </label>
          <label className="text-xs text-[var(--muted)] space-y-1">
            <span>Amount (optional)</span>
            <input
              type="number"
              step="0.01"
              value={eventForm.amount}
              onChange={(e) => setEventForm((f) => ({ ...f, amount: e.target.value }))}
              className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--surface)] px-3 py-2 text-sm tabular-nums text-[var(--ink)]"
            />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={createEvent.isPending}
              className="w-full rounded-xl bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Add event
            </button>
          </div>
        </form>
        {createEvent.isError ? (
          <p className="text-sm text-rose-600">
            {createEvent.error instanceof Error ? createEvent.error.message : "Could not add event"}
          </p>
        ) : null}

        {events.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No events yet — add one to annotate the charts.</p>
        ) : (
          <ul className="divide-y divide-[var(--card-border)] rounded-xl ring-1 ring-[var(--card-border)]">
            {[...events].reverse().map((event) => (
              <li
                key={event.id}
                className="flex items-start justify-between gap-3 px-3 py-3 text-sm"
              >
                <div>
                  <p className="font-medium text-[var(--ink)]">{event.title}</p>
                  <p className="text-xs text-[var(--muted)] mt-0.5">
                    {event.date} · {CATEGORY_LABELS[event.category] ?? event.category}
                    {event.amount != null ? ` · ${formatCurrency(event.amount)}` : ""}
                  </p>
                  {event.note ? (
                    <p className="text-xs text-[var(--ink-soft)] mt-1">{event.note}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => deleteEvent.mutate(event.id)}
                  className="text-xs font-semibold text-rose-600 hover:opacity-80 shrink-0"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {data.note ? (
        <p className="text-[11px] text-[var(--muted)] leading-relaxed">{data.note}</p>
      ) : null}
    </div>
  );
}
