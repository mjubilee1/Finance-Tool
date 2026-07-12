# Product Context

This is a **personal life OS with a CFO core, built for one user (Trell)** — not a multi-tenant product, not a generic SaaS, and not designed for arbitrary sign-ups or shared accounts.

## Purpose

Trell's **default daily app**: open every day, log constantly, get sharper coaching over time.

Help stay on track with **long-term goals** (money + career + body + network) while staying sharp day to day. Small choices should connect to the bigger picture: micro logging compounds into macro outcomes.

The app should:
- Be the place Trell **opens every day** and **constantly logs into** (activities, contacts, spends, screenshots, wins)
- Track progress toward goals and plans across life domains
- **Celebrate good weeks** — e.g. "You did well this week; it's okay to spend a little extra"
- **Alert** when spending or habits drift off course (including thin network / ignored follow-ups)
- Support occasional out-of-the-ordinary purchases without guilt, when the numbers justify it
- Default variable spend ~**$25/day** most days; allow human blowout days (bars, dating, clothes) and judge the **week** for compounding vs waste
- Future-proof money by tying income and goals to the right accounts
- Call out low-leverage traps plainly: e.g. "You don't need 6 hours of Lyft for ~$100 — protect a networking / promotion block too"

### Daily loop (logging flywheel)

1. **Open Today Planner** — what to protect today (body, leverage, joy, optional Lyft)
2. **Log as life happens** — gym, outreach, Lyft, spend, contact notes, screenshots
3. **Let the system remember** — Prisma memories / profile / activities feed tomorrow's plan
4. **Weekly Review** — what compounded, what to stop, what to do more (network, cash, body, career)

The more Trell logs, the sharper the coach gets. Empty weeks produce generic advice; dense logs produce "stop ignoring network follow-ups" and real Lyft-vs-leverage tradeoffs.

## Planning Philosophy

The daily and weekly planning experience should be inspired by *The 7 Habits of Highly Effective People* by Stephen R. Covey, especially "put first things first" and "begin with the end in mind."

- Keep the main thing the main thing: protect the highest-leverage block before reacting to cash gaps, distractions, or low-value urgency.
- Do the hard, important thing first when possible, then let lower-leverage tasks trickle down around it.
- Today is the center of gravity because life happens daily; weekly review gives meaning, accountability, and permission without replacing the daily focus.
- Treat body, career leverage, financial stability, and intentional joy as compounding inputs rather than isolated checklist items.

### Today Planner must respect the real schedule

The planner is only useful if today's blocks fit the day shape — never suggest a weekend-sized outing on an office day.

| Day shape | When | What fits |
|-----------|------|-----------|
| **Office** | Mon–Wed | Early Lyft (~2hr) + commute + ~9–5 desk. Mid-day = async/desk only. Joy = short evening-sized, not 2–4 hr trips. Extra Lyft = evening if fee math needs it. |
| **WFH** | Thu–Fri | Full job day with more flexibility. Better for deep leverage / calls. Joy stays capped (not a day trip). |
| **Weekend** | Sat–Sun | Open for longer intentional joy, longer leverage, recovery, and Lyft. |

Rules:
- `joyOptions` are a **preference menu**, not today's assignment. Never auto-label a block "Joy: [first option]" just because it is listed.
- Name *when* a block fits (desk at lunch, evening after office, Thu deep block, Sat morning).
- Weekend can hold a longer intentional joy block; weekdays shrink joy to what the calendar can actually hold.

## Life + money (not finance-only)

This product is becoming a **personal life OS with a CFO core** — money, career, body, relationships, and intentional joy reinforce each other.

- **Financial goals** (house, trips, debt) stay money-tracked against checking / Capital One.
- **Life goals** (promotion, gym/weight, startup leverage, network) are first-class too — tracked via growth profile, activities, and memories, not only dollar targets.
- Agent advice should mix domains: a promotion block can beat an extra Lyft hour; a gym block protects tomorrow's work energy; cash decisions still protect the floor.
- Weekly review judges whether the *week* compounded across life + money, not only whether spending was low.

### Screenshots as fast life updates

Screenshots are a preferred way to catch the system up quickly (gym schedule, calendar, bank alerts, receipts, workout plans, goal boards).

Flow:
1. User uploads a screenshot in chat (or attaches to a contact/note).
2. Agent **reads** it (vision).
3. Durable facts get **stored in Prisma** as memories / profile fields (not left as one-off chat).
4. Today Planner and coach use that stored context next time.

Examples to extract and remember: gym days/times, promotion deadline, weight targets, travel dates, fee amounts, schedule changes.

## Home base: Oxon Hill / DMV

Home is **Oxon Hill, Prince George's County, Maryland** — DMV area (DC / Maryland / Virginia).

When suggesting breaks, intentional joy, dating/social spots, errands, or recovery after logging hard blocks:
- Prefer **local / nearby** options first (Oxon Hill, National Harbor, PG County, easy DC hops).
- Longer outings (Downtown DC, Baltimore day trip) are weekend-sized unless the day shape clearly allows it.
- After gym, leverage, or a solid work stretch, it is valid to **take a break and enjoy leisure** nearby — rest is part of compounding, not a leak, when it is chosen and capped.
- Do not invent far-away or random city plans; stay grounded in the DMV life the user actually lives.

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
| **Capital One** (secondary) | Goals, plans, side-income bucket | Lyft driving earnings (after weekly Hertz/Lyft program fee) |

When modeling features, allocations, or coach advice:

- Paycheck → Chase
- Lyft / gig income → Capital One
- Lyft has a **weekly program/rental fee** that must be covered before the week is profitable
- Goals and plans should be future-proofed against the account that actually holds that money
- Daily tradeoff often: drive Lyft today vs higher-leverage career/build/network work
- Typical schedule: Mon–Wed office (early Lyft ~2hr then commute; desk-only mid-day), Thu–Fri WFH (better for deep work / in-person)

## Goals & Plans

- User can add **financial goals** and **plans** to earmark money for specific outcomes (checking coverage, Capital One bucket)
- Lyft income flowing to Capital One supports funding secondary goals without mixing paycheck money
- **Life/career goals** (promotion, fitness, startup, network) live alongside money goals — same compounding system, different units ($, hours, body metrics, relationships)
- Features should reinforce long-term progress across domains, not just monthly money snapshots

## Tone & Coaching

Coach and UI copy should feel like a sharp personal advisor:

- Direct and encouraging, not preachy
- Acknowledge that occasional splurges are fine when earned
- Connect weekly behavior to long-term goals
- Prefer actionable nudges over generic budgeting advice

## Money as a reinforcing system

The CFO should treat money as a **tool being hardened and assembled** — not just a number to minimize.

- Do not stop at "you could save $X." Explain what that savings **does** for the whole system and where freed cash should flow next.
- Assess decisions by impact on: cash buffer, debt velocity, tenant stability, credit access, real estate readiness, and income engines (W2, rental, Lyft, startup).
- Prefer recommendations that create positive feedback loops: less leakage → more debt paydown → lower utilization → better credit → more optionality.
- When goals compete, say which choice hardens the floor vs which bets on upside without a stable base.

## What Not to Assume

- Multi-user auth, admin panels, or "sign up for anyone"
- Email/password as the primary login method
- A single undifferentiated bank account — Chase vs Capital One matters
