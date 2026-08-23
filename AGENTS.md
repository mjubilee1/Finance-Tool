<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Product context

**Read [context.md](context.md) before building features or changing auth.**

- **Single-user personal finance app** — not multi-tenant or public signup
- **Auth**: email + 6-digit code (passcode), **not** email + password
- **Chase (primary)**: direct-deposit paychecks
- **Capital One (secondary)**: car payment + insurance; goals/plans bucket
- **Purpose**: long-term financial goals, weekly wins/alerts, micro→macro awareness
- **Device**: phone / mobile browser ~95% of the time — mobile-first UI. Settings is an overlay, not a tab. See `.cursor/rules/mobile-first.mdc`.

Skill: `.cursor/skills/personal-finance-product/SKILL.md`

## Version bump + push (local and Cloud Agents)

When asked to push / ship / release, **ask Trell: patch, minor, or major?** unless he already said which. Then run `pnpm push:patch`, `pnpm push:minor`, or `pnpm push:major`. Do not use the hanging interactive git version prompt. See `.cursor/rules/version-push.mdc`.

## Founder (OnLocalAI)

Trell is founder of OnLocalAI (employee onboarding). For daily/weekly startup plans, outreach, discovery, evidence, and build-vs-sell decisions, read **`.cursor/skills/onlocalai-founder-os/SKILL.md`**. Customer discovery outranks speculative product work; code freeze rules apply.
