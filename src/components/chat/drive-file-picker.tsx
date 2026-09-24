"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Loader2, Search, X } from "lucide-react";

export type DriveAttachment = {
  id: string;
  name: string;
  mimeType: string;
};

type DriveStatusResponse = {
  connected: boolean;
  connectAvailable: boolean;
  status: "active" | "needs_reconnect" | "not_connected";
  files?: DriveAttachment[];
  error?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  selected: DriveAttachment[];
  onToggle: (file: DriveAttachment) => void;
  maxFiles: number;
};

function readableMime(mimeType: string) {
  if (mimeType.includes("document")) return "Doc";
  if (mimeType.includes("spreadsheet")) return "Sheet";
  if (mimeType.includes("presentation")) return "Slides";
  if (mimeType.startsWith("text/")) return "Text";
  if (mimeType.includes("pdf")) return "PDF";
  return "File";
}

export function DriveFilePicker({ open, onClose, selected, onToggle, maxFiles }: Props) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query, open]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setDebouncedQuery("");
    }
  }, [open]);

  const driveQuery = useQuery({
    queryKey: ["google-drive-picker", debouncedQuery],
    enabled: open,
    queryFn: async () => {
      const params = debouncedQuery
        ? `?q=${encodeURIComponent(debouncedQuery)}`
        : "";
      const res = await fetch(`/api/integrations/google-drive${params}`);
      if (!res.ok) throw new Error("Could not load Drive files");
      return res.json() as Promise<DriveStatusResponse>;
    },
  });

  if (!open) return null;

  const selectedIds = new Set(selected.map((file) => file.id));
  const files = driveQuery.data?.files ?? [];
  const connected = driveQuery.data?.status === "active";
  const atLimit = selected.length >= maxFiles;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close Drive picker"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Attach from Google Drive"
        className="relative z-10 flex max-h-[80dvh] w-full max-w-lg flex-col rounded-t-2xl bg-[var(--card-solid)] shadow-xl ring-1 ring-[var(--card-border)] sm:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--card-border)] px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-[var(--ink)]">Google Drive</p>
            <p className="text-xs text-[var(--muted)]">
              Pick up to {maxFiles} file{maxFiles === 1 ? "" : "s"} for this message
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-[var(--muted)] hover:bg-[var(--accent-soft)]"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {!driveQuery.isLoading && !connected ? (
          <div className="space-y-3 px-4 py-6">
            <p className="text-sm text-[var(--ink-soft)]">
              {driveQuery.data?.status === "needs_reconnect"
                ? "Google Drive needs to be reconnected in Settings."
                : "Connect Google Drive in Settings first."}
            </p>
            <a
              href="/api/integrations/google-drive/connect"
              className="app-btn-primary inline-flex rounded-full px-4 py-2 text-xs"
            >
              {driveQuery.data?.status === "needs_reconnect" ? "Reconnect Drive" : "Connect Drive"}
            </a>
          </div>
        ) : (
          <>
            <div className="border-b border-[var(--card-border)] px-4 py-2.5">
              <label className="flex items-center gap-2 rounded-xl bg-[color-mix(in_srgb,var(--ink)_5%,transparent)] px-3 py-2 ring-1 ring-[var(--card-border)]">
                <Search size={16} className="shrink-0 text-[var(--muted)]" />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search Drive…"
                  className="min-w-0 flex-1 bg-transparent text-sm text-[var(--ink)] placeholder:text-[var(--muted)] focus:outline-none"
                  autoFocus
                />
              </label>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
              {driveQuery.isLoading || driveQuery.isFetching ? (
                <p className="flex items-center gap-2 px-3 py-6 text-sm text-[var(--muted)]">
                  <Loader2 size={14} className="animate-spin" />
                  Loading files…
                </p>
              ) : driveQuery.data?.error ? (
                <p className="px-3 py-6 text-sm text-rose-600 dark:text-rose-300">
                  {driveQuery.data.error}
                </p>
              ) : files.length === 0 ? (
                <p className="px-3 py-6 text-sm text-[var(--muted)]">
                  {debouncedQuery ? "No files matched that search." : "No recent files found."}
                </p>
              ) : (
                <ul className="space-y-1">
                  {files.map((file) => {
                    const isSelected = selectedIds.has(file.id);
                    const disabled = !isSelected && atLimit;
                    return (
                      <li key={file.id}>
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => onToggle(file)}
                          className={`flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition disabled:opacity-40 ${
                            isSelected
                              ? "bg-[var(--accent-soft)] ring-1 ring-[var(--accent-strong)]/40"
                              : "hover:bg-[color-mix(in_srgb,var(--ink)_5%,transparent)]"
                          }`}
                        >
                          <FileText
                            size={18}
                            className="mt-0.5 shrink-0 text-[var(--accent-strong)]"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-[var(--ink)]">
                              {file.name}
                            </span>
                            <span className="text-xs text-[var(--muted)]">
                              {readableMime(file.mimeType)}
                              {isSelected ? " · selected" : ""}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="border-t border-[var(--card-border)] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={onClose}
                className="app-btn-primary w-full rounded-xl px-4 py-3 text-sm"
              >
                Done{selected.length > 0 ? ` (${selected.length})` : ""}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
