---
name: harvest-catalog-models
description: Add product models to the Dealz catalog (`product_models`) by harvesting iosys.co.jp. Use this skill WHENEVER Joey wants to pull new SKUs/models into the catalog — e.g. "a new iPhone/AQUOS/Pixel came out, add it", "harvest the new <brand> models", "add <brand> to the catalog", "re-harvest iosys for new stock", "add AirPods/iPad/Mac models", "the kaitori catalog is missing <model>", or any request to populate/refresh product_models from iosys. Triggers even when the word "harvest" isn't used — any "add new phone/tablet/audio models to the catalog" intent counts. This skill orchestrates the harvest; the operational detail lives in docs/CATALOG_HARVEST_RUNBOOK.md.
---

# Harvest catalog models from iosys

This skill is the **entry point** for populating `product_models` from iosys.co.jp. It is a thin
orchestrator: the authoritative, living playbook is **[`docs/CATALOG_HARVEST_RUNBOOK.md`](../../../docs/CATALOG_HARVEST_RUNBOOK.md)**
(per-brand "formulas" in §5, gotchas in §7). **Read the runbook before harvesting** — every brand we've
done is recorded there, so you almost never start from scratch and you NEVER re-research models we
already have (their specs live permanently in `supabase/functions/_shared/catalog/<brand>-specs.ts`).

The system is **one shared parser engine + a small per-brand "formula."** Adding models is mostly
filling in that formula and running idempotent SQL. Supabase access is via **CLI only** (`supabase db
query --linked …`), never MCP, never ask.

## 1. Pick your path

| Situation | Path | Effort |
|---|---|---|
| New SKUs for a brand we already did (iPhone 18, AQUOS R11, new Pixel) | **Re-harvest** (runbook §2) | ~15 min — research only the *new* model |
| A brand we've never harvested | **New brand** (runbook §3) | ~1 session — new formula + specs + TDD |
| Apple (iPhone/iPad/Mac/Watch/AirPods) | **Apple part# pipeline** (runbook §4) | per-shape parser |

Confirm which brand/path before touching anything. If unsure whether a brand exists yet, check the
runbook §5 registry or `grep -l "<BRAND>_CONFIG" supabase/functions/_shared/catalog/android-listing.ts`.

## 2. Invariants (these are what keep the catalog trustworthy — hold them on every path)

- **Never guess.** Unverified specs leave `spec_known=false`; unverified colors stay null and promote as
  the Japanese token via `coalesce(color_en, color_ja)`. A color-less parse is skipped (color is NOT
  NULL in `product_models`). Storage absent from the title → NULL, never inferred. This is the single
  most important rule — a wrong spec silently corrupts kaitori matching.
- **Research with a subagent, rigorously.** Dispatch a research agent (template in §5 below) for any
  new model's specs + JA→EN colors. Demand sourcing; have it FLAG anything it can't verify. The agents
  catch real traps (e.g. "TORQUE G05"/"BASIO5" don't exist; "BASIO active" is Sharp not Kyocera).
- **TDD the formula.** For a new/changed parser, write `android-listing.test.ts` (or the Apple
  `*-listing.test.ts`) cases for EVERY observed title grammar variant before wiring it. Keep the full
  `deno test --allow-read --node-modules-dir=auto` suite green.
- **Idempotent everything.** Harvest upserts `ON CONFLICT(sku_key)`; fill-gaps uses `NOT-EXISTS`
  guards. Both are safe to re-run — re-harvesting an existing brand should insert only genuinely new
  rows (often zero).
- **Reconcile legacy, don't duplicate.** Old brands often have rows miscategorized `device_category=
  'COMPUTER'` with dirty names. Check (runbook §7) and reconcile inline (recategorize → ANDROID/OTHER,
  canonicalize name, enrich, repoint items via `superseded_by`), so you don't create a parallel dup.
- **Verify before claiming done** (see §4).

## 3. The workflow (new brand = the full shape; re-harvest skips steps 1-4)

Follow the runbook section for the exact commands; this is the skeleton:

1. **Fixture & grammar.** `curl` the brand's iosys listing into `__fixtures__/iosys-<brand>-p1.html`;
   extract `<img alt>` titles; catalogue every code shape / quirk (don't trust remembered formats).
2. **Research** the specs + colors with a subagent (§5 template).
3. **TDD the formula.** Add `<BRAND>_CONFIG` (regex / canonicalizer / color map) in `android-listing.ts`
   (or an Apple `*-listing.ts`) + `<brand>-specs.ts`; write tests for every grammar variant.
4. **Wire** `<BRAND>_CATEGORY` in `harvest.ts` + a `which === '<brand>'` arm in `run-harvest-local.ts`.
   (Custom carrier sections — e.g. ymobile for Y!mobile-only lines — go in a `<BRAND>_SECTIONS` array.)
5. **Harvest & inspect.** `deno run --allow-net --allow-write --node-modules-dir=auto run-harvest-local.ts
   <brand> > /tmp/<brand>.sql 2>/tmp/<brand>.log`. The HARVEST STATS must show **`unknownModels: []`**
   (else a model is missing from specs) and **`unmappedColors`** only for genuinely-uncertain names.
   Eyeball the parsed rows (colors absorbing noise? colorless? weird names?) before loading.
6. **Load + fill-gaps.** `supabase db query --linked -f /tmp/<brand>.sql`, then write
   `supabase/data-ops/<date>-<brand>-fill-gaps.sql` (copy the most recent brand's — additive, idempotent
   `NOT-EXISTS`, `DISTINCT ON (brand,model,storage,color)`, `lower(brand)` guard) and apply it.
7. **Legacy reconcile** (runbook §7) if any COMPUTER rows exist for the brand.
8. **Verify** (§4), then update docs + commit.

## 4. Verification gates (run these — "evidence before assertions")

- SQL: ACTIVE SKU count + breakdown; **0 COMPUTER left**; **0 orphaned items**; **0 dup identities**
  (`GROUP BY model,storage,color HAVING count(*)>1`). Reconciled rows kept their items.
- Search RPC (the admin Products data path): `list_product_color_groups('<brand>')` renders the right
  display names; fuzzy variants (glued/spaced/case) resolve.
- UI: dev-login + Playwright screenshot of `/admin/products?q=<brand>` (creds in `.env.local`,
  `DEV_STAFF_*`). Confirm display names, codes, colors render.

## 5. Reusable research-subagent prompt template

Dispatch a `general-purpose` agent. Adapt the bracketed parts; keep the rigor — it's what makes the
output trustworthy. (Real examples that worked: Nothing/CMF, Kyocera smartphones, HTC, AirPods.)

```
I'm building a product-catalog spec reference for [BRAND] sold in JAPAN (harvested from iosys.co.jp,
a Japanese refurb retailer). I need RIGOROUSLY VERIFIED specs + a Japanese→English color map.
Accuracy matters more than completeness. NEVER guess — if you cannot verify a value from an
authoritative source ([maker].co.jp / au / SoftBank / Y!mobile / GSMArena / Kakaku / JP press),
flag it UNVERIFIED and omit it.

[If scope-limited, state it loudly, e.g.: SMARTPHONES ONLY — exclude feature phones / tablets;
 for each model tell me explicitly whether it's a smartphone or feature phone.]

Part 1 — Models & codes: for each model likely on iosys's page, give the carrier model code(s)
(au / docomo / SoftBank / SIM-free shapes) and whether it's a genuine JP-market device. Flag
mislabels / non-JP / import-only models.

Part 2 — Specs: for each confirmed JP model give chipset (full marketing name), main screen size
(inches), first JP release year, base-tier RAM (GB), OS family ("Android"). Present as a table AND
as TS literals keyed by a CLEAN model name:
  "[Model]": { chipset: "...", screen_size: 6.1, year: 2024, ram_gb: 8, os_family: "Android" },

Part 3 — Colors: full verified katakana→official-English color map for those models (I already know:
[seed colors]). Flag any katakana you can't confidently map. TS literals:
  "[カタカナ]": "[English]",

Return labeled blocks: MODELS-AND-CODES, SPECS (TS), COLORS (TS), with brief sourcing notes and a
list of any traps/corrections you found.
```

For **Apple**, swap to: part# patterns per model, year/chip (H1/H2 etc.), and which models are genuinely
JP-domestic vs import-only; Apple identity is `part_number` (each SKU distinct), `device_category='OTHER'`
for Watch/AirPods.

## 6. Finish

Update **PROJECT_STATE.md** (Now), the runbook **§5 registry row + a subsection**, the active GOAL doc if
one is open, bump `package.json` once per session, and commit **only the relevant files** (never
`git add -A` — the repo root has ~50 stray PNGs). Don't push / open a PR unless asked.
