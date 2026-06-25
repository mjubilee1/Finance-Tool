---
name: personal-finance-product
description: >-
  Guides development of this personal finance tracker for a single user. Covers
  email+code auth (not password), Chase/Capital One account model, goals/plans,
  and coaching tone. Use when building features, auth, dashboard, AI coach,
  goals, alerts, spending feedback, or any product behavior in this repo.
---

# Personal Finance Product

## Read first

Full context: [context.md](../../context.md)

## Product intent

Single-user app to improve **long-term financial goals**. Connect daily spending to the bigger picture. Good weeks deserve recognition; drift deserves alerts.

## Auth (critical)

| Correct | Wrong |
|---------|-------|
| Email → send 6-digit code → verify → session | Email + password login |
| `PasscodeLock` after session for sensitive data | Generic signup / multi-user auth |

Relevant code: `src/components/passcode-lock.tsx`, `/api/auth/passcode/*`

When touching login UI or auth, match email+code patterns. Never default to password fields.

## Money model

```
Paycheck (direct deposit)  →  Chase (primary)
Lyft driving income        →  Capital One (secondary)
Goals / plans              →  tied to Capital One bucket
```

Feature and coach logic should respect which account holds which income.

## Coaching & UX tone

- Encourage: "You had a strong week — room for a small treat"
- Alert: spending or habits moving away from goals
- Sharp but supportive; splurges are fine when earned
- Micro spending patterns → macro goal impact

## Goals & plans

- User adds goals/plans to future-proof earmarked money
- Side income (Lyft) funds secondary-account goals
- Prefer progress toward long-term outcomes over generic monthly totals

## Build checklist

When adding a feature, ask:

1. Does this assume multi-user or password auth? → Fix scope
2. Does income/account routing match Chase vs Capital One?
3. Does copy coach toward long-term goals, not just budgets?
4. Does it celebrate wins or warn on drift when appropriate?
