# Project State — Dealz

> Single source of truth for current work. **Read this first. Update before/with every commit.**
> Map of the codebase: [SYSTEM_MAP.md](./SYSTEM_MAP.md) · Deep reference: [PRD.md](./PRD.md), [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md), [PAGE_COMPONENT_MAP.md](./PAGE_COMPONENT_MAP.md)

## Operating Context (Claude's capabilities)
- **Supabase: full access via CLI AND MCP.** Apply migrations automatically via CLI — never ask, never say "no access."
- **Deploy:** `push-to-main` skill bumps version, commits, pushes → Vercel auto-deploys.
- **Versioning:** bump `package.json` once per working session (semver).
- (Canonical copy lives in CLAUDE.md "Operating Context (read first)".)

## Now  (active work)
- **▶ IN PROGRESS: Build the Backorder / pre-order supplier inventory feature (B-codes).** Design + 17-task impl plan LOCKED. **Tasks 1–7b DONE** (1: DB tables/seq/bucket; 2: order_items linkage+CHECK; 3: search_available_backorder_lines RPC; 4: backorder result mapper in inventory-search; 5: iosys adapter; 6: adapter registry; 7: fetch-supplier-product edge fn; 7b: web image-search provider — all applied/deployed + smoke-tested). **Next: Task 11** (route + sidebar entry), then 12–15 (admin UI), 16 (AI offer badge), 17 (docs+deploy). Executing via superpowers:subagent-driven-development (fresh subagent per task). KEY FINDINGS: (1) live schema has NO photo_groups table (dropped photo_group_id everywhere; photos via backorder_line_media). (2) items.item_status enum has RESERVED/SOLD (doc stale); ordered items → RESERVED. (3) items.storage_gb is messy TEXT ('128GB','1TB') vs backorder_lines.storage_gb integer — server RPC normalizes via _backorder_norm_storage_gb helper; client verifier must mirror it (folded into Task 10). Plan: docs/superpowers/plans/2026-06-27-backorder-supplier-inventory.md · Spec: docs/superpowers/specs/2026-06-27-backorder-supplier-inventory-design.md.
- Sub-intent autonomy — interactive E2E test + Plan 2 admin UI (per-intent OFF/DRAFT/SEND). Backend shipped v1.52.0 (merged main). Plan/spec: docs/superpowers/specs/2026-06-26-sub-intent-autonomy-design.md
- Project command center (this system) — being set up.

## Recently shipped  (newest first; archive to CHANGELOG.md when >~15)
- 2026-06-27 · Backorder Task 10: backorders service (15 fns) + reserve_backorder_unit RPC + regen types · ALSO fixed pre-existing types.ts corruption (banner text from a05aab3's `gen types > types.ts`; restored alias layer + added backorder aliases) + normalizeStorageGb in utils.ts & _shared verifier (6 deno tests) · build passes · touched: src/services/backorders.ts, src/lib/{types,database.types,utils}.ts, supabase/functions/_shared/backorder-match.ts(+test), supabase/migrations/20260627120400_reserve_backorder.sql
- 2026-06-27 · Backorder Task 9: transactional swap + mark-ordered RPCs (fulfill_backorder_with_item: eligibility + core-spec hard-block → item RESERVED + line.quantity_received++; mark_backorder_ordered) · applied + live seed test (hard-block fires, happy path works w/ text '128GB' vs int 128 via IMMUTABLE _backorder_norm_storage_gb helper) · touched: supabase/migrations/20260627120300_backorder_fulfillment_rpcs.sql
- 2026-06-27 · Backorder Task 8: core-spec match verifier verifyPCodeMatch (pure, TDD 3 tests; CORE_FIELDS product_id/storage_gb/color/condition_grade aligned w/ Task 9 RPC; color case/space-insensitive) · touched: supabase/functions/_shared/backorder-match.ts(+test)
- 2026-06-27 · Backorder Task 7c: save-backorder-photos edge fn (server-side copy of kept iosys/web photos → backorder-media bucket + backorder_line_media rows; skips 404s, never fails batch) · DEPLOYED · smoke: real upload+public URL serves bytes, skip verified, temp data cleaned · touched: supabase/functions/save-backorder-photos/index.ts
- 2026-06-27 · Backorder Task 7b: optional pluggable web image-search provider (ImageSearchProvider interface + Google CSE impl; degrades to {configured:false,images:[]} with no env key) · DEPLOYED · smoke: no-key→configured:false, missing-query→400 · touched: supabase/functions/_shared/image-search/{types,provider}.ts, supabase/functions/search-product-images/index.ts
- 2026-06-27 · Backorder Task 7: fetch-supplier-product edge fn (resolveAdapter→fetch→parse→normalized product JSON; browser UA; 400/422/502/500 handling) · DEPLOYED · live smoke: iosys 384323 returns full product (Apple iPhone15 Plus, ¥104800, stock 272, grade S); unknown host → 422 · touched: supabase/functions/fetch-supplier-product/index.ts
- 2026-06-27 · Backorder Task 6: supplier adapter registry (resolveAdapter by host, TDD — 2 tests pass) · touched: supabase/functions/_shared/supplier-adapters/registry.ts, registry.test.ts
- 2026-06-27 · Backorder Task 5: iosys adapter → NormalizedSupplierProduct (JSON-LD + DOM parse, rank→grade, gallery; TDD 4 tests; real fixture iosys-384323.html) · touched: supabase/functions/_shared/supplier-adapters/{types,iosys}.ts(+test,fixture)
- 2026-06-27 · Backorder Task 4: backorder result type in shared inventory-search (mapBackorderRow mirrors sell-group mapping; 3rd RPC in parallel; B-code exact-match branch; 6 tests) · touched: supabase/functions/_shared/inventory-search.ts(+test)
- 2026-06-27 · Backorder Task 3: search_available_backorder_lines RPC (mirrors sell-groups return shape for drop-in mapper) · touched: supabase/migrations/20260627120200_search_backorder_lines.sql
- 2026-06-27 · Backorder Task 2: order_items backorder linkage (backorder_line_id, backorder_status enum, item_id nullable, CHECK permitting existing ad-hoc lines) · applied to remote (1770 rows, 0 violations) · touched: supabase/migrations/20260627120100_order_items_backorder.sql
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
