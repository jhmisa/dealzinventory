# Sell-Group (G-code) Rich Description for the Messaging AI — Design

**Date:** 2026-06-19
**Status:** Approved (design)
**Current version:** 1.50.0

## Problem

In the messaging AI's inventory search, P-code **items** show a full, category-aware
spec line (e.g. `Toshiba Dynabook K50 8GB 128GB Intel Celeron N4020 1.1GHz Intel UHD
Graphics 600 10.1" Silver Windows 11`), but G-code **sell groups** show only
`brand model_name (N available)` (e.g. `Iris Ohyama LUCA Tablet TM101 (1 available)`).

This is inconsistent with both the item offers and the frontend, which already renders
rich group descriptions via `getSellGroupDescription` (src/lib/utils.ts) by picking a
representative member item and delegating to `getItemDescription`.

## Goal

Make AI sell-group offers use the same rich spec description as items, by sourcing spec
fields from a representative AVAILABLE member item and reusing the existing
`getItemDescription` builder. The `(N available)` suffix is **dropped** — the group's 📝
line shows only the rich spec, stylistically identical to a P-code item offer. The stock
count remains available to the model as the structured `available_count` field on the
search result; it is simply no longer appended to the description text.

## Non-goals

- No frontend changes. The RPC `search_available_sell_groups` is AI-only (the frontend
  uses its own query + `getSellGroupDescription`). This change aligns the AI path with the
  frontend, but touches only the AI path.
- No signature change to the RPC (keeps the 6-arg form so callers/tests don't break).
- No change to item offers, the offer-reply assembly, or the `{{OFFER:CODE}}` token flow.

## Architecture & data flow

```
search_available_sell_groups RPC  (Postgres)
   │  now also returns spec fields (COALESCE rep-member, product_model)
   │  + category_description_fields
   ▼
runInventorySearch → mapInventoryResults  (inventory-search.ts)
   │  groupResults: getItemDescription(g, null, g.category_description_fields)
   ▼
InventorySearchResult { description: <rich spec>, available_count: N, ... }
   ▼
generate-pending-drafts / test-ai-reply  (both bundle inventory-search.ts)
```

## Changes

### 1. Migration — `supabase/migrations/<new_ts>_sell_groups_rich_description.sql`

- `DROP FUNCTION IF EXISTS search_available_sell_groups(text, int, text, uuid, numeric, numeric);`
  (RETURNS TABLE shape changes, so `CREATE OR REPLACE` is insufficient.)
- Recreate the function. Inside the `groups` CTE, add a representative-member lateral join:

  ```sql
  LEFT JOIN LATERAL (
    SELECT i2.*
    FROM sell_group_items sgi2
    JOIN items i2 ON i2.id = sgi2.item_id AND i2.item_status = 'AVAILABLE'
    WHERE sgi2.sell_group_id = sg.id
    ORDER BY i2.item_code
    LIMIT 1
  ) rep ON true
  ```

  This mirrors the frontend's "first member item" selection in `getSellGroupDescription`.
- Extend `RETURNS TABLE` and the `SELECT` with, using `COALESCE(rep.<field>, pm.<field>)`
  for each (matching the item RPC pattern in
  `20260430100007_fix_search_inventory_battery_col.sql`):
  `model_number`, `storage_gb`, `ram_gb`, `cpu`, `gpu`, `screen_size`, `color`,
  `os_family`, `year`, `is_unlocked`, `has_touchscreen`.
  `battery_health_pct` is item-only (not on `product_models`) → use `rep.battery_health_pct`.
- Add `category_description_fields`:

  ```sql
  (SELECT c.description_fields FROM categories c
   WHERE c.id = COALESCE(rep.category_id, pm.category_id) LIMIT 1) AS category_description_fields
  ```

- The `LEFT JOIN LATERAL` adds `rep.*` columns referenced in the `groups` CTE `SELECT`.
  Because the existing CTE aggregates (`MIN`, `COUNT`, `GROUP BY`), the `rep.*` spec
  columns must be added to the `GROUP BY` (they are functionally per-group constant from a
  `LIMIT 1` subquery, but Postgres requires them grouped or aggregated). Add the selected
  `rep.*` fields to the `GROUP BY` list alongside the existing `pm.*` columns.
- Re-`GRANT EXECUTE ... TO anon, authenticated, service_role;` (same signature).
- Apply automatically via `supabase db push` (per project convention — never ask).

### 2. `supabase/functions/_shared/inventory-search.ts`

- Widen `RawSellGroupRow` with the new optional/nullable fields:
  `model_number?, storage_gb?, ram_gb?, cpu?, gpu?, screen_size?, color?, os_family?,
  year?, battery_health_pct?, is_unlocked?, has_touchscreen?, category_description_fields?`.
- In `groupResults`, replace the basic desc + suffix with:

  ```ts
  const desc = getItemDescription(
    g as unknown as Record<string, unknown>,
    null,
    g.category_description_fields ?? null,
  ) || [g.brand, g.model_name].filter(Boolean).join(' ') || '—';
  // description: desc   (no "(N available)" suffix — count stays in available_count)
  ```

- `available_count` field on the result is unchanged (`g.available_count ?? 0`).
- `getItemDescription` import already present.

### 3. Test — `supabase/functions/_shared/inventory-search.test.ts`

- Add a `Deno.test` for a group rich-description, mirroring the existing Toshiba item test:
  a `RawSellGroupRow` with spec fields + `category_description_fields`, assert the resulting
  group's `description` equals the rich spec string and contains no `(N available)` suffix.

### 4. Deploy & verify

- `supabase functions deploy generate-pending-drafts test-ai-reply` (both bundle
  inventory-search.ts).
- Joey verifies a G-code offer in the AI Test Playground.
- After verification: minor version bump (1.50.0 → 1.51.0), commit, push to main.

## Risks / watch-outs

- **RETURNS TABLE change requires DROP first** — `CREATE OR REPLACE` errors on column-shape
  changes. Handled by the explicit `DROP FUNCTION IF EXISTS`.
- **GROUP BY** must include the new `rep.*` columns, or Postgres raises
  "column must appear in GROUP BY". Verify after `db push`.
- **Consistency check:** the AI group description should equal what `getSellGroupDescription`
  produces for the same group (same builder, same rep-member, same description_fields).
- Existing test #1 (`...merges items + sell groups...`) does not assert the group
  description, so dropping the suffix won't break it.

## Decision log

- **2026-06-19:** Drop the `(N available)` suffix from the group 📝 line (Joey). Stock count
  remains on the structured `available_count` field.
