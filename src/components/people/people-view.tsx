"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DateTime } from "luxon";
import { userNow } from "@/lib/user-timezone";
import {
  Check,
  ChevronDown,
  ChevronUp,
  ImagePlus,
  Loader2,
  Minus,
  Plus,
  Search,
  Users,
  X,
} from "lucide-react";
import { VoiceToTextButton } from "@/components/voice-to-text-button";
import { isAcceptedChatImage, readImageAsDataUrl } from "@/lib/chat-images";
import { MEDIA_IMAGE_ACCEPT } from "@/lib/media-permissions";
import {
  CONTACT_STATUS_OPTIONS,
  CONTACT_TYPE_OPTIONS,
  MAX_NOTE_IMAGES,
  contactStatusLabel,
  contactTypeLabel,
  isBuilderContactType,
  normalizeContactStatus,
  normalizeContactType,
} from "@/lib/growth-contact-shared";
import { buildWeeklyPeopleLists } from "@/lib/people-lists";

type ContactNote = {
  id: string;
  body: string | null;
  images: string[];
  createdAt: string;
};

type Person = {
  id: string;
  name: string;
  relationshipType: string | null;
  lastContactDate: string | null;
  status: string;
  notes: string | null;
  suggestedNextAction: string | null;
  nextActionDate?: string | null;
  mutualValue?: string | null;
  asksOffers?: string | null;
  noteEntries?: ContactNote[];
};

type ContactsResponse = {
  contacts: Person[];
};

function latestSnippet(contact: Person): string | null {
  const entries = contact.noteEntries ?? [];
  return (
    entries[0]?.body?.trim() ||
    (contact.notes?.trim() ? firstSentence(contact.notes, 90) : null)
  );
}

function firstSentence(text: string | null | undefined, max = 140): string | null {
  if (!text?.trim()) return null;
  const sentence = text.split(/(?<=[.!?])\s+/)[0]?.trim() ?? text.trim();
  return sentence.length > max ? `${sentence.slice(0, max - 1).trim()}…` : sentence;
}

function formatActivityDate(iso: string): string {
  const dt = DateTime.fromISO(iso);
  if (!dt.isValid) return iso;
  const today = userNow().toISODate();
  if (iso === today) return "Today";
  if (iso === userNow().minus({ days: 1 }).toISODate()) return "Yesterday";
  return dt.toFormat("LLL d");
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const a = DateTime.fromISO(iso);
  const b = userNow().startOf("day");
  if (!a.isValid) return null;
  return Math.floor(b.diff(a.startOf("day"), "days").days);
}

function WeeklyPeopleSection({
  title,
  hint,
  people,
  empty,
  busy,
  onOpen,
  onNote,
  onReachedOut,
  onSkip,
  onRelabel,
}: {
  title: string;
  hint: string;
  people: Person[];
  empty: string;
  busy: string | null;
  onOpen: (id: string) => void;
  onNote: (contact: Person) => void;
  onReachedOut: (id: string) => void;
  onSkip: (id: string) => void;
  onRelabel: (id: string, type: string) => void;
}) {
  return (
    <div className="app-card space-y-3 p-4">
      <div>
        <p className="app-label">
          {title} · {people.length}
        </p>
        <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p>
      </div>
      {people.length === 0 ? (
        <p className="text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {people.map((contact) => {
            const days = daysSince(contact.lastContactDate);
            const snippet =
              contact.asksOffers?.trim() ||
              contact.mutualValue?.trim() ||
              latestSnippet(contact);
            return (
              <li key={contact.id} className="rounded-xl p-3 ring-1 ring-slate-100">
                <button
                  type="button"
                  onClick={() => onOpen(contact.id)}
                  className="min-h-11 w-full text-left"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="font-semibold text-slate-900">{contact.name}</p>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                      {contactTypeLabel(contact.relationshipType)}
                    </span>
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                      {contactStatusLabel(contact.status)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {days != null ? `Last touch ${days}d` : "No last touch"}
                    {contact.suggestedNextAction
                      ? ` · Next: ${contact.suggestedNextAction}`
                      : ""}
                    {contact.nextActionDate ? ` (${contact.nextActionDate})` : ""}
                  </p>
                  {snippet ? (
                    <p className="mt-1 line-clamp-2 text-xs text-slate-600">{snippet}</p>
                  ) : (
                    <p className="mt-1 text-xs text-slate-400">
                      Add stage + what they need so you stay the leverage point.
                    </p>
                  )}
                </button>
                <div className="mt-2 flex flex-wrap gap-2">
                  <select
                    className="app-input min-h-11 min-w-0 flex-1 px-2 py-2 text-[11px] font-semibold sm:max-w-[10rem]"
                    value={normalizeContactType(contact.relationshipType)}
                    disabled={busy === `contact-type-${contact.id}`}
                    onChange={(event) => onRelabel(contact.id, event.target.value)}
                    aria-label={`Role for ${contact.name}`}
                  >
                    {CONTACT_TYPE_OPTIONS.map((type) => (
                      <option key={type} value={type}>
                        {contactTypeLabel(type)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => onNote(contact)}
                    className="inline-flex min-h-11 items-center justify-center rounded-xl px-3 text-xs font-semibold text-teal-700 ring-1 ring-teal-200/80"
                  >
                    Note
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => onReachedOut(contact.id)}
                    className="inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-xl bg-teal-600 px-3 text-xs font-semibold text-white disabled:opacity-60 sm:flex-none"
                  >
                    {busy === `reach-${contact.id}` ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Check size={14} />
                    )}
                    Reached out
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => onSkip(contact.id)}
                    className="inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-xl px-3 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 disabled:opacity-60 sm:flex-none"
                  >
                    {busy === `skip-${contact.id}` ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Minus size={14} />
                    )}
                    Not a follow-up
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function PeopleView() {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [showContactForm, setShowContactForm] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      const open = sessionStorage.getItem("life-os-people-add") === "1";
      if (open) sessionStorage.removeItem("life-os-people-add");
      return open;
    } catch {
      return false;
    }
  });
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState("");
  const [pendingNoteImages, setPendingNoteImages] = useState<string[]>([]);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [contactQuery, setContactQuery] = useState("");
  const [contactTypeFilter, setContactTypeFilter] = useState("all");
  const [expandedContactId, setExpandedContactId] = useState<string | null>(null);
  const [reachOutId, setReachOutId] = useState<string | null>(null);
  const [reachOutDraft, setReachOutDraft] = useState({
    note: "",
    suggestedNextAction: "",
    nextActionDate: userNow().plus({ days: 7 }).toISODate() ?? "",
    asksOffers: "",
  });
  const [reachOutError, setReachOutError] = useState<string | null>(null);
  const [contactForm, setContactForm] = useState({
    name: "",
    relationshipType: "founder",
    status: "active",
    lastContactDate: userNow().toISODate() ?? "",
    notes: "",
    mutualValue: "",
    asksOffers: "",
    suggestedNextAction: "",
    nextActionDate: userNow().toISODate() ?? "",
  });
  const [leverageDraft, setLeverageDraft] = useState({
    mutualValue: "",
    asksOffers: "",
    suggestedNextAction: "",
    nextActionDate: "",
    status: "active",
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["growth-contacts"],
    queryFn: async () => {
      const res = await fetch("/api/growth/contacts");
      if (!res.ok) throw new Error("Failed to load people");
      return res.json() as Promise<ContactsResponse>;
    },
    staleTime: 30_000,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["growth-contacts"] });
    void queryClient.invalidateQueries({ queryKey: ["growth-dashboard"] });
    void queryClient.invalidateQueries({ queryKey: ["growth-overview-preview"] });
    void queryClient.invalidateQueries({ queryKey: ["overview-today"] });
  };

  const contacts = useMemo(() => data?.contacts ?? [], [data?.contacts]);

  useEffect(() => {
    if (!contacts.length) return;
    try {
      const focusId = sessionStorage.getItem("life-os-people-focus");
      if (!focusId) return;
      sessionStorage.removeItem("life-os-people-focus");
      const person = contacts.find((c) => c.id === focusId);
      if (!person) return;
      setExpandedContactId(person.id);
      setLeverageDraft({
        mutualValue: person.mutualValue ?? "",
        asksOffers: person.asksOffers ?? "",
        suggestedNextAction: person.suggestedNextAction ?? "",
        nextActionDate: person.nextActionDate ?? "",
        status: normalizeContactStatus(person.status),
      });
    } catch {
      /* ignore */
    }
  }, [contacts]);

  const today = userNow().toISODate() ?? "";
  const weeklyLists = useMemo(
    () => buildWeeklyPeopleLists(contacts, today),
    [contacts, today],
  );

  const contactTypes = useMemo(() => {
    const present = new Set(
      contacts.map((contact) => normalizeContactType(contact.relationshipType)),
    );
    return CONTACT_TYPE_OPTIONS.filter((type) => present.has(type));
  }, [contacts]);

  const filteredContacts = useMemo(() => {
    const q = contactQuery.trim().toLowerCase();
    return contacts
      .filter((contact) => {
        if (contactTypeFilter !== "all") {
          if (normalizeContactType(contact.relationshipType) !== contactTypeFilter) return false;
        }
        if (!q) return true;
        const haystack = [
          contact.name,
          contact.relationshipType ?? "",
          contact.status,
          contact.notes ?? "",
          contact.suggestedNextAction ?? "",
          ...(contact.noteEntries ?? []).map((entry) => entry.body ?? ""),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [contacts, contactQuery, contactTypeFilter]);

  const updateContactType = async (id: string, relationshipType: string) => {
    setBusy(`contact-type-${id}`);
    try {
      const res = await fetch("/api/growth/contacts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, relationshipType }),
      });
      if (res.ok) invalidate();
    } finally {
      setBusy(null);
    }
  };

  const patchContact = async (id: string, body: Record<string, string>, busyKey: string) => {
    setBusy(busyKey);
    try {
      const res = await fetch("/api/growth/contacts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...body }),
      });
      if (res.ok) invalidate();
    } finally {
      setBusy(null);
    }
  };

  const markReachedOut = (id: string) => {
    const person = contacts.find((c) => c.id === id);
    setReachOutId(id);
    setReachOutError(null);
    setReachOutDraft({
      note: "",
      suggestedNextAction: person?.suggestedNextAction ?? "",
      nextActionDate:
        person?.nextActionDate && person.nextActionDate > (userNow().toISODate() ?? "")
          ? person.nextActionDate
          : userNow().plus({ days: 7 }).toISODate() ?? "",
      asksOffers: person?.asksOffers ?? "",
    });
    setExpandedContactId(id);
  };

  const submitReachOut = async () => {
    if (!reachOutId) return;
    const next = reachOutDraft.suggestedNextAction.trim();
    const due = reachOutDraft.nextActionDate.trim();
    if (!next) {
      setReachOutError("Add the next concrete step.");
      return;
    }
    if (!due) {
      setReachOutError("Add a due date for that next step.");
      return;
    }
    setBusy(`reach-${reachOutId}`);
    setReachOutError(null);
    try {
      const today = userNow().toISODate() ?? "";
      const noteBody = reachOutDraft.note.trim();
      if (noteBody) {
        const noteRes = await fetch("/api/growth/contacts/notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contactId: reachOutId,
            body: noteBody,
            suggestedNextAction: next,
            nextActionDate: due,
            asksOffers: reachOutDraft.asksOffers.trim() || undefined,
            status: "active",
            lastContactDate: today,
          }),
        });
        if (!noteRes.ok) {
          const payload = (await noteRes.json().catch(() => null)) as { error?: string } | null;
          setReachOutError(payload?.error ?? "Could not save touch.");
          return;
        }
      } else {
        const res = await fetch("/api/growth/contacts", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: reachOutId,
            lastContactDate: today,
            status: "active",
            suggestedNextAction: next,
            nextActionDate: due,
            asksOffers: reachOutDraft.asksOffers.trim(),
          }),
        });
        if (!res.ok) {
          setReachOutError("Could not save touch.");
          return;
        }
      }
      setReachOutId(null);
      invalidate();
    } finally {
      setBusy(null);
    }
  };

  const skipFollowUp = (id: string) => patchContact(id, { status: "dormant" }, `skip-${id}`);

  const chaseAgain = (id: string) => patchContact(id, { status: "active" }, `chase-${id}`);

  const submitContact = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy("contact");
    try {
      const res = await fetch("/api/growth/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...contactForm,
          relationshipType: normalizeContactType(contactForm.relationshipType),
          status: normalizeContactStatus(contactForm.status),
          trustLevel: "3",
        }),
      });
      if (res.ok) {
        setShowContactForm(false);
        setContactForm((prev) => ({
          ...prev,
          name: "",
          notes: "",
          mutualValue: "",
          asksOffers: "",
          suggestedNextAction: "",
        }));
        invalidate();
      }
    } finally {
      setBusy(null);
    }
  };

  const closeContactNotes = () => {
    setEditingContactId(null);
    setEditingNotes("");
    setPendingNoteImages([]);
    setNoteError(null);
  };

  const openContactNotes = (contact: Person) => {
    setEditingContactId(contact.id);
    setExpandedContactId(contact.id);
    setEditingNotes("");
    setPendingNoteImages([]);
    setNoteError(null);
    setShowContactForm(false);
    setLeverageDraft({
      mutualValue: contact.mutualValue ?? "",
      asksOffers: contact.asksOffers ?? "",
      suggestedNextAction: contact.suggestedNextAction ?? "",
      nextActionDate: contact.nextActionDate ?? "",
      status: normalizeContactStatus(contact.status),
    });
  };

  const toggleContactExpanded = (contactId: string) => {
    setExpandedContactId((prev) => {
      if (prev === contactId) {
        if (editingContactId === contactId) closeContactNotes();
        return null;
      }
      const person = contacts.find((contact) => contact.id === contactId);
      if (person) {
        setLeverageDraft({
          mutualValue: person.mutualValue ?? "",
          asksOffers: person.asksOffers ?? "",
          suggestedNextAction: person.suggestedNextAction ?? "",
          nextActionDate: person.nextActionDate ?? "",
          status: normalizeContactStatus(person.status),
        });
      }
      return contactId;
    });
  };

  const saveLeverage = async (id: string) => {
    if (!leverageDraft.suggestedNextAction.trim() || !leverageDraft.nextActionDate.trim()) {
      setNoteError("Leverage needs a next step and a due date.");
      setEditingContactId(id);
      return;
    }
    await patchContact(
      id,
      {
        mutualValue: leverageDraft.mutualValue,
        asksOffers: leverageDraft.asksOffers,
        suggestedNextAction: leverageDraft.suggestedNextAction,
        nextActionDate: leverageDraft.nextActionDate,
        status: leverageDraft.status,
      },
      `leverage-${id}`,
    );
  };

  const pickNoteImages = async (files: FileList | null) => {
    if (!files?.length) return;
    setNoteError(null);
    try {
      const next = [...pendingNoteImages];
      for (const file of Array.from(files)) {
        if (next.length >= MAX_NOTE_IMAGES) {
          setNoteError(`Up to ${MAX_NOTE_IMAGES} screenshots per note.`);
          break;
        }
        if (!isAcceptedChatImage(file)) {
          setNoteError("Use a JPG, PNG, WebP, or GIF screenshot.");
          continue;
        }
        next.push(await readImageAsDataUrl(file));
      }
      setPendingNoteImages(next);
    } catch (err) {
      setNoteError(err instanceof Error ? err.message : "Could not attach screenshot.");
    }
  };

  const saveContactNotes = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingContactId) return;
    if (!editingNotes.trim() && pendingNoteImages.length === 0) {
      setNoteError("Add some text or a screenshot.");
      return;
    }
    setBusy("contact-notes");
    setNoteError(null);
    try {
      const res = await fetch("/api/growth/contacts/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: editingContactId,
          body: editingNotes,
          images: pendingNoteImages,
        }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        setNoteError(payload?.error ?? "Could not save note.");
        return;
      }
      setEditingNotes("");
      setPendingNoteImages([]);
      invalidate();
    } finally {
      setBusy(null);
    }
  };

  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-slate-500">
        <Loader2 className="animate-spin" size={18} />
        Loading people…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="app-card p-6 text-center text-slate-600">
        Could not load people. Try syncing and refresh.
      </div>
    );
  }

  const reachOutPerson = reachOutId
    ? contacts.find((contact) => contact.id === reachOutId) ?? null
    : null;

  return (
    <div className="flex w-full min-w-0 max-w-full flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="app-display hidden text-2xl tracking-tight text-slate-900 md:block">
            People
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Builder leverage first. Capture stage, what they need, and one next step.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowContactForm((value) => !value)}
          className="app-btn-primary inline-flex min-h-11 shrink-0 items-center gap-1.5 px-4 py-2 text-sm"
        >
          <Plus size={16} />
          {showContactForm ? "Close" : "Add"}
        </button>
      </div>

      {reachOutPerson ? (
        <div className="app-card space-y-3 p-4 ring-2 ring-teal-200/80">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="app-label">Log touch · {reachOutPerson.name}</p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Close the loop: next step + due date (ask/offer optional).
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setReachOutId(null);
                setReachOutError(null);
              }}
              className="min-h-11 min-w-11 rounded-xl text-slate-400"
              aria-label="Close reach-out"
            >
              <X size={18} className="mx-auto" />
            </button>
          </div>
          <textarea
            className="app-input min-h-[64px] w-full resize-y px-3 py-2 text-sm"
            placeholder="What happened? (optional note)"
            value={reachOutDraft.note}
            onChange={(event) =>
              setReachOutDraft((prev) => ({ ...prev, note: event.target.value }))
            }
          />
          <textarea
            className="app-input min-h-[56px] w-full resize-y px-3 py-2 text-sm"
            placeholder="Asks / offers (what they need · what you can give)"
            value={reachOutDraft.asksOffers}
            onChange={(event) =>
              setReachOutDraft((prev) => ({ ...prev, asksOffers: event.target.value }))
            }
          />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              className="app-input w-full px-3 py-2.5 text-sm"
              placeholder="Next step (required)"
              value={reachOutDraft.suggestedNextAction}
              onChange={(event) =>
                setReachOutDraft((prev) => ({
                  ...prev,
                  suggestedNextAction: event.target.value,
                }))
              }
            />
            <input
              type="date"
              className="app-input w-full px-3 py-2.5 text-sm"
              value={reachOutDraft.nextActionDate}
              onChange={(event) =>
                setReachOutDraft((prev) => ({
                  ...prev,
                  nextActionDate: event.target.value,
                }))
              }
            />
          </div>
          {reachOutError ? (
            <p className="text-xs font-medium text-rose-600">{reachOutError}</p>
          ) : null}
          <button
            type="button"
            disabled={busy === `reach-${reachOutPerson.id}`}
            onClick={() => void submitReachOut()}
            className="app-btn-primary min-h-11 w-full px-4 py-2.5 text-sm"
          >
            {busy === `reach-${reachOutPerson.id}` ? "Saving…" : "Save touch + next step"}
          </button>
        </div>
      ) : null}

      {showContactForm ? (
        <form onSubmit={submitContact} className="app-card space-y-3 p-4">
          <p className="app-label">New person</p>
          <input
            required
            className="app-input w-full px-3 py-2.5 text-sm"
            placeholder="Name"
            value={contactForm.name}
            onChange={(event) => setContactForm({ ...contactForm, name: event.target.value })}
          />
          <div className="grid min-w-0 grid-cols-2 gap-2">
            <select
              className="app-input w-full min-w-0 px-3 py-2.5 text-sm capitalize"
              value={contactForm.relationshipType}
              onChange={(event) =>
                setContactForm({ ...contactForm, relationshipType: event.target.value })
              }
              aria-label="Relationship type"
            >
              {CONTACT_TYPE_OPTIONS.map((type) => (
                <option key={type} value={type}>
                  {contactTypeLabel(type)}
                </option>
              ))}
            </select>
            <select
              className="app-input w-full min-w-0 px-3 py-2.5 text-sm"
              value={contactForm.status}
              onChange={(event) => setContactForm({ ...contactForm, status: event.target.value })}
              aria-label="Heat"
            >
              {CONTACT_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {contactStatusLabel(status)}
                </option>
              ))}
            </select>
          </div>
          <input
            type="date"
            className="app-input w-full px-3 py-2.5 text-sm"
            value={contactForm.lastContactDate}
            onChange={(event) =>
              setContactForm({ ...contactForm, lastContactDate: event.target.value })
            }
            aria-label="Last contact"
          />
          <input
            className="app-input w-full px-3 py-2.5 text-sm"
            placeholder="Where they are + how you help (stage, what they need)"
            value={contactForm.mutualValue}
            onChange={(event) =>
              setContactForm({ ...contactForm, mutualValue: event.target.value })
            }
          />
          <input
            className="app-input w-full px-3 py-2.5 text-sm"
            placeholder="Asks / offers — what they need, what you can give"
            value={contactForm.asksOffers}
            onChange={(event) =>
              setContactForm({ ...contactForm, asksOffers: event.target.value })
            }
          />
          <div className="grid min-w-0 grid-cols-2 gap-2">
            <input
              className="app-input w-full min-w-0 px-3 py-2.5 text-sm"
              placeholder="Next step (1 line)"
              value={contactForm.suggestedNextAction}
              onChange={(event) =>
                setContactForm({ ...contactForm, suggestedNextAction: event.target.value })
              }
            />
            <input
              type="date"
              className="app-input w-full min-w-0 px-3 py-2.5 text-sm"
              value={contactForm.nextActionDate}
              onChange={(event) =>
                setContactForm({ ...contactForm, nextActionDate: event.target.value })
              }
              aria-label="Next step date"
            />
          </div>
          <div className="flex min-w-0 items-start gap-2">
            <textarea
              className="app-input min-h-[72px] min-w-0 flex-1 resize-y px-3 py-2 text-sm"
              placeholder="Note — YC batch, product, what they asked you for…"
              value={contactForm.notes}
              onChange={(event) => setContactForm({ ...contactForm, notes: event.target.value })}
            />
            <VoiceToTextButton
              value={contactForm.notes}
              onChange={(notes) => setContactForm((prev) => ({ ...prev, notes }))}
              disabled={busy === "contact"}
              aria-label="Speak contact notes"
            />
          </div>
          <button
            type="submit"
            disabled={busy === "contact"}
            className="app-btn-primary min-h-11 w-full px-3 py-2 text-sm sm:w-auto"
          >
            {busy === "contact" ? "Saving…" : "Save person"}
          </button>
        </form>
      ) : null}

      <div className="space-y-3">
        <WeeklyPeopleSection
          title="Top 10 active"
          hint="Founders, operators/buyers, connectors — heat first"
          people={weeklyLists.top10}
          empty="No active builder contacts yet. Add a founder you just met."
          busy={busy}
          onOpen={toggleContactExpanded}
          onNote={openContactNotes}
          onReachedOut={markReachedOut}
          onSkip={skipFollowUp}
          onRelabel={updateContactType}
        />
        <WeeklyPeopleSection
          title="Follow-ups due"
          hint="next step date is today or overdue"
          people={weeklyLists.followUps}
          empty="Nothing due. Set a next step + date when you meet someone."
          busy={busy}
          onOpen={toggleContactExpanded}
          onNote={openContactNotes}
          onReachedOut={markReachedOut}
          onSkip={skipFollowUp}
          onRelabel={updateContactType}
        />
        <WeeklyPeopleSection
          title="New intros to make"
          hint="3 connector / founder moves"
          people={weeklyLists.intros}
          empty="No intro candidates — log a connector or YC founder."
          busy={busy}
          onOpen={toggleContactExpanded}
          onNote={openContactNotes}
          onReachedOut={markReachedOut}
          onSkip={skipFollowUp}
          onRelabel={updateContactType}
        />
      </div>

      <div className="app-card min-w-0 overflow-hidden p-4">
        <div className="mb-3 flex items-center gap-2">
          <Users size={14} className="shrink-0 text-slate-500" />
          <p className="app-label">Everyone</p>
          <span className="text-[11px] font-semibold text-slate-400">{contacts.length}</span>
        </div>

        {contacts.length === 0 ? (
          <p className="text-sm text-slate-500">
            Add people so follow-ups and relationship compounding have somewhere to live.
          </p>
        ) : (
          <div className="space-y-2.5">
            <div className="relative">
              <Search
                size={14}
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400"
              />
              <input
                type="search"
                value={contactQuery}
                onChange={(event) => setContactQuery(event.target.value)}
                placeholder="Search name, notes, type…"
                className="app-input w-full py-2.5 pr-3 pl-9 text-sm"
                aria-label="Search people"
              />
            </div>
            {contactTypes.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setContactTypeFilter("all")}
                  className={`rounded-full px-2.5 py-1.5 text-[11px] font-semibold ring-1 ${
                    contactTypeFilter === "all"
                      ? "bg-teal-600 text-white ring-teal-600"
                      : "bg-white text-slate-600 ring-slate-200"
                  }`}
                >
                  All ({contacts.length})
                </button>
                {contactTypes.map((type) => {
                  const count = contacts.filter(
                    (contact) => normalizeContactType(contact.relationshipType) === type,
                  ).length;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setContactTypeFilter(type)}
                      className={`rounded-full px-2.5 py-1.5 text-[11px] font-semibold capitalize ring-1 ${
                        contactTypeFilter === type
                          ? "bg-teal-600 text-white ring-teal-600"
                          : "bg-white text-slate-600 ring-slate-200"
                      }`}
                    >
                      {contactTypeLabel(type)} ({count})
                    </button>
                  );
                })}
              </div>
            ) : null}

            {filteredContacts.length === 0 ? (
              <p className="py-2 text-sm text-slate-500">No matches — try another search.</p>
            ) : (
              <ul className="max-h-[32rem] space-y-1.5 overflow-x-hidden overflow-y-auto pr-0.5">
                {filteredContacts.map((contact) => {
                  const entries = contact.noteEntries ?? [];
                  const hasNotes = entries.length > 0 || Boolean(contact.notes?.trim());
                  const expanded = expandedContactId === contact.id;
                  const latest =
                    entries[0]?.body?.trim() ||
                    (contact.notes?.trim() ? firstSentence(contact.notes, 90) : null);
                  const noteCount = entries.length > 0 ? entries.length : hasNotes ? 1 : 0;
                  const typeValue = normalizeContactType(contact.relationshipType);

                  return (
                    <li
                      key={contact.id}
                      className="min-w-0 overflow-hidden rounded-xl text-sm ring-1 ring-slate-100"
                    >
                      <div className="flex flex-col gap-2 p-2.5 sm:flex-row sm:items-start">
                        <button
                          type="button"
                          onClick={() => toggleContactExpanded(contact.id)}
                          className="min-h-11 min-w-0 flex-1 text-left"
                        >
                          <div className="flex items-center gap-1.5">
                            <p className="truncate font-medium text-slate-900">{contact.name}</p>
                            {noteCount > 0 ? (
                              <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                                {noteCount}
                              </span>
                            ) : null}
                          </div>
                          <p className="truncate text-xs text-slate-500">
                            {contactTypeLabel(typeValue)} · {contactStatusLabel(contact.status)}
                            {contact.lastContactDate
                              ? ` · ${formatActivityDate(contact.lastContactDate)}`
                              : ""}
                            {!latest && typeValue === "family"
                              ? " · notes optional"
                              : !latest
                                ? " · no notes yet"
                                : ""}
                          </p>
                          {!expanded && latest ? (
                            <p className="mt-1 line-clamp-1 text-xs text-slate-600">{latest}</p>
                          ) : null}
                        </button>
                        <div className="flex items-center justify-between gap-2 sm:shrink-0 sm:flex-col sm:items-end">
                          <select
                            className="app-input w-full px-2 py-2 text-[11px] font-semibold capitalize sm:w-auto sm:max-w-[7.5rem]"
                            value={typeValue}
                            disabled={busy === `contact-type-${contact.id}`}
                            onChange={(event) =>
                              void updateContactType(contact.id, event.target.value)
                            }
                            aria-label={`Label for ${contact.name}`}
                            onClick={(event) => event.stopPropagation()}
                          >
                            {CONTACT_TYPE_OPTIONS.map((type) => (
                              <option key={type} value={type}>
                                {contactTypeLabel(type)}
                              </option>
                            ))}
                          </select>
                          <div className="flex shrink-0 items-center gap-1">
                            {contact.status === "dormant" ? (
                              <button
                                type="button"
                                disabled={busy !== null}
                                onClick={() => void chaseAgain(contact.id)}
                                className="min-h-11 px-1.5 text-xs font-semibold text-amber-800"
                              >
                                {busy === `chase-${contact.id}` ? "…" : "Follow again"}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() =>
                                editingContactId === contact.id
                                  ? closeContactNotes()
                                  : openContactNotes(contact)
                              }
                              className="min-h-11 px-1.5 text-xs font-semibold text-teal-700"
                            >
                              {editingContactId === contact.id ? "Close" : "Note"}
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleContactExpanded(contact.id)}
                              className="min-h-11 p-2 text-slate-400 hover:text-slate-700"
                              aria-label={expanded ? "Collapse" : "Expand"}
                            >
                              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </button>
                          </div>
                        </div>
                      </div>

                      {expanded ? (
                        <div className="space-y-2 border-t border-slate-100 px-2.5 pt-2 pb-2.5">
                          {isBuilderContactType(typeValue) ? (
                            <div className="space-y-2 rounded-xl bg-slate-50/80 p-2.5">
                              <p className="text-[11px] font-semibold text-slate-500">
                                Leverage card — stage, what they need, your next move
                              </p>
                              <select
                                className="app-input w-full px-2 py-2 text-xs"
                                value={leverageDraft.status}
                                onChange={(event) =>
                                  setLeverageDraft((prev) => ({ ...prev, status: event.target.value }))
                                }
                                aria-label={`Heat for ${contact.name}`}
                              >
                                {CONTACT_STATUS_OPTIONS.map((status) => (
                                  <option key={status} value={status}>
                                    {contactStatusLabel(status)}
                                  </option>
                                ))}
                              </select>
                              <textarea
                                className="app-input min-h-[56px] w-full resize-y px-2 py-2 text-xs"
                                placeholder="Where they are + how you help"
                                value={leverageDraft.mutualValue}
                                onChange={(event) =>
                                  setLeverageDraft((prev) => ({
                                    ...prev,
                                    mutualValue: event.target.value,
                                  }))
                                }
                              />
                              <textarea
                                className="app-input min-h-[56px] w-full resize-y px-2 py-2 text-xs"
                                placeholder="Asks / offers"
                                value={leverageDraft.asksOffers}
                                onChange={(event) =>
                                  setLeverageDraft((prev) => ({
                                    ...prev,
                                    asksOffers: event.target.value,
                                  }))
                                }
                              />
                              <div className="grid grid-cols-2 gap-2">
                                <input
                                  className="app-input w-full px-2 py-2 text-xs"
                                  placeholder="Next step (1 line)"
                                  value={leverageDraft.suggestedNextAction}
                                  onChange={(event) =>
                                    setLeverageDraft((prev) => ({
                                      ...prev,
                                      suggestedNextAction: event.target.value,
                                    }))
                                  }
                                />
                                <input
                                  type="date"
                                  className="app-input w-full px-2 py-2 text-xs"
                                  value={leverageDraft.nextActionDate}
                                  onChange={(event) =>
                                    setLeverageDraft((prev) => ({
                                      ...prev,
                                      nextActionDate: event.target.value,
                                    }))
                                  }
                                />
                              </div>
                              <button
                                type="button"
                                disabled={busy === `leverage-${contact.id}`}
                                onClick={() => void saveLeverage(contact.id)}
                                className="app-btn-primary min-h-11 w-full px-3 py-2 text-xs"
                              >
                                {busy === `leverage-${contact.id}` ? "Saving…" : "Save leverage"}
                              </button>
                            </div>
                          ) : null}
                          {entries.length > 0 ? (
                            <ul className="max-h-40 space-y-2 overflow-x-hidden overflow-y-auto">
                              {entries.map((entry) => {
                                const when = DateTime.fromISO(entry.createdAt).isValid
                                  ? DateTime.fromISO(entry.createdAt)
                                  : DateTime.fromJSDate(new Date(entry.createdAt));
                                return (
                                  <li
                                    key={entry.id}
                                    className="min-w-0 rounded-lg bg-slate-50/80 px-2.5 py-2 ring-1 ring-slate-100"
                                  >
                                    <p className="text-[10px] font-medium tracking-wide text-slate-400 uppercase">
                                      {when.isValid
                                        ? when.toFormat("LLL d, yyyy · h:mm a")
                                        : "Saved note"}
                                    </p>
                                    {entry.body?.trim() ? (
                                      <p className="mt-1 text-xs break-words whitespace-pre-wrap text-slate-700">
                                        {entry.body}
                                      </p>
                                    ) : null}
                                    {entry.images.length > 0 ? (
                                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                                        {entry.images.map((image, imageIndex) => (
                                          // eslint-disable-next-line @next/next/no-img-element
                                          <img
                                            key={`${entry.id}-${imageIndex}`}
                                            src={image}
                                            alt={`Screenshot ${imageIndex + 1}`}
                                            className="h-16 w-16 rounded-md object-cover ring-1 ring-slate-200"
                                          />
                                        ))}
                                      </div>
                                    ) : null}
                                  </li>
                                );
                              })}
                            </ul>
                          ) : contact.notes ? (
                            <p className="text-xs break-words whitespace-pre-wrap text-slate-600">
                              {contact.notes}
                            </p>
                          ) : editingContactId !== contact.id ? (
                            <p className="text-xs text-slate-400">
                              Nothing saved yet — tap Note to add one.
                            </p>
                          ) : null}

                          {editingContactId === contact.id ? (
                            <form onSubmit={saveContactNotes} className="min-w-0 space-y-2">
                              <div className="flex min-w-0 items-start gap-2">
                                <textarea
                                  className="app-input min-h-[80px] min-w-0 flex-1 resize-y px-3 py-2 text-sm"
                                  placeholder="New note — who they are, last chat, what you learned…"
                                  value={editingNotes}
                                  onChange={(event) => setEditingNotes(event.target.value)}
                                  autoFocus
                                />
                                <div className="flex shrink-0 flex-col gap-1.5">
                                  <VoiceToTextButton
                                    value={editingNotes}
                                    onChange={setEditingNotes}
                                    disabled={busy === "contact-notes"}
                                    aria-label={`Speak notes for ${contact.name}`}
                                  />
                                  <label
                                    className={`inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 ${
                                      busy === "contact-notes"
                                        ? "pointer-events-none opacity-50"
                                        : ""
                                    }`}
                                    title="Attach screenshot"
                                  >
                                    <ImagePlus className="h-4 w-4" />
                                    <input
                                      type="file"
                                      accept={MEDIA_IMAGE_ACCEPT}
                                      multiple
                                      className="sr-only"
                                      disabled={busy === "contact-notes"}
                                      onChange={(event) => {
                                        void pickNoteImages(event.target.files);
                                        event.target.value = "";
                                      }}
                                    />
                                  </label>
                                </div>
                              </div>
                              {pendingNoteImages.length > 0 ? (
                                <div className="flex flex-wrap gap-1.5">
                                  {pendingNoteImages.map((image, index) => (
                                    <div key={`pending-${index}`} className="relative">
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img
                                        src={image}
                                        alt={`Pending screenshot ${index + 1}`}
                                        className="h-14 w-14 rounded-md object-cover ring-1 ring-slate-200"
                                      />
                                      <button
                                        type="button"
                                        className="absolute -top-1.5 -right-1.5 rounded-full bg-slate-800 p-0.5 text-white"
                                        onClick={() =>
                                          setPendingNoteImages((prev) =>
                                            prev.filter((_, i) => i !== index),
                                          )
                                        }
                                        aria-label="Remove screenshot"
                                      >
                                        <X className="h-3 w-3" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                              {noteError ? (
                                <p className="text-[11px] text-rose-600">{noteError}</p>
                              ) : null}
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="submit"
                                  disabled={busy === "contact-notes"}
                                  className="app-btn-primary min-h-11 px-3 py-1.5 text-xs"
                                >
                                  {busy === "contact-notes" ? "Saving…" : "Add note"}
                                </button>
                                <p className="text-[11px] text-slate-500">
                                  Each save is dated · text or screenshots
                                </p>
                              </div>
                            </form>
                          ) : null}

                          {contact.suggestedNextAction && editingContactId !== contact.id ? (
                            <p className="text-xs text-teal-700">
                              Next: {contact.suggestedNextAction}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
