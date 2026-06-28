# GOAL — Sweep the full iosys catalog (all kaitori-relevant categories) for accurate Kaitori

> Status: GOAL captured 2026-06-28 (Joey). Owner: Joey. **This is the master roadmap for completing
> the `product_models` catalog so Kaitori auto-quotes can be wired to accurate SKUs.**
> Builds on the shipped iPhone/iPad accuracy work + the Galaxy/Android pipeline (v1.65.0) and the
> identifier-display list (v1.64.0). Read this first after a /clear, then pick the next phase.

## Why (business driver)
Dealz buys devices back from individuals (**Kaitori**). Accurate auto-quotes require a **complete,
SKU-accurate `product_models` catalog** for every device type we'll buy back. iPhone, iPad, and
Samsung Galaxy phones are done; this goal extends the same discipline across the rest of the iosys
lineup. Catalog completeness is the prerequisite; the culminating phase wires `kaitori_price_list`
(currently EMPTY) to the finished SKUs. Principle ([[project_kaitori_catalog_completeness]]):
catalog = the COMPLETE iosys lineup of sellable models, **not** just current stock; cheap imports
iosys won't buy (Blackview/Realme/Alldocube/Tabwee/UMIDIGI/etc.) stay OUT.

## Operating rules (carry every session)
- **Supabase = CLI only, never MCP** ([[feedback_supabase_cli_not_mcp]]): `supabase db query --linked "<sql>"`,
  `supabase migration up --linked`, `supabase db query --linked -f <file>`.
- **Verify in-browser with my own eyes** ([[reference_dev_staff_login]]): dev staff login creds in
  `.env.local` (`DEV_STAFF_EMAIL`/`DEV_STAFF_PASSWORD`); `npm run dev` + Playwright → screenshot the
  `/admin/products` list. Don't guess.
- **Harvest from real data, never assume titles** — fetch the live iosys category page, build a fixture,
  TDD the parser; new title variants only surface against real HTML (Galaxy taught us this twice).
- **Never guess specs/colors** — flag unknowns null (`spec_known=false`, `color_en=null`); backfill later.
- Bump `package.json` once per session (semver); ship via `push-to-main`; commit ONLY the relevant files
  (the repo root has ~50 stray PNGs/docs — never `git add -A`).

## Scope — LOCKED decisions (2026-06-28)
- **Computers: Apple only** — MacBook (Air/Pro), iMac, Mac mini, Mac Studio, Mac Pro. **Windows PCs are OUT**
  (Surface/ThinkPad/Let'snote/Dynabook/FMV/LAVIE/Chromebook/desktops/monitors) — revisit later if desired.
- **Watches: Apple + Samsung + Google** — Apple Watch, Galaxy Watch, Pixel Watch. (Garmin/Fitbit/Amazfit/
  Xiaomi/Huawei/Nothing = OUT for now.)
- **Audio: Apple + Samsung + Google** — AirPods, Galaxy Buds, Pixel Buds. (Sony/Bose/B&O/Nothing = OUT for now.)
- **Phones: all mainstream iosys brands** (list below). **Tablets: iPad + Android tablets** (Galaxy Tab etc).
- **OUT entirely:** feature phones (ガラケー), mobile routers, smartphone/pc accessories, HMD/VR, premium
  3rd-party audio, fitness-tracker long tail, Windows tablets (Surface). Confirm with Joey before adding any.

## The two pipelines (both already built — extend, don't reinvent)
Code lives in `supabase/functions/_shared/catalog/`. Harvest core is category-driven (`harvest.ts`),
dedupes on `sku_key`, runs from a local runner (`run-harvest-local.ts <category>`) or the deployed
`harvest-iosys-catalog` edge fn. 52 deno tests green.

1. **Apple part#-keyed pipeline** (`iosys-listing.ts` iPhone, `ipad-listing.ts`): identity = `part_number`
   (Apple SKU encodes model+config+color+region). Colors via `apple-colors.ts`. **Use for: Mac, Apple Watch,
   AirPods** — all carry Apple part#s. NEW per-shape parsers needed:
   - **Mac:** title `MacBook Air 13インチ MDHE4J/A Early 2026 ミッドナイト【Apple M5/16GB/512GB SSD】` → part#
     keyed; parse size/period/color + config bracket (chip / RAM / SSD). Config-rich → many SKUs.
   - **Apple Watch:** parse case size (mm) / material / GPS-vs-GPS+Cellular / color. (Fetch grammar first.)
   - **AirPods:** simple — `AirPods Pro2 MTJV3J/A【2023】` → name + part# + year.
2. **Android (brand,model,storage,color)-keyed pipeline** (`android-listing.ts` generic + per-brand
   `AndroidBrandConfig`; Galaxy = `GALAXY_CONFIG`/`galaxy-specs.ts`): no part#; model_number+carrier are
   coarse attributes ([[project_android_identifiers]], `docs/investigations/android-identifier-conventions.md`).
   **Use for: all non-Apple phones, Android tablets, Galaxy/Pixel watches & buds.** Each new brand = a new
   `AndroidBrandConfig` (brand keyword, model-code regex, name canonicalizer, color map) + a `*-specs.ts`
   reference + an `androidCategory(path, config, specLookup)` entry + a fill-gaps data-op.
   - **Pipeline extension needed for non-phones:** the identity key's middle dimension is category-specific —
     phones/tablets = storage; **watches = case size (mm)**; **buds = none (brand,model,color only)**.
     Parameterize the key + `sku_key` per category when you get to Phase C.

## Current state (DONE)
- **iPhone** — SKU-accurate, 442 ACTIVE SKUs (Phases 0–5, see PROJECT_STATE).
- **iPad** — SKU-accurate, 226 ACTIVE SKUs.
- **Samsung Galaxy phones** — 144 ANDROID SKUs / 50 models (v1.65.0); generic Android pipeline + Galaxy config.
- **Sony Xperia phones** — 106 ANDROID product_models / 31 models (v1.66.0); `XPERIA_CONFIG` + `xperia-specs.ts`
  (34 models, research-verified) + Sony color map. Inline legacy reconcile of 3 COMPUTER-miscategorized Sony
  rows done. Recipe proven a 2nd time with zero engine changes.
- **Sharp AQUOS phones** — 80 ANDROID product_models / 32 models (v1.67.0); `AQUOS_CONFIG` + `aquos-specs.ts`
  (34 models, research-verified) + Sharp color map. Inline legacy reconcile of 4 COMPUTER-miscategorized
  `Aquos Sense3` rows (incl. a Black dup merged via `superseded_by`). One small GENERIC engine fix: discard a
  trailing pure-noise `【法人モデル】` corporate bracket so the carrier bracket is read. Recipe proven a 3rd time.
- **Google Pixel phones** — 63 ANDROID product_models / 24 models (v1.68.0); `PIXEL_CONFIG` + `pixel-specs.ts`
  (30 models, research-verified, incl. Pixel 10a) + Pixel color map. Inline legacy reconcile of 4 COMPUTER-
  miscategorized Pixel `a`-rows (4a/4a 5G/5a 5G/7a → 128GB); 2 Google speakers left out of scope. GENERIC engine
  fix: normalize ASCII `[...]` brackets + unwrap a leftover tail bracket (Pixel-3-era `[Color Storage]` grammar).
  **Operational playbook now lives in `docs/CATALOG_HARVEST_RUNBOOK.md`** (per-brand formula registry).
- **Identifier-display list** — `/admin/products` shows Brand·Model·model#·color + per-storage part# with
  dynamic multi-token search (v1.64.0).

## Verified iosys category paths (confirmed live 2026-06-28)
| Category | iosys path | Carriers/sub | Pipeline |
|---|---|---|---|
| iPhone ✓ | `items/smartphone/iphone` | simfree/docomo/au/softbank/rakuten | Apple part# |
| Galaxy ✓ | `items/smartphone/galaxy` | same | Android |
| Xperia | `items/smartphone/xperia` | same | Android |
| AQUOS | `items/smartphone/aquos` | same | Android |
| Pixel | `items/smartphone/pixel` | same | Android |
| Xiaomi | `items/smartphone/xiaomi` | same | Android |
| OPPO | `items/smartphone/oppo` (+`/reno`) | same | Android |
| arrows (Fujitsu) | `items/smartphone/arrows` | same | Android |
| Huawei | `items/smartphone/huawei` (+`/nova`) | same | Android |
| Zenfone / ROG (Asus) | `items/smartphone/zenfone`, `/rog` | simfree | Android |
| Motorola razr | `items/smartphone/razr40` | simfree | Android |
| iPad ✓ | `items/tablet/ios/ipad` | simfree/docomo/au/softbank/wifi | Apple part# |
| Android tablets | `items/tablet/android/{tab,mediapad,tab6}`, `items/tablet/other/pad3` | — | Android |
| MacBook | `items/pc/notepc/macbook` | — | Apple part# (config) |
| iMac/mini/Studio/Pro | `items/pc/deskpc/mac` | — | Apple part# (config) |
| Apple Watch | `items/wearable/apple` | — | Apple part# |
| Galaxy Watch | `items/wearable/galaxy` | — | Android |
| Pixel Watch | `items/wearable/pixel` | — | Android |
| AirPods | `items/audio/airpods` | — | Apple part# |
| Galaxy/Pixel Buds | `items/audio/earphone_headphone` (filter) | — | Android |

> Sub-brand/model paths and exact title grammars must be CONFIRMED by fetching each page at execution
> (build a fixture first). Don't trust remembered paths.

## Phased roadmap (priority = kaitori value × pipeline readiness)
**Phase A — Android phones (pipeline ready, highest volume).** Brand-by-brand, each its own session-sized
unit. Suggested order (volume/ease): **~~Xperia~~ ✓ → ~~AQUOS~~ ✓ → ~~Pixel~~ ✓ → ~~Xiaomi~~ ✓ (v1.69.0; first
optional-code brand via `nameConsumeRe`) → ~~OPPO~~ ✓ (v1.70.0; storage-in-name + 付属 strip + brand-casing
guard) → ~~arrows~~ ✓ (v1.71.0; clean coded, 0 engine changes) → ~~Huawei~~ ✓ (v1.72.0; paren-code strip + MVNO peel) → Zenfone/ROG (next) → Motorola razr.**
Recipe below. Also fold in the **deferred legacy-Samsung reconcile** (+ the deferred Xiaomi ~33-row & OPPO ~25-row reconciles)
(42 COMPUTER-miscategorized `Samsung` rows, 37 referenced by 117 live items → recategorize→ANDROID, dedup
vs the clean Galaxy rows, re-point items, archive stubs; mirrors iPhone Phase 2).

**Phase B — Apple non-phone (part# pattern, high resale value).** **MacBook → iMac/Mac mini/Mac Studio/Mac
Pro → Apple Watch → AirPods.** New parsers (config/size dims) but reuse part#-as-key + apple-colors.

**Phase C — Android tablets + core wearables/audio.** Galaxy Tab + other Android tablets; Galaxy Watch +
Pixel Watch; Galaxy Buds + Pixel Buds. Requires the Android-key category parameterization (size for watches,
color-only for buds).

**Phase D — Kaitori pricing wiring (THE END GOAL = Phase 5-full).** Add `carrier`(jp_carrier)+`is_unlocked`
to the EMPTY `kaitori_price_list`; populate buy-prices keyed to the now-complete SKUs; wire the auto-quote
to accurate matching. Carrier lives per-unit on `items`, NOT product_models. Promote the per-category
partial UNIQUE to a global one once all categories are clean. (Schema prep can start anytime.)

## The proven per-brand recipe (Android; copy Galaxy)
> **Canonical operational copy now lives in [`docs/CATALOG_HARVEST_RUNBOOK.md`](../../CATALOG_HARVEST_RUNBOOK.md)**
> — use that for re-harvesting an existing brand (new models) AND for adding a new brand; it carries a
> per-brand "formula" registry (code regex, canonicalizer quirks, files, gotchas). Short version kept here:
1. `curl` the live iosys brand page → save fixture in `__fixtures__/iosys-<brand>-p1.html`; eyeball title grammar.
2. TDD: write `<brand>` cases in a test, add an `AndroidBrandConfig` (brand keyword, model-code regex,
   `canonicalModelName`, color map) — reuse `android-listing.ts` generic engine.
3. `<brand>-specs.ts` (verified model→chipset/screen/year/ram; JP variants; unknowns flagged). Consider a
   background research subagent for specs + color map (worked well for Galaxy).
4. Add `androidCategory("items/smartphone/<brand>", <CONFIG>, <specLookup>)` + a `which==='<brand>'` arm in
   `run-harvest-local.ts`. Run all parser tests + full deno suite green.
5. Harvest locally: `deno run --allow-net run-harvest-local.ts <brand> > /tmp/h.sql`; inspect for broken
   parses + unmapped colors; iterate parser until clean; load: `supabase db query --linked -f /tmp/h.sql`.
6. Fill-gaps data-op `supabase/data-ops/2026-06-28-<brand>-fill-gaps.sql` (additive, idempotent NOT-EXISTS,
   device_category='ANDROID', specs, representative model_number, partial UNIQUE). Apply via CLI.
7. Verify via dev login + Playwright screenshot of `/admin/products?q=<brand>`. Bump version, commit relevant
   files, push. Update PROJECT_STATE.

## Carried-over gotchas (reuse, don't rediscover)
- Android: model code = coarse attribute, NOT key; key (brand,model_name,storage,color); strip `5G`/
  `Single-SIM`/`Dual-SIM`/`+(Plus)`; handle `/DS` suffix, inline storage, trailing full-SKU codes,
  all-in-bracket 楽天版 grammar; `色`は外側 or recover from bracket; `storage` stored as `"<n>GB"` text;
  `ram_gb`/`screen_size` are TEXT columns, `year` int; `color` is NOT NULL (skip color-less parses).
- Apple: part# is carrier-AGNOSTIC + finer than a SKU; key on identity, part# as attribute. Model-aware
  color fixes (iPhone 8/X Black→Space Gray etc) — Mac/Watch will have their own color maps.
- `iosys_catalog` dedupes on `sku_key` (Apple=part#, Android=brand|model|storage|color|carrier); upsert
  ON CONFLICT(sku_key).

## Resume after /clear
1. Read this GOAL + PROJECT_STATE "Now" + `docs/investigations/android-identifier-conventions.md`.
2. Pick the next phase (default: **Phase A, Xperia next**). Confirm the brand with Joey if unsure of priority.
3. Follow the recipe. CLI for Supabase, dev-login for visual verify, ship per the operating rules.
