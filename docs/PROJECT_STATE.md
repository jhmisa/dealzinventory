# Project State — Dealz

> Single source of truth for current work. **Read this first. Update before/with every commit.**
> Map of the codebase: [SYSTEM_MAP.md](./SYSTEM_MAP.md) · Deep reference: [PRD.md](./PRD.md), [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md), [PAGE_COMPONENT_MAP.md](./PAGE_COMPONENT_MAP.md)

## Operating Context (Claude's capabilities)
- **Supabase: full access via CLI AND MCP.** Apply migrations automatically via CLI — never ask, never say "no access."
- **Deploy:** `push-to-main` skill bumps version, commits, pushes → Vercel auto-deploys.
- **Versioning:** bump `package.json` once per working session (semver).
- (Canonical copy lives in CLAUDE.md "Operating Context (read first)".)

## Now  (active work)
- **▶ IN PROGRESS: Build the Backorder / pre-order supplier inventory feature (B-codes).** Design + 17-task impl plan are LOCKED and committed. **Tasks 1, 5, 6, 7, 7b DONE** (Task 1: DB tables/seq/bucket; Task 5: iosys adapter + types; Task 6: adapter registry; Task 7: fetch-supplier-product edge fn; Task 7b: pluggable web image-search provider — all deployed, smoke tested). **Next: Task 2** (order_items changes). Recommended: superpowers:subagent-driven-development (fresh subagent per task, review between). Plan: docs/superpowers/plans/2026-06-27-backorder-supplier-inventory.md · Spec: docs/superpowers/specs/2026-06-27-backorder-supplier-inventory-design.md.
- Sub-intent autonomy — interactive E2E test + Plan 2 admin UI (per-intent OFF/DRAFT/SEND). Backend shipped v1.52.0 (merged main). Plan/spec: docs/superpowers/specs/2026-06-26-sub-intent-autonomy-design.md
- Project command center (this system) — being set up.

## Recently shipped  (newest first; archive to CHANGELOG.md when >~15)
- 2026-06-27 · Backorder Task 7b: optional pluggable web image-search provider (ImageSearchProvider interface + Google CSE impl; degrades to {configured:false,images:[]} with no env key) · DEPLOYED · smoke: no-key→configured:false, missing-query→400 · touched: supabase/functions/_shared/image-search/{types,provider}.ts, supabase/functions/search-product-images/index.ts
- 2026-06-27 · Backorder Task 7: fetch-supplier-product edge fn (resolveAdapter→fetch→parse→normalized product JSON; browser UA; 400/422/502/500 handling) · DEPLOYED · live smoke: iosys 384323 returns full product (Apple iPhone15 Plus, ¥104800, stock 272, grade S); unknown host → 422 · touched: supabase/functions/fetch-supplier-product/index.ts
- 2026-06-27 · Backorder Task 6: supplier adapter registry (resolveAdapter by host, TDD — 2 tests pass) · touched: supabase/functions/_shared/supplier-adapters/registry.ts, registry.test.ts
- 2026-06-27 · Backorder Task 1: backorder_lines (+ generated available col) + backorder_line_media tables, b_code_seq, backorder-media storage bucket · applied to remote, generate_code('B','b_code_seq')→B000001 verified · NOTE: spec's photo_group_id FK omitted (live schema dropped photo_groups; photos now via product_media / backorder_line_media) · touched: supabase/migrations/20260627120000_backorder_lines.sql
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
