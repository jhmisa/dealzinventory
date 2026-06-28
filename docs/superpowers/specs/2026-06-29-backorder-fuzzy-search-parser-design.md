# Design — Reliable "Add Backorder": fuzzy product-model search, robust iosys parser, spec enrichment

**Date:** 2026-06-29
**Status:** Approved (design), pending implementation plan
**Goal:** A dependable "Add Backorder" flow — paste an iosys URL → correct color/grade/specs parsed → existing product model found via fuzzy search (regardless of formatting/locale) → or safely created → per-unit included accessories stored.

---

## Background & evidence (all reproduced against the live system)

The "Add Backorder" dialog (`src/components/backorders/add-backorder-dialog.tsx`) lets staff paste a supplier (iosys) URL, parse it, map it to a `product_models` row, pick a supplier, curate photos, and create a backorder line (B-code). Two user-reported failures were investigated and reproduced:

1. **Product-model picker finds nothing** — even for bare `SONY Xperia10`.
2. **Wrong/empty color & specs on Fetch** — e.g. `Xperia10 IV SO-52C ミント` parsed with no color, wrong RAM, grade defaulting to A.

### Confirmed root causes

1. **1000-row cap + load-all + client filter (primary).**
   `product_models` has **2019 rows**. The picker calls `useProductModelsWithHeroImage()` with no search → `getProductModelsWithHeroImage()` selects the whole table with no `.limit`/`.range`, which PostgREST caps at **1000 rows** (`content-range: 0-999/2019`), ordered `brand asc`. The first 1000 start at *Acer, Alldocube…*; **Sony (brand "S") falls past row 1000 and never loads.** Filtering is then 100% client-side (cmdk) over a list that doesn't contain the target. The model exists (verified: `Sony Xperia 10 IV · SO-52C` in Lavender/Mint/White, `color_ja` populated), and the **admin Product Models page finds it** because it uses a server-side RPC (`list_product_color_groups`) with no cap.

2. **Search is separator/locale-sensitive.**
   The existing `list_product_color_groups` RPC (migration `20260628193000`) tokenizes on whitespace and requires each token to match on a **word boundary** (`\m`) inside `brand, model_name, model_number, color, short_description, storages, part_numbers` — **but not `color_ja`**, and it is separator-sensitive. So `Xperia 10` (spaced, English color) works, but **`Xperia10` (glued, as iosys emits), `SO52C` (vs `SO-52C`), and `ミント` (Japanese color) all fail.** These are exactly the user's fuzzy requirements.

3. **iosys parser is Apple-shaped** (`supabase/functions/_shared/supplier-adapters/iosys.ts`).
   - **Color**: regex `/\d+\s*(?:GB|TB)\s+([^【|]+)/` requires `128GB <color>` in the title. The live Sony title is `Xperia10 IV SO-52C ミント【docomo版 SIMフリー】` — **no storage token** → `colorJa` = null → color null. (`ミント` also isn't in the Apple color map.)
   - **Grade**: read from `<p class="condition">`, absent on this page (it's `中古Cランク` elsewhere) → falls back to default **A** (page is **C**).
   - **Specs**: the **full spec table is present in the HTML** (`<div id="spec"><table>`: `OS / CPU: Snapdragon695 / RAM: 6GB / ROM: 128GB / ディスプレイ / カメラ / 通信 / 電波帯 / 外部メモリ / 発売日 / 接続端子`) but the adapter never reads it — only JSON-LD (empty here) + title. Hence bogus RAM and missing storage.

4. **Auto-match misses Android.**
   `findMatchingProductModel` matches Apple `part_number`, then `model_name ilike <cleanName>`. `cleanModelName` only normalizes iPhone/iPad spacing, so `Xperia10 IV SO-52C ミント` is not cleaned and never `ilike`-matches `Xperia 10 IV`. Android needs `model_number` (SO-52C) matching.

5. **Spec data is partially populated.** The SO-52C rows have `ram_gb=6`, `cpu`, `screen_size`, `year`, `color_ja` — but **`storage_gb` is null**, `camera`/`chipset`/`part_number` null. Confirms specs belong canonically on the model, enriched when missing.

---

## Decisions (locked with user)

- **Specs storage:** canonical absolute specs on `product_models`; **enrich missing (null) fields on fetch** from the parsed iosys spec table; never overwrite existing values. Per-unit variable data (grade, color, included accessories, price) lives on the backorder line / item.
- **Create-if-missing:** guided confirm with dedup preview (show near-matches; require explicit "create anyway").
- **Search scope:** build one shared normalized RPC; wire the **Add Backorder picker first**; designed for the intake/items picker and Messages "Search Inventory" to adopt next.
- **Accessories:** raw text on `backorder_lines` and `items` (store iosys `付属品` verbatim, editable).

---

## Workstreams

### A. Server-side fuzzy product-model search (fixes causes 1 & 2)

**New RPC** `public.search_product_models(p_search text, p_category_id uuid DEFAULT NULL, p_limit int DEFAULT 50)` returning **individual** `product_models` rows (the fields the picker renders) + hero image url + media count, **ranked and capped** (bypasses the 1000-row cap).

**Normalization / matching (per token, AND across tokens):**
- Build a haystack: `brand, model_name, model_number, part_number, color, color_ja, short_description, storage_gb`.
- Define `normalize(s)` = lowercase + full-width→half-width fold + strip all whitespace, hyphens, and middle-dots (`・`).
- A token matches if **either** (a) a word-boundary match (`\m`, regex-escaped) on the spaced haystack — precise — **or** (b) `normalize(token)` is a substring of `normalize(haystack)` — tolerant of glued/hyphen/locale forms.
- Result: `Xperia10` = `Xperia 10`, `SO52C` = `SO-52C`, `ミント` (matches `color_ja`), word order irrelevant, extra tokens still constrain.

**Ranking** (best first): exact `model_number`/`part_number` token hit → prefix hit on `model_name` → token coverage → then `brand, model_name, color`. `LIMIT p_limit`.

**Client changes:**
- New hook `useProductModelSearch(query: string)` → calls the RPC (debounced upstream), `enabled: query.length > 0`.
- `ProductPicker` becomes **async server search**: set `cmdk` `shouldFilter={false}`, debounce input ~250ms, render server results. Keep the merged `matchedModel`/selected-row display so an auto-matched off-list row still shows. When `query` is empty, show a small default set (recent/auto-matched) instead of the whole table.
- `getProductModelsWithHeroImage` load-all path is no longer used by the picker. (Left intact for any other callers, but the picker no longer fetches the capped full list.)

### B. Robust iosys parser (fixes cause 3)

In `iosys.ts` `parse()` and `NormalizedSupplierProduct`:
- **`modelNumber`**: extract Japanese carrier model codes (e.g. `SO-52C`, `SC-54D`, `A301SH`) from the title and the URL slug (`xperia10_iv_so-52c`).
- **`colorJa`**: the token before the first `【` (and after the model number), without requiring a storage token. Keep the storage-anchored regex as a secondary strategy for Apple titles.
- **Color map**: `colorJaToEn` consults **both** the Android and Apple color maps (or a merged map). Unknown tokens still fall back to raw Japanese.
- **Grade**: parse `中古([SABCDJ])ランク` / rank badge / spec `状態`, in addition to `<p class="condition">`. Map via existing `RANK_TO_GRADE`.
- **Spec table**: parse `<div id="spec"> … <table>` rows (`<th>label</th><td>value</td>`) into a `specs` object: `os`, `cpu`, `ramGb` (from `RAM`), `storageGb` (from `ROM`), `screenSize` (from `ディスプレイ`), `camera`, `comms` (`通信`), `bands` (`電波帯`), `externalMemory` (`外部メモリ`), `year` (`発売日`), `ports` (`接続端子`). This also corrects `storageGb` and `ramGb`.
- **`includedAccessories`**: parse the `付属品` section (e.g. `箱/マニュアル`) verbatim.

### C. Auto-match + spec enrichment (cause 4 + specs decision)

- `findMatchingProductModel` gains an **Android branch**: when a `model_number` is parsed, match `product_models.model_number = <modelNumber>` + color (`color_ja` or English), ACTIVE. Order of attempts: part_number (Apple) → model_number (Android) → normalized `model_name` + storage/color fallback.
- **Enrichment**: after a model is matched/selected on fetch, if it is missing absolute specs (`storage_gb`, `camera`, `chipset`, `ports`, etc.), fill **only the null fields** from the parsed spec table via an update — never overwrite existing values. Logged in `field_sources`/audit where applicable.

### D. Create-if-missing, guided + dedup (decision)

- When search and auto-match find nothing, the existing "Create Product" panel pre-fills from parsed data (brand, normalized `model_name`, `model_number`, color + `color_ja`, parsed specs).
- **Dedup guard**: before insert, re-run `search_product_models` on brand + model_name + model_number; if near-matches exist, show them and require an explicit "create anyway" (or let staff pick the existing row). Prevents duplicates that merely failed to surface.

### E. Accessories storage (decision)

- Migration: add `included_accessories text NULL` to `backorder_lines` and `items` (follows the existing `ALTER DEFAULT PRIVILEGES` grant setup; RLS unchanged).
- Form: new "Included Accessories" field, prefilled from parsed `付属品`, editable, saved on the backorder line; carried onto the item when the backorder is received.

---

## Verification via /loop (multi-brand)

A repeatable harness that **actually fetches real iosys URLs** for several brands **present in both our Product Models and iosys**, and asserts the end-to-end Add Backorder flow per brand:

- **Brand coverage** (at minimum): Apple **iPhone**, Apple **iPad**, **Sony Xperia** (incl. `SO-52C`), **Samsung Galaxy**, **Sharp AQUOS**, **Google Pixel**. Include formatting variants per the bug: glued vs spaced (`Xperia10` / `Xperia 10`), hyphen vs none (`SO52C` / `SO-52C`), and Japanese color tokens.
- **Per URL, assert:**
  1. Parser returns correct **color** (EN + JA), **grade**, and **specs** (CPU/RAM/storage/screen/camera) matching the live page.
  2. `search_product_models` returns the model for the parsed string **and** for the formatting variants.
  3. `findMatchingProductModel` auto-selects the **correct** row (right model + color).
  4. Missing model specs are enriched (e.g. SO-52C `storage_gb` filled to 128) without overwriting existing values.
  5. `付属品` is captured into `included_accessories`.
- Iterate with `/loop` until all brands are green. Watch real fetches to catch per-brand title/spec-table quirks.

---

## Out of scope (this pass)

- Wiring the new search into the intake/items picker and Messages "Search Inventory" (shared RPC is designed for it; adoption is a follow-up).
- Backfilling/cleanup of existing data-quality issues (Japanese leaked into English `color`, typo'd model numbers like `SO-51Aa`) beyond what enrichment touches.
- Structured accessory taxonomy (raw text now; can normalize later).
- Non-iosys supplier adapters.
