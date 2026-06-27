# Project State — Dealz

> Single source of truth for current work. **Read this first. Update before/with every commit.**
> Map of the codebase: [SYSTEM_MAP.md](./SYSTEM_MAP.md) · Deep reference: [PRD.md](./PRD.md), [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md), [PAGE_COMPONENT_MAP.md](./PAGE_COMPONENT_MAP.md)

## Operating Context (Claude's capabilities)
- **Supabase: full access via CLI AND MCP.** Apply migrations automatically via CLI — never ask, never say "no access."
- **Deploy:** `push-to-main` skill bumps version, commits, pushes → Vercel auto-deploys.
- **Versioning:** bump `package.json` once per working session (semver).
- (Canonical copy lives in CLAUDE.md "Operating Context (read first)".)

## Now  (active work)
- **▶ NEXT: Build the Backorder / pre-order supplier inventory feature (B-codes).** Design + 17-task impl plan are LOCKED and committed. Start at Phase 1, Task 1. Recommended: superpowers:subagent-driven-development (fresh subagent per task, review between). Plan: docs/superpowers/plans/2026-06-27-backorder-supplier-inventory.md · Spec: docs/superpowers/specs/2026-06-27-backorder-supplier-inventory-design.md. One open non-blocking decision: which web image-search provider/key for the optional "Search web for more" photo button (iosys-gallery path needs no key).
- Sub-intent autonomy — interactive E2E test + Plan 2 admin UI (per-intent OFF/DRAFT/SEND). Backend shipped v1.52.0 (merged main). Plan/spec: docs/superpowers/specs/2026-06-26-sub-intent-autonomy-design.md
- Project command center (this system) — being set up.

## Recently shipped  (newest first; archive to CHANGELOG.md when >~15)
- 2026-06-27 · Fix: strip Markdown from outbound AI replies (Messenger renders plaintext) — normalizeOutboundText at generate-draft + send-via-missive · touched: supabase/functions/_shared/normalize-markdown.ts(+test), generate-draft.ts, send-via-missive.ts · DEPLOYED (send-message, generate-pending-drafts, test-ai-reply)
- 2026-06-27 · Project command center: state hub + system map + enforcement hooks · touched: docs/, .claude/, CLAUDE.md
- 2026-06-26 · Sub-intent autonomy engine (backend): classify→autonomy pipeline OFF/DRAFT/SEND · v1.52.0 · touched: supabase/functions (generate-draft, send-message, _shared), messaging tables
- 2026-06-26 · Fix AI draft cron: ambiguous ai_enabled + missing edge-fn credentials · touched: messaging cron / edge fns
- 2026-06-19 · Rich sell-group AI offers (spec line like items) · v1.51.0 · touched: messaging.ts, sell-groups.ts, offers RPC
- 2026-06-18 · AI emoji offer format ({{OFFER:CODE}} token, code-assembled block) · v1.50.0 · touched: messaging AI
- 2026-06-17 · Sales Specialist v2 (qualify-then-handoff + in-process search_inventory) · v1.48.0
- 2026-06-17 · Messages AI redesign Plans 1-3 + 3b (specialist playbooks) · v1.47.0

## Deferred / known issues
- List-query 1000-row cap: admin lists fetch whole tables, hit PostgREST 1000-row cap. Mitigated v1.46.1. · ref: docs/investigations/list-query-1000-row-cap.md
- AI provider config split: two provider tables/UIs (ai_configurations vs ai_providers); consolidation idea pending.

## Links
- [System map](./SYSTEM_MAP.md) · [Specs](./superpowers/specs/) · [Plans](./superpowers/plans/) · [Investigations](./investigations/) · [Runbooks](./runbooks/)
