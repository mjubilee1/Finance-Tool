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
