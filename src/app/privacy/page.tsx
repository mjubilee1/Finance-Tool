import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — Life OS",
  description: "How Life OS uses Google Calendar and other personal data",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto min-h-[100dvh] max-w-2xl px-6 py-12">
      <p className="app-label text-[var(--accent-strong)] mb-2">Life OS</p>
      <h1 className="app-display text-3xl text-[var(--ink)] mb-2">Privacy Policy</h1>
      <p className="text-sm text-[var(--muted)] mb-8">Last updated August 24, 2026</p>

      <div className="space-y-6 text-sm leading-relaxed text-[var(--ink-soft)]">
        <p>
          Life OS is a personal life and money app built for one user. It is not a public
          product and does not sell, rent, or share personal data with advertisers.
        </p>

        <section>
          <h2 className="text-base font-semibold text-[var(--ink)] mb-2">Google Calendar</h2>
          <p>
            If you connect Google Calendar, Life OS requests permission to view and manage
            events on your primary calendar. That access is used only to show upcoming events
            in the app and to create, update, or delete events when you ask the coach to do so.
          </p>
          <p className="mt-2">
            Google access tokens are stored encrypted on the server. Life OS does not use
            Calendar data for ads, training public models, or third-party marketing.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-[var(--ink)] mb-2">Other data</h2>
          <p>
            The app also stores account, transaction, goals, and coaching data you enter or
            sync (for example via Plaid). That data stays in your private database for running
            the app.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-[var(--ink)] mb-2">Disconnecting</h2>
          <p>
            You can disconnect Google Calendar in the app at any time. You can also revoke
            access in your{" "}
            <a
              className="text-[var(--accent-strong)] underline"
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noreferrer"
            >
              Google Account permissions
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-[var(--ink)] mb-2">Contact</h2>
          <p>
            Questions:{" "}
            <a className="text-[var(--accent-strong)] underline" href="mailto:mjubil96@gmail.com">
              mjubil96@gmail.com
            </a>
          </p>
        </section>
      </div>

      <p className="mt-10 text-sm">
        <Link href="/login" className="text-[var(--accent-strong)] underline">
          Back to sign in
        </Link>
      </p>
    </main>
  );
}
