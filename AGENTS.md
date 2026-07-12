<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Product context

**Read [context.md](context.md) before building features or changing auth.**

- **Single-user personal finance app** — not multi-tenant or public signup
- **Auth**: email + 6-digit code (passcode), **not** email + password
- **Chase (primary)**: direct-deposit paychecks
- **Capital One (secondary)**: Lyft income; goals/plans bucket
- **Purpose**: long-term financial goals, weekly wins/alerts, micro→macro awareness

Skill: `.cursor/skills/personal-finance-product/SKILL.md`

## Cursor Cloud specific instructions

Stack: Next.js 16 (Turbopack) + Prisma (PostgreSQL) + NextAuth + Plaid/OpenAI/Resend/Pinecone. Standard commands live in `package.json` (`dev`, `build`, `lint`); the update script already runs `npm install` (which runs `prisma generate` via `postinstall`).

**Local Postgres is required.** PostgreSQL 16 is installed but does not auto-start on boot. Start it before running the app or Prisma:
- `sudo pg_ctlcluster 16 main start`
- Dev DB is `finance_dev` (user/pass `postgres`/`postgres`); connection strings are in the gitignored `.env` (`DATABASE_URL`/`DIRECT_URL`).

**Schema is applied with `npx prisma db push`, NOT `prisma migrate deploy`.** The committed migrations under `prisma/migrations/` are incremental only (no baseline that creates the core tables), so `migrate deploy` fails with "relation ... does not exist". Use `prisma db push` to materialize the full schema for local dev. Re-run it if `finance_dev` is empty.

**`.env` placeholders are load-bearing.** These modules construct their client at import time and throw on an empty/missing key, which breaks `next build` (page-data collection) and crashes routes at runtime: `src/lib/openai.ts`, `src/lib/pinecone.ts`, and the `Resend` usages (`src/lib/email.ts`, `src/app/api/**`). `.env` sets placeholder `OPENAI_API_KEY`, `PINECONE_API_KEY`, and `RESEND_API_KEY` so build/dev work without real credentials. `src/lib/env.ts` also requires `PLAID_CLIENT_ID` + `PLAID_TEST_SECRET` (min length 1) or `/api/dashboard` returns 500 — placeholders are set. Swap in real keys to exercise Plaid/AI/email/Pinecone features.

**Auth reality vs product intent:** despite the product docs describing email + 6-digit code as the login, the *current* login (`/login` + `/api/register`) is email + password via NextAuth `CredentialsProvider`. The 6-digit passcode is a **secondary unlock gate** (`PasscodeLock`) shown after login. Sending the passcode requires a working `RESEND_API_KEY`; with the placeholder the email fails, so you cannot pass the lock through the UI. For local dev, bypass it by running `sessionStorage.setItem('app_unlocked','true')` in the browser console and reloading.

The `.husky/pre-push` hook only bumps the version when pushing to `main`; pushes to feature branches skip it. The Playwright config/`e2e/yc-login.spec.ts` target an external site (YC), unrelated to this app's dev setup.
