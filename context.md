# Product Context

This is a **personal finance tool built for one user** — not a multi-tenant product, not a generic SaaS, and not designed for arbitrary sign-ups or shared accounts.

## Purpose

Help stay on track with **long-term financial goals** while staying financially sharp day to day. Small spending decisions should connect to the bigger picture: micro choices add up to macro outcomes.

The app should:

- Track progress toward goals and plans
- **Celebrate good weeks** — e.g. "You did well this week; it's okay to spend a little extra"
- **Alert** when spending or habits drift off course
- Support occasional out-of-the-ordinary purchases without guilt, when the numbers justify it
- Future-proof money by tying income and goals to the right accounts

## Authentication

Sign-in is **email + 6-digit code** (passcode sent to email), **not** email + password.

- Login flow: enter email → receive code → verify code → session
- After sign-in, the app may require a passcode unlock (`PasscodeLock`) for sensitive financial data
- Do **not** build or assume email/password registration flows unless explicitly requested
- Existing passcode APIs: `/api/auth/passcode/send`, `/api/auth/passcode/verify`

## Accounts & Money Flow

| Account | Role | Income |
|---------|------|--------|
| **Chase** (primary) | Main checking; day-to-day and paycheck hub | Direct-deposit paychecks |
| **Capital One** (secondary) | Goals, plans, side-income bucket | Lyft driving earnings |

When modeling features, allocations, or coach advice:

- Paycheck → Chase
- Lyft / gig income → Capital One
- Goals and plans should be future-proofed against the account that actually holds that money

## Goals & Plans

- User can add **goals** and **plans** to earmark money for specific outcomes
- Lyft income flowing to Capital One supports funding secondary goals without mixing paycheck money
- Features should reinforce long-term progress, not just monthly snapshots

## Tone & Coaching

Coach and UI copy should feel like a sharp personal advisor:

- Direct and encouraging, not preachy
- Acknowledge that occasional splurges are fine when earned
- Connect weekly behavior to long-term goals
- Prefer actionable nudges over generic budgeting advice

## What Not to Assume

- Multi-user auth, admin panels, or "sign up for anyone"
- Email/password as the primary login method
- A single undifferentiated bank account — Chase vs Capital One matters
