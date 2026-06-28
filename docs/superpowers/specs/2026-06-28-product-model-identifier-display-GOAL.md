# GOAL — Product Models list: show + search Model# / Part# at SKU granularity

> Status: GOAL captured 2026-06-28 (awaiting work). Owner: Joey. Builds directly on the shipped
> color-grouped list + color-fanout media (v1.63.0, see [[project_product_color_fanout_media]] and
> spec `2026-06-28-product-models-color-media-and-category.md`).
> **NEXT ACTION after /clear: propose 3 UI options (with a recommendation), get Joey's pick, THEN implement.**
> Joey explicitly asked for 3 UI proposals BEFORE implementation, and invited pushback.

## What Joey wants

The Product Models page (`src/pages/admin/products.tsx`, RPC `list_product_color_groups`) should expose the
real device identifiers (`model_number` = A-number; `part_number` = Apple SKU) and make them searchable.

**Requested columns:**
1. **Category**
2. **Product Model** — a concatenation of **Brand + Model + model# + part# + Color + Storage**, rendered
   **one line per SKU**. If a model/color has 3 storage SKUs → 3 lines in that cell, each line carrying its
   own `part_number` (part# is unique per storage; model# is shared).
3. **Description**
4. **Photos**
5. **Videos**

**Search must be dynamic** — a single search box that matches across the concatenated identifier string:
- `"iPhone 15 256"` → matches (model + storage tokens)
- search by **model#** (`A3089`) → matches
- search by **part#** (`MTMN3J/A`) → matches

## Ground truth (verified data, 2026-06-28)

- `product_models` is SKU-level: one row per (brand, model_name, color, storage_gb, carrier).
- **`model_number` (A-number)** = constant per model line, across ALL colors+storages: iPhone 15 = `A3089`,
  iPhone 15 Pro = `A3101`, iPhone 15 Pro Max = `A3105`.
- **`part_number`** = UNIQUE per (model, color, storage): iPhone 15 Black 128/256/512 = `MTMH3J/A` / `MTMN3J/A` / `MTMU3J/A`.
- So one color group = **1 model# + N part#s** (N = #storages). Data is fully intact at SKU level; the current
  list just doesn't display these fields and rolls storages into one cell (`128GB / 256GB / 512GB`).
- Android note: many Android SKUs have NULL/dirty storage + no part_number (Phase 4-Android accuracy work,
  separate). This identifier-display goal applies cleanly to Apple now; Android rows will show what they have.

## Pushback / design tensions for the 3 UI proposals to resolve

1. **Redundant model#:** model# repeats across a group's lines → show it ONCE at group level, part# per line.
2. **Grouping granularity (the core fork):**
   - (A) Keep one row per color; "Product Model" cell = multi-line, one line per storage SKU (model# once + part# per line). Photos/Videos = shared per-color count (one value per row). *This honors the literal request + keeps media shared.*
   - (B) Flat: one row per SKU (un-group storage); each row single-line with its own part#. Simpler search/sort, but media count repeats on every storage row (visually noisy) and reverses the collapse.
   - (C) Expandable master row per color (collapsed shows model#, color, storage range, counts) that expands to per-storage lines with part#s. Best density, more interaction.
3. **Photos/Videos placement** when the cell is multi-line (counts are per color, not per storage).
4. **Description** — per-row (shared) vs per-line. Likely shared per color/model.
5. **Data shape:** `list_product_color_groups` currently returns `storages text[]` + counts. To show
   per-storage part#, extend the RPC to return a JSON array of `{storage_gb, part_number}` (and `model_number`
   at group level), and widen the search WHERE to also match `model_number` / `part_number` (join the group's SKUs).
6. **Search semantics:** multi-token AND match across the concatenated string (brand+model+model#+part#+color+storage),
   so "iPhone 15 256" and "A3089" and "MTMN3J/A" all hit. Decide token splitting + whether a matching SKU line
   should be highlighted/filtered within the cell.

## Deliverable sequence (after /clear)
1. Propose **3 UI options** (mockups/sketches) with tradeoffs + a recommendation (use the Visual Companion or
   ASCII mockups). Get Joey's pick.
2. Spec the chosen option (RPC change + search + cell rendering).
3. Implement (extend RPC, update `products.tsx`, search), verify via `supabase db query --linked`, ship.
