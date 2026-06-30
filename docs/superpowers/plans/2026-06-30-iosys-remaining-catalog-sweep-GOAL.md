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
- [ ] Phase 1 re-harvests: iPhone __ · iPad __ · Galaxy __ · Xperia __ · Xiaomi __ · AQUOS __ · Pixel __ ·
      OPPO __ · Motorola __ · Huawei __ · arrows __ · ASUS __  (record new-model delta each)
- [ ] Phase 2 ZTE/nubia/RED MAGIC (formula + harvest + promote + verify + legacy clean)
- [ ] Phase 2 Nothing/CMF
- [ ] Phase 2 Kyocera smartphones
- [ ] Phase 2 HTC
- [ ] Phase 3 AirPods
- [ ] Finalize: version bump · PROJECT_STATE · PR

## Status checkpoint (as of 2026-06-30 setup)
- Goal scoped + approved; gap analysis written. NO harvesting started yet. Phase 1 (existing-brand
  re-sweeps) is the first action on resume. Photo-recovery goal (prior) is DONE; PR #1 open, unmerged.
