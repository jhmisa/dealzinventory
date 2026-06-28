# Spec — Product Models: color-level media + usable list + Apple category backfill

> Date: 2026-06-28 · Status: DRAFT (awaiting Joey's review)
> Related: [[project_list_query_1000_cap]], [[project_backorder_desc_and_dedup]] (open item: backfill category_id on iosys product_models), [[project_android_identifiers]]

## Problem

`Admin → Products → Product Models` is the page where staff attach reusable photos/videos per device model. Today it is unusable for that purpose:

1. **Indistinguishable rows.** The `product_models` catalog (iosys import) stores **one row per SKU** = `(brand, model_name, color, storage_gb, carrier)`. Searching "iphone 15 pro" returns **22 rows** (iPhone 15 Pro + Pro Max × color × storage), all displayed as just `Apple · iPhone 15 Pro`. The distinguishing fields — **color, storage, model/part number** — exist on every row but are not shown. A photographer cannot tell which row to use.
2. **Wasted re-shooting / wrong-row uploads.** A product photo's real identity is **(model + color)** — storage and carrier are not visually distinguishable (storage is internal; only on the box/part number). Yet media is stored per-SKU, so photos uploaded to "256GB Black Titanium" do not appear on the 128/512/1TB Black Titanium SKUs. Staff would have to upload the same set 4× per color.
3. **Missing categories.** The list's "Category" column reads `product_models.category_id` (FK → `categories`), which is null on most rows, so Apple products show "—".

## Goals

- One media set per **(brand, model_name, color)**, uploaded once, shown on every storage/carrier variant of that color — with **zero changes to the 32 read sites, 2 search RPCs, shop, and AI-offer surfaces** that currently read `product_media`.
- Product Models list shows the fields needed to identify a model and is collapsed to one row per color.
- Apple products get correct categories (all Apple lines).

## Non-goals

- Reviving the dormant `photo_groups` / `photo_group_media` subsystem (only referenced, unpopulated, in `mine.ts`).
- Re-keying or re-homing `product_media` (rejected: touches all 34 read sites — high regression risk).
- Categorizing non-Apple inventory. `device_category='COMPUTER'/'TABLET'` are polluted junk drawers (contain Galaxy phones, AirPods, monitors, HP/Asus laptops); this work keys Apple categories on `brand='Apple' + model_name`, and leaves non-Apple uncategorized.

---

## Architecture decision: color-fanout (chosen)

Keep `product_media` keyed by `product_id` (the SKU) so **all existing reads stay untouched**. Treat `(brand, model_name, color)` as the real unit and **physically replicate** each media row to every sibling SKU of that color. Replication is enforced in the database so it holds regardless of write path (admin UI, SQL, future import).

Scale: ~2,801 media rows on 130 SKUs → ~8k rows after fanout. Negligible.

### Color key

Add a stored, indexed grouping key to `product_models`:

```sql
ALTER TABLE public.product_models
  ADD COLUMN color_key text
  GENERATED ALWAYS AS (lower(brand) || '|' || lower(model_name) || '|' || lower(color)) STORED;
CREATE INDEX idx_product_models_color_key ON public.product_models (color_key);
```

(`color` is `NOT NULL`, so the key is always well-formed.) Siblings = rows sharing `color_key`. No "anchor" column is needed — fanout matches on `color_key` and dedups on `file_url`.

### Fanout triggers (recursion-guarded via `pg_trigger_depth()`)

A single trigger function on `product_media` (AFTER INSERT/UPDATE/DELETE). It only acts at `pg_trigger_depth() = 1`; the cascaded sibling writes run at depth ≥ 2 and are skipped, preventing recursion. Matching is by `file_url` within the color group.

- **INSERT** (depth 1): for every sibling SKU sharing the new row's `color_key` that does **not** already have a row with this `file_url`, insert a copy of `(file_url, media_type, role, sort_order)`.
- **DELETE** (depth 1): delete sibling rows in the same color group with the same `file_url`.
- **UPDATE** (depth 1, e.g. reorder / role change): propagate the changed `sort_order` / `role` to sibling rows matched by `OLD.file_url`. (Editing `file_url` itself is not a supported operation; uploads create new rows.)

A second trigger on `product_models` (AFTER INSERT): when a new SKU is added (e.g. a new storage variant from an import), copy the full media set of any existing sibling in its `color_key` group to the new row — so new variants inherit the color's media automatically.

### Backfill migration

For each `color_key` group: compute the canonical set = the union of all sibling media, deduped by `file_url` (keeping the smallest `sort_order`, and `role='hero'` if any sibling marked it hero). Then ensure **every** sibling SKU has exactly that set (insert missing `file_url`s per sibling). This both fixes existing inconsistencies (color where only one storage had photos) and establishes the invariant the triggers maintain. Idempotent (safe to re-run).

> Invariant after migration: all SKUs sharing a `color_key` have the identical set of `product_media` (same `file_url`s, `role`, `sort_order`).

---

## List page redesign (`src/pages/admin/products.tsx`)

Collapse from per-SKU to **one row per color group**, via a new RPC (also fixes the silent 1,000-row cap the current full-table fetch hits — 1,031 models > 1,000; see [[project_list_query_1000_cap]]).

### New RPC: `list_product_color_groups`

Returns one row per `color_key`:

| field | source |
|---|---|
| `representative_id` | a deterministic SKU id in the group (MIN storage_gb numeric, then id) — used for the row link |
| `category_id`, `category_name` | from the group (consistent within a model) |
| `brand`, `model_name`, `color` | group keys |
| `storages` | sorted distinct `storage_gb` in the group, e.g. `["128GB","256GB","512GB","1024GB"]` |
| `sku_count` | number of SKUs in the group |
| `photo_count`, `video_count` | counts on the representative SKU (equal across siblings post-invariant) |
| `short_description` | the group's shared description |

Supports the existing filters server-side: text search (`brand`/`model_name`/`color`/`storage`), `category_id`, and `no-photo`/`no-video` media filter.

### Columns

`Category · Brand · Model · Color · Storage · Description · Photos · Videos`

- **Color** — the key new field that makes rows identifiable.
- **Storage** — rolled-up coverage, e.g. `128 / 256 / 512GB · 1TB` (formats `1024GB`→`1TB`).
- **Description** — retained (color-level shared description) per the "preserve all elements" rule; **open question for review:** Color + Storage may make Description redundant — keep or drop?
- **Photos / Videos** — shared counts, red when 0 (unchanged styling).
- Row click → detail for the color group via `representative_id`.

Search placeholder updated to mention color/storage. Category + Media filters unchanged in behavior.

---

## Detail page (`src/pages/admin/product-detail.tsx` / media studio)

- Operates on the color group through the representative SKU id from the URL. Any deep-linked sibling SKU is fine — it shows the shared set.
- Header: `Apple iPhone 15 Pro · Black Titanium` with a subline listing storages covered (e.g. "128GB · 256GB · 512GB · 1TB — one media set shared across all").
- Add Photo / Add Video / Delete / Reorder: **unchanged code path** (`addProductMedia` / `deleteProductMedia` / `reorderProductMedia` in `src/services/product-models.ts`). The DB triggers fan the change to siblings. The only adjustment is copy/labelling to make clear the set is shared per color.
- Category field becomes editable here (already part of the product form) so staff can correct categories going forward.

---

## Category backfill (all Apple lines)

Idempotent migration keyed on `brand='Apple'` + `model_name` (NOT `device_category`). For each line, find-or-create the category by case-insensitive name (reuse existing rows; create with the canonical name only if absent), then set `category_id` on **all** matching Apple rows (overwrite included — the `model_name` mapping is authoritative for Apple, and overwriting corrects any earlier miscategorization). Re-running yields no changes.

Mapping (longest prefix first), with expected counts:

| `model_name` prefix (case-insensitive) | category | expected rows |
|---|---|---|
| `iPhone` | iPhone | 452 |
| `iPad Pro` | iPad Pro | 96 |
| `iPad Air` | iPad Air | 56 |
| `iPad mini` | iPad mini | 37 |
| `iPad` (other) | iPad | 63 |
| `MacBook Air` | MacBook Air | 5 |
| `MacBook Pro` | MacBook Pro | 10 |
| `MacBook` (other) | MacBook | 2 |
| `iMac` | iMac | 4 |
| `Mac mini` | Mac mini | 1 |
| `Apple Watch` / `Watch` | Apple Watch | 15 |
| `AirPods Pro` | AirPods Pro | 2 |
| `AirPods` (other) | AirPods | 3 |

Total: **746** Apple rows categorized. `device_category` is left as-is (separate concern).

> **Open question for review:** category granularity. The table above uses finer categories (iPad Pro/Air/mini distinct; MacBook Air/Pro distinct), matching the chosen "All Apple lines" option. If you'd prefer coarser buckets (single "iPad", single "Mac"), say so and the mapping collapses accordingly. Also confirm the canonical names above match your existing `categories` rows (the migration reuses case-insensitively, but exact spelling avoids accidental new categories).

---

## Affected files / surfaces

**New:**
- `supabase/migrations/<ts>_product_color_key_and_media_fanout.sql` — `color_key` column + index, fanout trigger fn + triggers, backfill.
- `supabase/migrations/<ts>_list_product_color_groups_rpc.sql` — list RPC.
- `supabase/migrations/<ts>_backfill_apple_categories.sql` — category find-or-create + assignment.

**Changed:**
- `src/pages/admin/products.tsx` — column set + RPC-backed data source + storage formatter.
- `src/services/product-models.ts` — add `getProductColorGroups()` (calls RPC); `getProductModels` left for other callers (`findMatchingProductModel`, hero-image, detail) which stay SKU-keyed.
- `src/hooks/use-product-models.ts` — `useProductColorGroups()`.
- `src/pages/admin/product-detail.tsx` — header/labelling for the shared-per-color set.
- `src/lib/types.ts` — `ProductColorGroup` type.

**Unchanged (verified — no edits):** all 32 `product_media` read-embed sites, `search_available_inventory`, `search_available_sell_groups`, shop pages, orders/returns/sell-groups/offers/showcase/social services, edge `inventory-search`.

## Testing / verification

- Migration applies cleanly; backfill makes siblings identical (assert: per `color_key`, all SKUs have equal `file_url` sets).
- Trigger round-trip: insert one photo on a 256GB SKU → appears on 128/512/1TB siblings; delete → removed from all; reorder → order matches on all; no infinite recursion.
- New-SKU inheritance: insert a new storage variant for an existing color → it gets the color's media.
- List shows one row per color with correct Color/Storage/counts; search by color & storage works; media filters work; row count < 1000 (cap fixed).
- Shop/offer/AI surfaces still render media for every storage variant (spot-check a color that previously had photos on only one SKU).
- Category backfill: 746 Apple rows categorized with expected per-line counts; re-running is a no-op.

## Rollout

- Apply migrations via CLI (auto). Bump `package.json` once. Update `PROJECT_STATE.md`. Deploy via `push-to-main`.
- Reversibility: fanout is additive (extra rows) + triggers; can be disabled by dropping triggers. Category backfill is an `UPDATE` (reversible by setting affected rows' `category_id` back to null if needed).
