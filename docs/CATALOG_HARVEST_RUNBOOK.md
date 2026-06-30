# Catalog Harvest Runbook

> **The canonical operational guide for populating `product_models` from iosys.co.jp.**
> Read this when you need to (a) **re-harvest a brand we've already done** because new models came
> out, or (b) **add a brand we've never done**. It is a *living* doc — every brand added appends a
> row to the [Per-brand registry](#5-per-brand-registry-the-formulas).
>
> Theory/background: [`docs/investigations/android-identifier-conventions.md`](investigations/android-identifier-conventions.md).
> Master goal + scope: [`docs/superpowers/specs/2026-06-28-iosys-full-catalog-sweep-GOAL.md`](superpowers/specs/2026-06-28-iosys-full-catalog-sweep-GOAL.md).
> Current status of each brand: [`PROJECT_STATE.md`](PROJECT_STATE.md).

---

## 0. Pick your path (decision tree)

| Situation | Go to |
|---|---|
| New models came out for a brand we **already did** (e.g. AQUOS R11, Pixel 11) | [§2 Re-harvest an existing brand](#2-re-harvest-an-existing-brand-the-common-case) |
| A brand we've **never done** (next in the Phase-A queue) | [§3 Add a new brand](#3-add-a-new-brand-full-recipe) |
| Apple (iPhone / iPad / Mac / Watch / AirPods) | [§4 Apple part# pipeline](#4-apple-part-pipeline) |
| "What was the formula for brand X?" | [§5 Per-brand registry](#5-per-brand-registry-the-formulas) |
| Commands / file locations | [§6 Cheat-sheet](#6-files--commands-cheat-sheet) |

---

## 1. The mental model (why it's not one-size-fits-all)

There is **one shared parser engine**, but **each brand needs its own small "formula."** This is the
key thing to understand: the engine is generic; the brand-specific knowledge is isolated into a config
object you write once per brand.

**Two pipelines:**

- **Apple part#-keyed** — Apple's part number (`MXVH3J/A`) encodes model+storage+color+region in one
  code, so identity = `part_number`. Used for iPhone, iPad (and later Mac/Watch/AirPods).
- **Android (brand, model_name, storage, color)-keyed** — **no Android code encodes storage or color**
  (the displayed model number is a coarse "model + carrier/region" tag, like Apple's A-number). So
  identity = `(brand, model_name, storage, color)`; `model_number` + `carrier` are *coarse attributes*,
  not the key. Storage and color are parsed from the **title text**, not the code.

**The generic Android engine** (`supabase/functions/_shared/catalog/android-listing.ts`,
`parseAndroidListingTitle`) knows the *universal* iosys title grammar that every Android brand shares:

```
[Brand] ModelName ModelCode Color(JP|EN) 【RAM.. / ROM.. / 版(carrier)】
```

It handles leading condition brackets, carrier-word prefixes, inline vs bracketed storage, the
"everything in one bracket" 楽天版 grammar, trailing full-SKU codes, etc. — **once, for all brands.**

**What each brand supplies (the "formula" = `AndroidBrandConfig`):**

| Part | What it is | Why it's per-brand |
|---|---|---|
| **1. `modelCodeRe`** | regex that finds the model code & splits "name \| tail" | Each maker encodes model+carrier differently (Samsung `SM-/SCG/SC-`, Sony `XQ-/SO-/SOG`, Sharp `SH-M/SH-RM/SHG/A###SH`). **This is the "identifier formula" you intuited.** |
| **2. `canonicalModelName`** | cleans the name segment | Brand quirks: leaked brand/sub-brand prefixes, `Xperia1`→`Xperia 1`, `AceII`→`Ace II`, casing, which suffixes to keep (`sense2 かんたん`) vs strip (`5G`/`Dual-SIM`). |
| **3. color map** (`<BRAND>_COLORS_JA_EN`) | Japanese color → official English | Every maker names colors differently; only *verified* names are mapped, the rest stay null (flagged, never guessed). |
| **4. spec table** (`<brand>-specs.ts`) | model → chipset/screen/year/RAM | iosys doesn't surface specs; we enrich from a research-verified reference. |

So: **shared engine + 4-part per-brand formula.** Adding a brand = writing that formula (config +
specs + colors) and wiring one category path. No engine changes in the normal case (AQUOS needed one
tiny *generic* fix — discard a `【法人モデル】` noise bracket — which now benefits all brands).

---

## 2. Re-harvest an existing brand (the common case)

**Use when:** a brand is already shipped (has a config + specs + colors + a fill-gaps data-op) and you
just need to pull **newly released models / colors** (e.g. AQUOS R11 launched). This is fast and safe —
everything is idempotent.

> ⚠️ Verify these against the [registry](#5-per-brand-registry-the-formulas), but for an existing brand
> you usually only need to (a) add the new model to its `*-specs.ts`, (b) add any new colors to its
> color map, then (c) re-run the harvest + the same fill-gaps data-op.

1. **Add the new model's specs.** Open `supabase/functions/_shared/catalog/<brand>-specs.ts` and add the
   new model(s) with research-verified chipset/screen/year/RAM (use a research subagent — see §3 step 3).
   Use the *exact canonical model name* the parser will produce (check the registry's canonicalizer notes).
2. **Add new colors.** If the new model ships colors not in `<BRAND>_COLORS_JA_EN` (in
   `android-listing.ts`), add the *verified* English names; leave uncertain ones unmapped (they promote
   as the Japanese token via coalesce — never guess).
3. **Re-harvest** (idempotent upsert into `iosys_catalog` ON CONFLICT(sku_key)):
   ```bash
   cd supabase/functions/_shared/catalog
   deno run --allow-net --allow-write run-harvest-local.ts <brand> > /tmp/<brand>.sql 2>/tmp/<brand>.log
   grep -A40 "HARVEST STATS" /tmp/<brand>.log    # check unknownModels=[] and unmappedColors
   ```
   - `unknownModels` should be empty — anything there means step 1 missed a model (or the canonical name
     doesn't match your specs key). Fix and re-run.
   - `unmappedColors` is fine *if* they're genuinely-uncertain marketing names; map the easy/verified ones.
4. **Load** the harvest into staging, then **re-run the same fill-gaps data-op** (its NOT-EXISTS guards
   make it additive — only *new* SKUs insert; existing rows untouched):
   ```bash
   cd /Users/joeymisa/Documents/Projects/inventory-claude
   supabase db query --linked -f /tmp/<brand>.sql
   supabase db query --linked -f supabase/data-ops/<date>-<brand>-fill-gaps.sql
   ```
5. **Verify** (dev login + Playwright screenshot of `/admin/products?q=<brand>`) the new models render
   with model#/storage/color. Bump version, commit, push.

**If a new model has a code format the existing `modelCodeRe` doesn't match** (a genuinely new carrier
code shape), that's the one case you touch the config: extend the brand's `modelCodeRe` and add a test.
The registry records each brand's current code coverage so you know what's already handled.

---

## 3. Add a new brand (full recipe)

**Use when:** the brand has never been harvested. ~1 session per brand. (This is the canonical copy of
the recipe; the GOAL doc keeps a short pointer here.)

1. **Fetch a fixture & eyeball the grammar.** `curl` the live brand page, save it, extract the card
   titles to see the real code shapes and quirks (don't trust remembered formats):
   ```bash
   cd supabase/functions/_shared/catalog
   curl -s -A "Mozilla/5.0 ... Chrome/124.0 Safari/537.36" -H "Accept-Language: ja,en;q=0.8" \
     "https://iosys.co.jp/items/smartphone/<brand>/simfree" -o __fixtures__/iosys-<brand>-p1.html
   grep -oE '<img[^>]*alt="[^"]*<Brand>[^"]*"' __fixtures__/iosys-<brand>-p1.html \
     | sed -E 's/.*alt="([^"]*)".*/\1/' | sort -u
   ```
   Catalogue: SIM-free / docomo / au / SoftBank / Rakuten code shapes, any sub-variant suffixes, and any
   trailing-noise tokens.
2. **TDD the config.** Add `<BRAND>_CONFIG: AndroidBrandConfig` in `android-listing.ts` (brand, prefixes,
   `modelNameRe`, `modelCodeRe`, `canonicalModelName`, color map) and write tests in
   `android-listing.test.ts` covering *every* observed grammar variant. Reuse the generic engine.
3. **Research-verified spec table.** Create `<brand>-specs.ts` (model → chipset/screen/year/RAM,
   `os_family: "Android"`). **Spawn a research subagent** for specs + the JA→EN color map (worked well
   for Galaxy/Xperia/AQUOS) — be rigorous: flag anything unverified, never guess.
4. **Wire the category.** Add `<BRAND>_CATEGORY = androidCategory("items/smartphone/<brand>", <CONFIG>,
   <brandSpec>)` in `harvest.ts`, and a `which === '<brand>'` arm in `run-harvest-local.ts`. Run the full
   deno suite green: `deno test --allow-read`.
5. **Harvest & inspect.** `deno run --allow-net --allow-write run-harvest-local.ts <brand> > /tmp/h.sql`.
   Check `HARVEST STATS` for `unknownModels` (extend specs) and `unmappedColors` (map verified ones).
   **Inspect for broken parses** — extract the JSON rows and look for colors absorbing brackets/noise,
   colorless rows, or weird model names. Iterate the config until clean, then load:
   `supabase db query --linked -f /tmp/h.sql`.
6. **Fill-gaps data-op.** Write `supabase/data-ops/<date>-<brand>-fill-gaps.sql` (copy the most recent
   brand's): additive + idempotent NOT-EXISTS guard, `DISTINCT ON (brand,model,storage,color)`
   collapsing carriers, `device_category='ANDROID'`, specs from `iosys_catalog.specs`, storage as
   `'<n>GB'` text, the storage-NULL-skip guard, and the shared partial UNIQUE index. **Check for legacy
   rows** miscategorized as COMPUTER for this brand (see §7) and reconcile them inline if few. Apply via
   CLI.
7. **Verify & ship.** Dev login + Playwright screenshot `/admin/products?q=<brand>`. Bump version, commit
   **only the relevant files** (never `git add -A` — repo root has ~50 stray PNGs), push. Update
   PROJECT_STATE, the GOAL roadmap, and **append this brand's row to [§5](#5-per-brand-registry-the-formulas)**.

---

## 4. Apple part# pipeline

Apple is the *other* pipeline — identity = `part_number` (encodes everything), so no per-brand color/code
formula is needed; instead each *device shape* (iPhone vs iPad vs Mac vs Watch) gets its own parser
because the title grammar differs.

- **iPhone:** `iosys-listing.ts` + `iphone-specs.ts`, path `items/smartphone/iphone`.
- **iPad:** `ipad-listing.ts` + `ipad-specs.ts`, path `items/tablet/ios/ipad` (leading `【第N世代】` gen,
  part#/A# at END, Wi-Fi vs Wi-Fi+Cellular + size as SKU attributes, glass token).
- **Colors:** `apple-colors.ts` (JA→EN) with model-aware fixes (iPhone 8/X `Black→Space Gray`,
  `White→Silver`; `Red→(PRODUCT)RED`; `Midnight Black→Midnight`).
- **Mac (`mac-listing.ts`, SHIPPED v1.75.0):** path `items/pc/notepc/macbook`. Grammar `MacBook
  [Air|Pro] {size}インチ {part#/A} {Early|Mid|Late} {year} {color} 【chip/RAM/SSD[/GPU]】`. **The config
  is IN the title bracket → no spec file needed** (spec_known always true). Parses M1–M5 (Pro/Max) +
  Intel, CPU/GPU cores, region suffix, period→year. **Identity collapses on config** (model/size/chip/
  RAM/SSD/color), part# is coarse. fill-gaps formats storage GB/TB, os_family='macOS'. No COMPUTER
  unique index yet (legacy dirty rows). NEXT: iMac/mini/Studio (`items/pc/deskpc/mac` — desktop grammar).
- **Desktop Macs (iMac/Mac mini/Studio/Pro, SHIPPED v1.76.0):** same `mac-listing.ts` parser, path
  `items/pc/deskpc/mac` (split-on-part#; iMac size+storage-type inside the bracket; colorless desktops → `—`).
- **Apple Watch (`apple-watch-listing.ts` + `apple-watch-specs.ts`, SHIPPED v1.77.0):** path
  `items/wearable/apple`, `device_category='OTHER'` (wearable). Grammar `[【バンド無し】][【第N世代】]
  Apple Watch [Nike|Hermes|Edition] {Series N|SE|SE3|Ultra2…} {40–49}mm {GPS|GPS+Cellular}モデル
  {part#}[+{bandPart#}] {A####} 【{caseColor}{material}ケース[/{band}]】`. **Identity = CASE config**
  (model + size + material + case color + has_cellular); the **band is dropped** (swappable). SiP is NOT
  in the title → enriched from the verified spec ref (**Series 11/SE 3/Ultra 3 all reuse S10, no "S11"**;
  collection keys on base series). `form_factor='{size}mm {material}'`, `has_cellular` boolean,
  `os_family='watchOS'`, `model_name` omits the "Apple" prefix ("Watch Series 7"). Bare titanium case →
  "Natural", bare stainless → "Silver". Partial UNIQUE on `(brand,model_name,form_factor,color,has_cellular)
  WHERE device_category='OTHER'`.
- **Not yet built (Phase B):** AirPods (simple name+part#+year) — the last Apple shape. Reuse part#-as-key
  + `apple-colors`; likely also `device_category='OTHER'`.

Re-harvest for new Apple models follows the same shape as §2 (add specs → re-run → idempotent upsert).

---

## 5. Per-brand registry (the "formulas")

> **Append a row + a subsection here every time you finish a brand.** This is the lookup that makes
> re-harvesting and debugging fast. Status & SKU counts live in PROJECT_STATE; this is the *formula*.

| Brand | Maker | Path | Code regex (the formula) | Spec / color files | Data-op | Fixture | Status |
|---|---|---|---|---|---|---|---|
| Galaxy | Samsung | `items/smartphone/galaxy` | `SM-[A-Z0-9]+ \| SCG\d+ \| SCV\d+ \| SC-\d+[A-Z]` | `galaxy-specs.ts` / `GALAXY_COLORS_JA_EN` | `2026-06-28-galaxy-fill-gaps.sql` | `iosys-galaxy-p1.html` | ✅ + **legacy reconcile OPEN** (42 COMPUTER rows) |
| Xperia | Sony | `items/smartphone/xperia` | `XQ-[A-Z]{2}\d{2} \| SO-\d{2}[A-Za-z]+ \| SOG\d+ \| SOV\d+ \| A?\d{3}SO \| J\d{4}` | `xperia-specs.ts` / `XPERIA_COLORS_JA_EN` | `2026-06-28-xperia-fill-gaps.sql` | `iosys-xperia-p1.html` | ✅ legacy reconciled inline (3 rows) |
| AQUOS | Sharp | `items/smartphone/aquos` | `SH-RM\d+ \| SH-M\d+ \| SH-\d{2}[A-Z] \| SHG\d+ \| SHV\d+ \| A\d{3}SH` | `aquos-specs.ts` / `AQUOS_COLORS_JA_EN` | `2026-06-28-aquos-fill-gaps.sql` | `iosys-aquos-p1.html` | ✅ legacy reconciled inline (4 rows, Black dup merged) |
| Pixel | Google | `items/smartphone/pixel` | `G[A-Z0-9]{4}` (case-sensitive) | `pixel-specs.ts` / `PIXEL_COLORS_JA_EN` | `2026-06-28-pixel-fill-gaps.sql` | `iosys-pixel-p1.html` | ✅ legacy reconciled inline (4 phone rows; 2 Google speakers left COMPUTER) |
| Xiaomi | Xiaomi | `items/smartphone/xiaomi` | au `XIG\d+` · SoftBank `A\d{3}XM` · POCO global `\d{8}[A-Z]?` — **+ code-less SIM-free via `nameConsumeRe`** | `xiaomi-specs.ts` / `XIAOMI_COLORS_JA_EN` | `2026-06-28-xiaomi-fill-gaps.sql` | `iosys-xiaomi-p1.html` | ✅ + **legacy reconcile OPEN** (~33 COMPUTER rows / ~125 items) |
| OPPO | OPPO→`Oppo` | `items/smartphone/oppo` | global `CPH\d+` · au `OPG\d+` · SoftBank/Y!mobile `A\d{3}OP` — **+ code-less old via `nameConsumeRe`** | `oppo-specs.ts` / `OPPO_COLORS_JA_EN` | `2026-06-28-oppo-fill-gaps.sql` | `iosys-oppo-p1.html` | ✅ + **legacy reconcile OPEN** (~25 COMPUTER rows / ~110 items) |
| arrows | Fujitsu/FCNT | `items/smartphone/arrows` | docomo `F-\d{2}[A-Z]` · au `FCG\d+` · SoftBank `A\d{3}FC` · SIM-free `M\d{2}` | `arrows-specs.ts` / `ARROWS_COLORS_JA_EN` | `2026-06-28-arrows-fill-gaps.sql` | `iosys-arrows-p1.html` | ✅ + **small legacy reconcile OPEN** (~9 arrows rows; ⚠️ LifeBooks are real laptops) |
| HUAWEI | Huawei | `items/smartphone/huawei` | global `[A-Z]{3}-[A-Z]{1,2}\d{1,2}[A-Z]?` (J=Japan) · au `HWV\d+` · docomo `HW-\d{2}[A-Z]` | `huawei-specs.ts` / `HUAWEI_COLORS_JA_EN` | `2026-06-28-huawei-fill-gaps.sql` | `iosys-huawei-p1.html` | ✅ + **small legacy reconcile OPEN** (~8 rows); honor = separate brand (excluded) |
| ASUS | ASUS | `items/smartphone/zenfone` + `/rog` | modern `AI\d{4}` · older `Z[A-Z]\d{3}[A-Z]{2}(-…)?` | `asus-specs.ts` / `ASUS_COLORS_JA_EN` | `2026-06-28-asus-fill-gaps.sql` | `iosys-{zenfone,rog}-p1.html` | ✅ + **small legacy reconcile OPEN** (~4 rows); 2 paths, 1 config |
| Motorola | Motorola | `items/smartphone/motorola` | global `XT\d{4}-\d` · SoftBank `A\d{3}MO` · docomo `M-\d{2}[A-Z]` | `motorola-specs.ts` / `MOTOROLA_COLORS_JA_EN` | `2026-06-28-motorola-fill-gaps.sql` | `iosys-motorola-p1.html` | ✅ (18 core spec'd; 7 carrier/recent flagged) + tiny legacy OPEN (~3) |
| iPhone | Apple | `items/smartphone/iphone` | part# (`MXVH3J/A`) | `iphone-specs.ts` / `apple-colors.ts` | phase2/3/5 data-ops | `iosys-iphone-simfree-p1.html` | ✅ |
| iPad | Apple | `items/tablet/ios/ipad` | part# | `ipad-specs.ts` / `apple-colors.ts` | phase4-ipad data-ops | `iosys-ipad-*-p1.html` | ✅ |
| Mac | Apple | `items/pc/notepc/macbook` + `items/pc/deskpc/mac` | part# (config in title bracket) | (none — config in title) / `apple-colors.ts` | `2026-06-29-{macbook,deskmac}-fill-gaps.sql` | `iosys-{macbook,deskmac}-p1.html` | ✅ MacBook+desktop; legacy reconcile DEFERRED |
| Apple Watch | Apple | `items/wearable/apple` | part# (band dropped from identity) | `apple-watch-specs.ts` / `apple-colors.ts` | `2026-06-29-applewatch-{fill-gaps,reconcile}.sql` | `iosys-applewatch-p1.html` | ✅ legacy reconciled inline (7 merged, 8 cleaned) |
| ZTE | ZTE (nubia/RED MAGIC/Libero/Axon) | `items/smartphone/zte` (+ **ymobile** section) | `NX\d{3}J \| Z\d{4}R \| A?\d{3}ZT` | `zte-specs.ts` / `ZTE_COLORS_JA_EN` | `2026-07-01-zte-{fill-gaps,legacy-reconcile}.sql` | `iosys-zte-p1.html` | ✅ legacy reconciled inline (17 COMPUTER rows / 53 items → ANDROID, 2 dups archived) |

### Galaxy (Samsung)
- **Codes:** SIM-free `SM-…Q/C` · au `SCG##`/`SCV##` · docomo `SC-##L`.
- **Canonicalizer:** keeps `Galaxy` in the name; strips `5G`, `Single/Dual-SIM`; collapses iosys's
  `S9+ (Plus)` → `S9+`.
- **Quirks handled:** `SM-…/DS` dual-SIM suffix, inline storage (`SC-52D 256GB クリーム`), trailing
  full-SKU code (`ブラック SCV46SKV`), all-in-bracket 楽天版 (`【8GB 128GB Prism White 楽天版…】`).
- **Open debt:** 42 legacy `Samsung` rows miscategorized COMPUTER (37 referenced by 117 items) — a
  careful reconcile pass (mirrors iPhone Phase 2); not yet done.

### Xperia (Sony)
- **Codes:** SIM-free `XQ-AA##` · docomo `SO-##L` (+ optional lowercase, `SO-51Aa`) · au `SOV##`/`SOG##`
  · SoftBank `(A)###SO` (the optional `A`-prefix is the gotcha) · old global `J####`.
- **Canonicalizer:** lenient `modelNameRe` (contains `xperia`); strips leaked `Sony/SONY/ahamo` (docomo
  sub-brand) prefixes; inserts the space `Xperia1`→`Xperia 1`; `AceII`→`Ace II`; `Pro-I`/`ProI`→`Pro I`.
- **Specs note:** every JP Xperia flagship = Snapdragon (Sony never used Exynos); JP variants differ only
  on RAM/storage tier — a parsed `【RAM..GB】` overrides the spec fallback.

### AQUOS (Sharp)
- **Codes:** SIM-free `SH-M##` · Rakuten `SH-RM##` (**listed before `SH-M` in the alternation so it
  wins**) · docomo `SH-##L` · au `SHG##`/`SHV##` · SoftBank `A###SH`.
- **Canonicalizer:** lenient (contains `aquos`); strips any leaked prefix before `AQUOS` & normalizes its
  casing; keeps sub-variant suffixes (`sense2 かんたん`, `sense3 plus サウンド`); the `\b5G\b` strip is
  **safe for integral names** (`sense5G`/`R5G`/`zero5G` — no word boundary before the `5`).
- **Generic engine fix shipped with AQUOS:** discard a trailing pure-noise `【法人モデル】` (corporate
  channel) bracket so the real carrier bracket is read; also strips an inline `法人モデル` from color.
- **Legacy reconcile:** 4 `Aquos Sense3`/`Aquos Sense 3` COMPUTER rows → ANDROID canonical `AQUOS sense3`;
  a duplicate Black DRAFT row merged into the 21-item row via `superseded_by`.

### Pixel (Google)
- **Codes:** one shape — Google's `G` + 4 uppercase-alnum (`GL066`/`GM66V`/`GN4F5`/`G020D`/`GV0BP`);
  carrier-agnostic. Regex is **case-sensitive** so `Google`/`Green` (lowercase tail) never match, and
  storage (`128GB`) has no boundary before its `G`.
- **Canonicalizer:** lenient (contains `pixel`); strips leaked carrier/`Google` prefix; inserts space
  `Pixel10`→`Pixel 10`, `Pixel7a`→`Pixel 7a`. **Does NOT strip `5G`** — for Pixel it's a model
  distinguisher (`Pixel 4a 5G` ≠ `Pixel 4a`, `Pixel 5a 5G`), never spurious noise.
- **Storage:** inline after the code on ~99% of cards → near-complete storage coverage (only the
  original Pixel Fold omitted it). Colors are ASCII English (Obsidian/Porcelain/Bay/Frost…) and flow
  straight through; the color map only covers older katakana spellings.
- **Generic engine fix shipped with Pixel:** Pixel-3-era titles wrap color+storage in ASCII/mixed
  brackets `[Just Black 64GB]` / `【Purple-ish 64GB]` *before* the carrier bracket. The engine now
  normalizes `[`/`]` → `【`/`】` and unwraps a leftover bracket still wrapping the tail (step 8b).
- **Watch-outs:** new `a`-models appear fast (Pixel 10a `GV0BP` shipped 2026-04 — caught as an
  `unknownModels` entry, added to specs). Two `Google` rows are smart speakers (Nest Mini / Home Mini),
  NOT phones — left as COMPUTER, out of scope.

### Motorola (moto g / edge / razr)
- **Codes:** global `XT####-#` (suffix = region/carrier SKU); SoftBank `A###MO` (MO = Motorola);
  docomo `M-##[A-Z]`. Carrier variants map to a global twin (razr 40s/A303MO = razr 40 rebadge;
  razr 50d/M-51E = base razr 50, NOT the Ultra). model_number + carrier are coarse.
- **Names lowercase** (`moto g52j 5G`, `edge 20`, `razr 40`); canonicalizer spaces razr/edge before
  the number (`razr40`→`razr 40`, `edge30`→`edge 30`), lowercases a leaked `Moto`→`moto`, KEEPS `5G`.
  Storage often sits in the name (`moto g30 128GB XT2129-2`) — pulled by the generic step 4b.
- **JP-exclusive models:** moto g52j 5G (SD695, FeliCa) + its II/SPECIAL refreshes (same XT2219-1
  code, RAM/storage-only difference), moto g53j 5G (SD480+, NOT a 695 despite the higher number).
  Many razr colors are **Pantone-collab** names (Scarab Green, Parfait Pink, Spritz Orange, Sand
  Cream, Gibraltar Sea Navy). **技適 cert ≠ JP sale** — several models cleared cert but never sold
  (excluded). edge 60 (Dimensity 7400) ≠ edge 60 pro (Dimensity 8350) — distinct.

### ASUS (Zenfone / ROG Phone)
- **Two iosys paths, one config:** `items/smartphone/zenfone` + `items/smartphone/rog` both use
  `ASUS_CONFIG` via separate `ZENFONE_CATEGORY` / `ROG_CATEGORY`. Harvest each (`run-harvest-local.ts
  zenfone` then `rog`), load both, one fill-gaps (`brand='ASUS'`) promotes them together.
- **Codes:** modern `AI####` project code (Zenfone 9+, ROG Phone 6+); older `Z[SE]###[KL/KS]` with an
  optional `-XX###S##` SKU suffix (color/storage/RAM, e.g. `ZS620KL-SL128S6`) — kept whole as the code.
- **Naming:** canonicalizer normalizes `ZenFone`→`Zenfone` (ASUS changed styling at the 8-gen) and
  inserts the space before the number (`Zenfone9`→`Zenfone 9`, `ROG Phone8`→`ROG Phone 8`). **No "ROG
  Phone 4"** (ASUS skipped it). ROG Phone II uses a Roman numeral.
- **Engine capability added with ASUS (generic):** strip a standalone `Single/Dual-SIM` word at the head
  of the tail (`ZS620KL-SL128S6 Dual-SIM 【Silver 128GB…】`).
- **Brand casing:** legacy stores "ASUS" all-caps → fill-gaps guard uses `lower(brand)` (same precaution
  as OPPO). Color: レベルグレー = **Rebel Grey** (British "Grey").

### HUAWEI (P-series / Mate / nova)
- **Codes:** global model code = 3 uppercase letters + `-` + alnum (`ANE-LX2J`, `ELS-NX9`; trailing
  `J` = Japan SIM-free) · au `HWV##` · docomo `HW-##[A-Z]`. The simfree crawl captures unlocked
  ex-carrier cards too (HWV/HW- coded), so all models land even though /au /docomo sections read empty.
- **Engine capability added with HUAWEI (generic):** strip a parenthesized secondary carrier code right
  after the model code — `ANE-LX2J (HWU34) Klein Blue`. Canonicalizer also peels MVNO prefixes the
  engine's carrier-word list (docomo/au/softbank/rakuten) misses: **Y!mobile / UQ / mineo**. Inserts the
  nova space (`nova3`→`nova 3`). KEEPS `5G` (P40 Pro 5G).
- **⚠️ honor is a SEPARATE brand** in iosys — `modelNameRe` excludes it so "HUAWEI honor6" never lands
  under "Huawei". Color note: クラインブルー = **Klein Blue**, NOT クラッシュブルー = Crush Blue (distinct).
  Most HUAWEI colors are English on iosys and pass straight through.

### arrows (Fujitsu / FCNT)
- **Codes:** docomo `F-##[A-Z]` (F = Fujitsu/FCNT prefix) · au `FCG##` (FCNT-era; older Fujitsu au = `FJ##`)
  · SoftBank `A###FC` (FC = FCNT tag; older Fujitsu SB = `###F`) · SIM-free `M##` (M06/M07/M08).
- **"arrows" kept lowercase** in the model name (official FCNT styling), brand = "Fujitsu". KEEPS `5G`
  ("arrows 5G" = F-51A is a model name). Clean coded brand — **zero engine changes**, pure config reuse.
- **Spec gotchas:** arrows Alpha (M08 / docomo twin F-51F) = MediaTek Dimensity 8350 Extreme, **2025**
  (a stale source showing Snapdragon 450 is wrong). We2 base = Dimensity 7025 but We2 Plus = Snapdragon
  7s Gen 2 — don't assume one SoC across a family. Color: ブラッシュ = **Blush** (not Brush).
- **⚠️ LifeBook trap:** brand "Fujitsu" also covers genuine **LifeBook Windows laptops** (correctly
  COMPUTER, OUT of scope). The legacy reconcile MUST scope to `model_name ILIKE '%arrows%'`, never
  brand='Fujitsu' alone. Rugged business arrows (BZ01/BZ02) carry no F-code → not harvested (out of scope).

### OPPO (A-series / Reno / Find / older R)
- **Codes:** global/SIM-free/Rakuten `CPH####` · au `OPG##` · SoftBank/Y!mobile `A###OP`. A coded
  brand (unlike Xiaomi) — only a few old models (AX7) are code-less (handled by `nameConsumeRe`).
- **Naming is GLUED** ("Reno5 A", "Reno10 Pro" — number stuck to "Reno"), confirmed official OPPO JP.
  **KEEPS `5G`** as a distinguisher ("A5 5G" ≠ "A5 2020"), like Pixel — does NOT strip it.
- **Two engine capabilities added with OPPO (now generic/reusable):** (1) storage in the NAME segment
  before the code — "Reno3 A 6GB 128GB CPH2013 White" (step 4b pulls a trailing `{ram}GB {rom}GB` run
  off the name); (2) the "…付属" bundled-accessory color strip — "Find N6 … OPPO AI Pen Kit付属".
- **⚠️ BRAND-CASING GOTCHA (first hit by OPPO):** `trg_normalize_brand_product_models` title-cases the
  brand on insert (`OPPO`→`Oppo`). All earlier brands were already title-case. So a fill-gaps whose
  brand is all-caps **MUST** compare `lower(pm.brand)=lower(s.brand)` in the NOT-EXISTS guard — else a
  re-run inserts a row the trigger normalizes into a `product_models_android_sku_uniq` collision. Any
  future all-caps brand (ZTE, etc.) needs the same `lower()` guard.
- **A77 trap:** the JP "OPPO A77" = Helio G35 **4G**, NOT the global "A77 5G"/Dimensity. Spec'd as JP.
- **Legacy reconcile:** ~25 COMPUTER phone rows / ~110 items DEFERRED (mostly clean names + a few
  dups). Out-of-scope legacy rows (R15 Pro / R17 Neo / A3 5G / A5x) left as-is.

### Xiaomi (Xiaomi-flagship / Redmi / POCO / Mi)
- **Codes:** au `XIG##` (XIG01=Mi 10 Lite … XIG07=14T base, XIG06=14T Pro) · SoftBank `A###XM`
  (A001XM=Note 9T … A402XM=14T Pro, A501XM=Redmi 15) · older POCO globals an 8-digit number
  (`21121210G`). **The defining quirk: SIM-free cards have NO code at all.**
- **First brand needing the engine extension — `nameConsumeRe` (optional code).** When `modelCodeRe`
  fails to match, the generic engine falls back to the config's anchored `nameConsumeRe` to consume
  the model-name prefix (model_number stays null); a guard (`model_number==null && region_note==null
  → null`) drops "…シリーズ の画像" nav thumbnails. This capability is now reusable for any future
  code-less brand. Also added a brand-agnostic "+ accessory bundle" color strip.
- **Canonicalizer:** the flagship numbered line KEEPS "Xiaomi" in the model name ("Xiaomi 15T Pro");
  `Xiaomi POCO/Redmi/Mi` → drop the leading Xiaomi (sub-brand is the name). Inserts spaces on glued
  names (`Xiaomi11T`/`Redmi12C`/`Mi11`/`Note11`), title-cases tier words (`Mi11 lite`→`Mi 11 Lite`),
  strips `5G`/SIM markers.
- **Specs/colors note:** Xiaomi's official EN finish word is **"Titan"**, not "Titanium" (チタングレー
  = Titan Gray). シルバークローム (Silver Chrome) ≠ クロームシルバー (Chrome Silver) — kept separate.
  4 models omitted from specs as UNVERIFIED (harvest `spec_known=false`).
- **Legacy reconcile:** ~33 COMPUTER phone rows / ~125 items DEFERRED as open debt (size ≈ the
  Samsung pass) — not done inline. Out-of-scope rows left as-is: Redmi Buds (earbuds), Redmi Pad
  (tablet→Phase C), Smart Band, Sound Pocket speaker.

### ZTE (nubia / RED MAGIC / Libero / Axon)
- **First brand needing a non-default crawl section.** Libero (Y!mobile mass-market) lives ONLY under
  `/zte/ymobile`, which isn't in `ANDROID_SECTIONS`. Added an optional `sections` param to
  `androidCategory()` + `ZTE_SECTIONS = [...ANDROID_SECTIONS, {path:"ymobile", carrier:"SoftBank"}]`
  (Y!mobile carrier mapped to SoftBank — carrier is per-unit on items, never on product_models).
- **One brand, four sub-brand lines** kept in `model_name` (brand="ZTE", like Xiaomi/POCO): nubia
  (flagship/mid), RED MAGIC (gaming), Libero (Y!mobile), Axon. Blade = nav-only (no real cards).
- **Codes:** nubia/RED MAGIC SIM-free `NX###J`; Rakuten nubia `Z####R`; Y!mobile/SoftBank `(A)###ZT`.
  nubia S2 Lite is code-less → `nameConsumeRe` fallback. **`modelNameRe` is lenient (contains, no
  trailing `\b`)** — names glue the number ("Axon10", "RED MAGIC10") so a trailing `\b` would fail; and
  a leading Y!mobile MVNO word is peeled in the canonicalizer (CARRIER_WORD covers only docomo/au/sb/rkt).
- **Canonicalizer:** "Nubia Red Magic7"/"RED MAGIC10S Pro" → "RED MAGIC 7" / "RED MAGIC 10S Pro" (drop
  the "Nubia " before "Red Magic", normalize casing, space the number); "Axon10"→"Axon 10"; KEEP 5G
  (model marker: "Libero 5G III", "Axon 10 Pro 5G"). RED MAGIC themed colors (Supernova/Void/Flare/
  Dusk/Moonlight/Phantom/Prism/Cryo/Hailstone) are ASCII → flow straight through; only basic katakana
  colors mapped.
- **Generic engine capability added with ZTE:** step 4b now tolerates a trailing Single/Dual-SIM marker
  after the in-name storage run ("Nubia Red Magic7 18GB 256GB Dual-SIM NX679J ...").
- **Brand casing:** `canonical_brands` already maps `zte → ZTE` (kept all-caps, NOT INITCAP'd to "Zte");
  fill-gaps still uses the `lower(brand)` guard (OPPO precaution). **Z70 Ultra note:** iosys labels the
  NX733J card "nubia Z70 Ultra" (officially the Z70S Ultra refresh; same SD 8 Elite) — spec'd as harvested.
- **Legacy reconcile (inline):** 17 COMPUTER rows / 53 items → ANDROID; names cleaned (trailing code →
  model_number, "Nubia"→"nubia", "Flip 2"→"Flip2"); Libero 5G III + Libero Flip enriched; 2 fresh
  null-storage rows superseded by storage-bearing legacy siblings. Legacy-only models (Libero 5G/5G IV,
  nubia Flip2 5G/S 5G/S2) left spec-less (flagged, never guessed). ⚠️ Postgres regex word boundary is
  `\y` not `\b` — the first reconcile pass's `^Nubia\b` silently no-op'd; fixed to anchor on the space.

---

## 6. Files & commands cheat-sheet

**Code (`supabase/functions/_shared/catalog/`):**
- `android-listing.ts` — generic Android engine + every `<BRAND>_CONFIG` + `<BRAND>_COLORS_JA_EN`.
- `<brand>-specs.ts` — per-brand verified spec reference.
- `harvest.ts` — crawl/dedupe/enrich engine + `<BRAND>_CATEGORY` definitions + `androidCategory()` factory.
- `run-harvest-local.ts` — local runner (`<brand>` arg) → emits SQL to stdout, stats to stderr.
- `*.test.ts` — `deno test --allow-read` (run from the catalog dir).

**Data-ops (`supabase/data-ops/`):** `<date>-<brand>-fill-gaps.sql` — promotes `iosys_catalog` →
`product_models` (additive, idempotent, re-runnable).

**Staging table:** `iosys_catalog` — dedupes on `sku_key` (Apple=part#, Android=
`brand|model|storage|color|carrier`); harvest upserts ON CONFLICT(sku_key).

**Commands:**
```bash
# from supabase/functions/_shared/catalog
deno test --allow-read
deno run --allow-net --allow-write run-harvest-local.ts <brand|iphone|ipad> > /tmp/h.sql 2>/tmp/h.log
# from repo root (Supabase = CLI only, never MCP)
supabase db query --linked -f /tmp/h.sql
supabase db query --linked -f supabase/data-ops/<date>-<brand>-fill-gaps.sql
supabase db query --linked "SELECT ... FROM public.product_models WHERE brand='<Maker>' ..."
```
Deployed re-harvest path (from edge IP, for scheduled re-runs): edge fn `harvest-iosys-catalog`
(uses the same `harvestCatalog()` core).

---

## 7. Carried-over gotchas (reuse, don't rediscover)

- **Android identity = (brand, model_name, storage, color).** Model code + carrier are coarse attributes
  that collapse to one product_model; carrier lives per-unit on `items`, not on product_models.
- **Storage** stored as `"<n>GB"` **text**; `ram_gb`/`year`… `ram_gb` is TEXT, `screen_size` is NUMERIC,
  `year` is INT. Most JP carrier titles **omit storage** → those rows land storage NULL (flagged, never
  guessed). `color` is NOT NULL in product_models → skip color-less parses.
- **Never guess specs/colors.** Unverified colors stay null and promote as the Japanese token via
  `coalesce(color_en, color_ja)`; unknown specs leave `spec_known=false`.
- **Legacy COMPUTER miscategorization:** older brands often have a few `product_models` rows wrongly
  set `device_category='COMPUTER'` with dirty names and no specs. Before/with the fill-gaps, check:
  ```sql
  SELECT status, count(*) FROM public.product_models
  WHERE model_name ILIKE '%<brand>%' AND device_category='COMPUTER' GROUP BY status;
  ```
  Reconcile inline if few (recategorize→ANDROID, canonicalize name, enrich, normalize storage, merge
  dups via `superseded_by`, repoint items). `items` link to product_models via `items.product_id`.
- **Idempotency:** harvest upserts ON CONFLICT(sku_key); fill-gaps uses NOT-EXISTS guards → both safe to
  re-run. The harvest converges (stops a section after 2 dry pages).
- **Integrity guard:** partial `UNIQUE (brand, model_name, storage_gb, color) WHERE
  device_category='ANDROID' AND status='ACTIVE'` (created by the Galaxy op; `IF NOT EXISTS` in each
  later op makes it a no-op).
