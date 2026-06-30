# GOAL: Harvest the remaining in-scope iosys catalog into product_models (/loop)

> **This is the active /loop goal. Read this first on resume (it survives context clears).**
> Branch: `feat/catalog-product-photos` (or a fresh `feat/iosys-remaining-catalog` if you prefer — decide on resume).
> Project: Dealz. Supabase project ref: `aeiyinpxmazmfubotpdk`.
> Run SQL with `supabase db query --linked "<sql>"` or `-f <file>` (CLI only, never MCP, never ask).
> **READ `docs/CATALOG_HARVEST_RUNBOOK.md` FIRST** — it is the operational playbook (shared harvest
> engine + per-brand "formula" registry: code regex / canonicalizer / colors / specs). Do not harvest
> without it. Gap analysis backing this goal: `docs/superpowers/specs/2026-06-30-iosys-remaining-catalog-gap-analysis.md`.

## Scope (LOCKED with Joey 2026-06-30)
- **IN:** smartphones + finishing Apple (AirPods). Re-harvest existing phone brands for NEW models;
  add ALL four currently-missing iosys brands; clean legacy junk for brands we touch.
- **NEW brands to add (all four):** Nothing + CMF · ZTE / nubia / RED MAGIC (incl. Libero) ·
  Kyocera **smartphones only** (TORQUE rugged + Android One — EXCLUDE feature phones & tablets) · HTC.
- **DEFERRED (NOT this loop):** Phase C non-phones (Android tablets, Galaxy/Pixel watches, all earbuds
  except AirPods) and Phase D kaitori pricing. Do not start these.
- **Cheap-import note:** Blackview / Realme / UMIDIGI / Alldocube / Higrace are NOT on iosys's current
  smartphone lineup — they exist only as legacy miscategorized junk in our DB (see Legacy cleanup).

## Desired end state
1. Every in-scope iosys smartphone model (existing brands' new SKUs + the 4 new brands) is an ACTIVE
   `product_models` row with correct identity, specs, and colors per the runbook.
2. AirPods harvested (Apple part# pipeline) — Apple lineup then COMPLETE.
3. Legacy COMPUTER-miscategorized junk rows for any brand we touch are reconciled/archived (no orphaned
   items; stubs superseded_by the correct rows).
4. Version bumped, PROJECT_STATE updated, PR opened to main (do NOT merge without Joey).

## Pipelines (from the runbook)
- **Apple part#-keyed** (iPhone/iPad/Mac/Watch done) → reuse for **AirPods**.
- **Android (brand, model_name, storage, color)-keyed** (Galaxy/Xperia/Xiaomi/AQUOS/Pixel/OPPO/Moto/
  Huawei/arrows/ASUS done) → reuse for **Nothing/CMF, ZTE family, Kyocera smartphones, HTC**.
- Each NEW brand needs its own "formula" added to the registry: code/model_number regex, title
  canonicalizer, JP→EN color map, and a spec source (research subagent → spec file, like prior brands).

## /loop steps (run in order; loop each harvest until it yields 0 NEW models)

### Phase 0 — Setup (once)
- Read `docs/CATALOG_HARVEST_RUNBOOK.md` + the gap-analysis doc.
- Confirm branch; ensure `iosys_catalog` staging is understood (harvest upserts into it, then a fill-gaps
  data-op promotes matched rows to `product_models`).

### Phase 1 — Re-harvest EXISTING phone brands (idempotent; most return 0 new)
Sweep each, promote, verify count delta: iPhone, iPad, Galaxy, Xperia, Xiaomi, AQUOS, Pixel, OPPO,
Motorola, Huawei, arrows, ASUS. (iPad/iPhone are Apple but fold them in here as cheap idempotent sweeps.)
Per brand: harvest → fill-gaps data-op → `select count(*)` before/after → note delta in the log below.

### Phase 2 — Add the 4 NEW brands (the bulk of new work)
For EACH new brand, follow the runbook "add a new brand" path:
  (a) Build the formula (regex/canonicalizer/color map) + spec source; add a fixture + parser tests (TDD).
  (b) Wire the parser into the shared engine; harvest the brand's iosys listing pages.
  (c) Fill-gaps data-op → promote to product_models; verify in `/admin/products?q=<brand>`.
Order by value: **ZTE family → Nothing/CMF → Kyocera (smartphones only) → HTC.**
  - **Kyocera filter:** include only true smartphones (TORQUE, Android One); EXCLUDE feature phones (ガラケー),
    tablets, routers. Gate on device shape, not just the maker filter.

### Phase 3 — AirPods (completes Apple)
Apple part#-keyed shape (name + part# + year; simpler than Watch). Add formula + tests, harvest, promote,
verify. Category/columns per the runbook's Apple-audio convention (mirror Apple Watch's OTHER/wearable
decisions as appropriate — confirm column mapping before promoting).

### Legacy cleanup (do as you touch each brand)
For brands we harvest, reconcile the old COMPUTER-miscategorized junk rows (Blackview/Realme/ZTE/UMIDIGI/
Nothing/etc. that were wrongly filed as COMPUTER): repoint any items, ARCHIVE + `superseded_by` the stubs,
recategorize any real data-bearing rows. Verify 0 orphaned items afterward (mirror the Apple Watch reconcile pattern).

### Finalize
- Race/integrity spot-checks per brand; confirm no dup identities (rely on the partial UNIQUE indexes).
- Bump `package.json` (semver, once this session). Update PROJECT_STATE "Now".
- Open PR to main (do NOT merge without Joey).

## Progress log (update as you go — survives context clears)
- [x] **Phase 1 re-harvests DONE (2026-07-01).** Net ACTIVE deltas vs gap-analysis baseline:
      iPhone +0 (17 family already promoted) · **iPad +67** (added Air M4 11"/13" specs, 2026/12GB) ·
      Galaxy +0 rows but **S26/S26+/S26 Ultra specs backfilled** (were promoted spec-less in a prior
      run; SD 8 Elite Gen 5 for Galaxy / 12GB / 2026; also added Z Fold3/Fold6/S21+ spec gaps) ·
      Xperia +4 · Xiaomi +7 (added Redmi Note 15, POCO M8, 13T Pro, Redmi 15) · AQUOS +6 (added zero6) ·
      Pixel +12 · OPPO +1 (added Find X8/X9/N6 5G, A5 5G) · Motorola +4 (edge 30 Pro/40 neo/50 pro,
      razr 50 Ultra/60d/60s) · Huawei +4 · arrows +5 · ASUS +4. ~25 colors verified→mapped across
      brands; 14 spurious JA/EN dup rows archived (superseded_by); 7 colors left JA-token (unverified,
      by design). 207 deno tests green. Data-ops: 2026-07-01-{ipad-fill-gaps, galaxy-s26-spec-backfill,
      android-color-en-cleanup, android-color-dup-archive}.sql.
- [x] **Phase 2 ZTE/nubia/RED MAGIC/Libero DONE (2026-07-01).** New brand built per runbook §3:
      ZTE_CONFIG + ZTE_COLORS + zte-specs.ts + 13 TDD tests; wired ZTE_CATEGORY w/ a new **ymobile**
      crawl section (Libero lives only there) via an optional `sections` param on androidCategory().
      Harvested 18 SKUs (0 unknown, 0 unmapped). Legacy reconcile: 17 COMPUTER rows / 53 items →
      ANDROID, names cleaned, 2 dups archived. **33 ACTIVE ZTE SKUs, 0 COMPUTER, 0 orphaned items.**
      Generic engine gain: step 4b tolerates trailing Dual-SIM after in-name storage. 220 tests green.
      Data-ops: 2026-07-01-zte-{fill-gaps,legacy-reconcile}.sql. Registry §5 updated.
- [ ] Phase 2 Nothing/CMF  ← NEXT
- [ ] Phase 2 Kyocera smartphones
- [ ] Phase 2 HTC
- [ ] Phase 3 AirPods
- [ ] Finalize: version bump · PROJECT_STATE · PR

## Status checkpoint (as of 2026-07-01)
- **Phase 1 + Phase 2 ZTE complete & committed.** Next action on resume: **Phase 2 brand 2 = Nothing
  (+ CMF)** — new-brand recipe per runbook §3 (curl `/items/smartphone/nothing` fixture → eyeball
  grammar → TDD NOTHING_CONFIG in android-listing.ts → research-verified specs+colors → wire
  NOTHING_CATEGORY + run-harvest arm → harvest → fill-gaps → legacy reconcile the 1 Nothing COMPUTER
  row → verify). Then Kyocera (smartphones only: TORQUE/Android One, EXCLUDE feature phones/tablets),
  then HTC, then AirPods. Photo-recovery goal (prior) DONE; PR #1 open.
