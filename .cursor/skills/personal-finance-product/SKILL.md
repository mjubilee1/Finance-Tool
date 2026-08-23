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
Car payment + insurance    →  Capital One (secondary)
Goals / plans / fun        →  Capital One after car obligations
```

Feature and coach logic should respect which account holds which money.

## Car (owned financed vehicle)

- Cap One floor: payment ~$513/mo + insurance ~$352/mo (editable dues in Car tab)
- Loan: ~$26,436 financed, 3.5-year (42-mo) payoff; ~$800/mo payoff target when cash allows
- Odometer + maintenance logs live on Car tab — keep the asset healthy/neat through payoff
- Docs: retail installment, GAP, VSC in Car → Documents

## Home (Oxon Hill house-hack)

- Mortgage ~$2,659/mo with editable next due (Home tab) — protect first
- Tenants/rooms with expected rent; log actual rent received (amount + payment date)
- Maintenance / issues log for repairs (open → resolved)
- Coach should prefer Home tab rent logs over guessed tenant income when judging cash safety

## Coaching & UX tone

- Offensive go-getter mindset: impact and leverage first, not "save your $40" lectures
- ~$40/day is tracker background math; mention when asked, cash is tight, or the week is leaking without upside
- Encourage: strong weeks unlock earned joy; short rest/reset is allowed, then back on attack
- Alert: spend/time that drifts with no upside; celebrate moves that compound
- Sharp, hungry, supportive — think hungry broke 25-year-old with a CFO brain
- Micro choices → macro system impact (what it protects, frees, unlocks)

## Founder mode (OnLocalAI)

When planning startup / outreach / build decisions for OnLocalAI, follow **`.cursor/skills/onlocalai-founder-os/SKILL.md`**. Customer evidence and pilot progress beat feature building. Protect W2 + cash floor while coaching founder leverage.

## Goals & plans

- User adds goals/plans to future-proof earmarked money
- Capital One surplus after car payment + insurance can fund secondary goals
- Prefer progress toward long-term outcomes over generic monthly totals

## Device (critical)

Trell uses this on his **phone ~95% of the time** (mobile browser). Design and verify ~390px first. Desktop is the exception.

- One job per screen; do not stack today's agenda with money charts on the same mobile scroll
- Bottom nav: four primary tabs + More. **Settings is an overlay**, not a tab
- Touch targets, no hover-only, content clears the tab bar
- Details: `.cursor/rules/mobile-first.mdc`

## Build checklist

When adding a feature, ask:

1. Does this assume multi-user or password auth? → Fix scope
2. Does income/account routing match Chase vs Capital One (including car bills)?
3. Does copy coach toward long-term goals, not just budgets?
4. Does it celebrate wins or warn on drift when appropriate?
5. Does this work as the first (and usually only) viewport on a phone?

## Version bump + push

When Trell asks to push or ship (local or Cloud Agent): ask **patch, minor, or major** unless he already said which, then run `pnpm push:patch` / `pnpm push:minor` / `pnpm push:major`. Do not use the interactive git hook prompt. Details: `.cursor/rules/version-push.mdc`.
