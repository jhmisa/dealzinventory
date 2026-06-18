# Sell-Group Rich Description Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the messaging AI's sell-group (G-code) offers show the same rich, category-aware spec line as P-code items, by sourcing specs from a representative AVAILABLE member item and reusing `getItemDescription`.

**Architecture:** The AI-only RPC `search_available_sell_groups` is widened to return spec fields (`COALESCE(rep.<field>, pm.<field>)` from a representative member item) plus `category_description_fields`. `inventory-search.ts` then builds the group description via the existing `getItemDescription` builder — dropping the old `(N available)` suffix (the count stays on the structured `available_count` field).

**Tech Stack:** Supabase Postgres (plpgsql RPC), Deno Edge Functions (TypeScript), Deno test runner.

---

## File Structure

- **Create:** `supabase/migrations/20260619000000_sell_groups_rich_description.sql` — drops & recreates the RPC with spec columns + rep-member lateral join.
- **Modify:** `supabase/functions/_shared/inventory-search.ts` — widen `RawSellGroupRow`, build rich group description, drop suffix.
- **Modify:** `supabase/functions/_shared/inventory-search.test.ts` — add group rich-description test.

---

## Task 1: Migration — rich `search_available_sell_groups` RPC

**Files:**
- Create: `supabase/migrations/20260619000000_sell_groups_rich_description.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260619000000_sell_groups_rich_description.sql` with exactly this content:

```sql
-- search_available_sell_groups: add rich spec fields + category_description_fields so the
-- messaging AI renders G-code offers with the SAME description as P-code items. Specs are
-- sourced from a representative AVAILABLE member item (COALESCE(rep.<field>, pm.<field>)),
-- mirroring the item RPC (20260430100007) and the frontend getSellGroupDescription.
-- RETURNS TABLE shape changes, so the function must be dropped and recreated.
DROP FUNCTION IF EXISTS search_available_sell_groups(text, int, text, uuid, numeric, numeric);

CREATE OR REPLACE FUNCTION search_available_sell_groups(
  search_query text,
  result_limit int DEFAULT 20,
  filter_brand text DEFAULT NULL,
  filter_category_id uuid DEFAULT NULL,
  price_min numeric DEFAULT NULL,
  price_max numeric DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  sell_group_code text,
  condition_grade text,
  effective_price numeric,
  available_count integer,
  brand text,
  model_name text,
  hero_media_url text,
  model_number text,
  storage_gb text,
  ram_gb text,
  cpu text,
  gpu text,
  screen_size numeric,
  color text,
  os_family text,
  year integer,
  battery_health_pct integer,
  is_unlocked boolean,
  has_touchscreen boolean,
  category_description_fields text[]
) AS $$
BEGIN
  RETURN QUERY
  WITH groups AS (
    SELECT
      sg.id,
      sg.sell_group_code,
      sg.condition_grade::text AS condition_grade,
      pm.brand,
      pm.model_name,
      pm.category_id,
      GREATEST(0, COALESCE(MIN(i.selling_price), 0) - COALESCE(sg.discount_amount, 0)) AS effective_price,
      COUNT(i.id)::int AS available_count,
      (SELECT pmed.file_url FROM product_media pmed
        WHERE pmed.product_id = pm.id
        ORDER BY CASE WHEN pmed.role = 'hero' THEN 0 ELSE 1 END, pmed.sort_order
        LIMIT 1) AS hero_media_url,
      COALESCE(rep.model_number, pm.model_number) AS model_number,
      COALESCE(rep.storage_gb, pm.storage_gb) AS storage_gb,
      COALESCE(rep.ram_gb, pm.ram_gb) AS ram_gb,
      COALESCE(rep.cpu, pm.cpu) AS cpu,
      COALESCE(rep.gpu, pm.gpu) AS gpu,
      COALESCE(rep.screen_size, pm.screen_size) AS screen_size,
      COALESCE(rep.color, pm.color) AS color,
      COALESCE(rep.os_family, pm.os_family) AS os_family,
      COALESCE(rep.year, pm.year) AS year,
      rep.battery_health_pct AS battery_health_pct,
      COALESCE(rep.is_unlocked, pm.is_unlocked) AS is_unlocked,
      COALESCE(rep.has_touchscreen, pm.has_touchscreen) AS has_touchscreen,
      (SELECT c.description_fields FROM categories c
        WHERE c.id = COALESCE(rep.category_id, pm.category_id)
        LIMIT 1) AS category_description_fields
    FROM sell_groups sg
    JOIN product_models pm ON pm.id = sg.product_id
    JOIN sell_group_items sgi ON sgi.sell_group_id = sg.id
    JOIN items i ON i.id = sgi.item_id AND i.item_status = 'AVAILABLE'
    LEFT JOIN LATERAL (
      SELECT i2.*
      FROM sell_group_items sgi2
      JOIN items i2 ON i2.id = sgi2.item_id AND i2.item_status = 'AVAILABLE'
      WHERE sgi2.sell_group_id = sg.id
      ORDER BY i2.item_code
      LIMIT 1
    ) rep ON true
    WHERE sg.active = true
      AND (filter_brand IS NULL OR pm.brand ILIKE filter_brand)
      AND (filter_category_id IS NULL OR pm.category_id = filter_category_id)
      AND (
        search_query IS NULL OR search_query = '' OR (
          sg.sell_group_code ILIKE '%' || search_query || '%'
          OR pm.brand ILIKE '%' || search_query || '%'
          OR pm.model_name ILIKE '%' || search_query || '%'
          OR CONCAT_WS(' ', pm.brand, pm.model_name) ILIKE '%' || search_query || '%'
        )
      )
    GROUP BY sg.id, sg.sell_group_code, sg.condition_grade, sg.discount_amount,
             pm.id, pm.brand, pm.model_name, pm.category_id,
             rep.model_number, pm.model_number, rep.storage_gb, pm.storage_gb,
             rep.ram_gb, pm.ram_gb, rep.cpu, pm.cpu, rep.gpu, pm.gpu,
             rep.screen_size, pm.screen_size, rep.color, pm.color,
             rep.os_family, pm.os_family, rep.year, pm.year,
             rep.battery_health_pct, rep.is_unlocked, pm.is_unlocked,
             rep.has_touchscreen, pm.has_touchscreen, rep.category_id
  )
  SELECT g.id, g.sell_group_code, g.condition_grade, g.effective_price, g.available_count,
         g.brand, g.model_name, g.hero_media_url,
         g.model_number, g.storage_gb, g.ram_gb, g.cpu, g.gpu, g.screen_size,
         g.color, g.os_family, g.year, g.battery_health_pct,
         g.is_unlocked, g.has_touchscreen, g.category_description_fields
  FROM groups g
  WHERE (price_min IS NULL OR g.effective_price >= price_min)
    AND (price_max IS NULL OR g.effective_price <= price_max)
  ORDER BY
    CASE WHEN search_query IS NOT NULL AND search_query != '' AND g.sell_group_code ILIKE search_query THEN 0 ELSE 1 END,
    g.sell_group_code
  LIMIT result_limit;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION search_available_sell_groups(text, int, text, uuid, numeric, numeric)
  TO anon, authenticated, service_role;
```

- [ ] **Step 2: Apply the migration**

Run: `supabase db push`
Expected: migration `20260619000000_sell_groups_rich_description` applies cleanly, no "must appear in GROUP BY" error.

- [ ] **Step 3: Smoke-test the RPC returns spec fields**

Run (via Supabase MCP `execute_sql` or psql):
```sql
SELECT sell_group_code, brand, model_name, storage_gb, ram_gb, cpu, color,
       os_family, category_description_fields, available_count
FROM search_available_sell_groups('', 5, NULL, NULL, NULL, NULL);
```
Expected: rows return with populated spec columns (where member items have them) and a `category_description_fields` array for groups whose category configures it. No SQL error.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260619000000_sell_groups_rich_description.sql
git commit -m "feat(ai): sell-group search RPC returns rich spec fields"
```

---

## Task 2: Rich group description in `inventory-search.ts`

**Files:**
- Modify: `supabase/functions/_shared/inventory-search.ts`
- Test: `supabase/functions/_shared/inventory-search.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `supabase/functions/_shared/inventory-search.test.ts`:

```ts
Deno.test('mapInventoryResults builds rich sell-group description, no available-count suffix', () => {
  const groups: RawSellGroupRow[] = [{
    id: 'g9', sell_group_code: 'G000099', condition_grade: 'B', effective_price: 15900,
    available_count: 3, brand: 'Toshiba', model_name: 'Dynabook K50',
    hero_media_url: 'https://cdn/g99.jpg',
    ram_gb: '8GB', storage_gb: '128GB', cpu: 'Intel Celeron N4020 1.1GHz',
    gpu: 'Intel UHD Graphics 600', screen_size: 10.1, color: 'Silver', os_family: 'Windows 11',
    category_description_fields: ['brand', 'model_name', 'ram_gb', 'storage_gb', 'cpu', 'gpu', 'screen_size', 'color', 'os_family'],
  }];
  const out = mapInventoryResults([], groups, 'https://dealzinventory.vercel.app');
  const group = out.find((r) => r.code === 'G000099')!;
  assertEquals(
    group.description,
    'Toshiba Dynabook K50 8GB 128GB Intel Celeron N4020 1.1GHz Intel UHD Graphics 600 10.1" Silver Windows 11',
  );
  assertEquals(group.description.includes('available'), false);
  assertEquals(group.available_count, 3);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test supabase/functions/_shared/inventory-search.test.ts --allow-env --no-check`
Expected: the new test FAILS — current code produces `"Toshiba Dynabook K50 (3 available)"`, so the description assertion fails.

- [ ] **Step 3: Widen `RawSellGroupRow`**

In `supabase/functions/_shared/inventory-search.ts`, replace the `RawSellGroupRow` interface (currently lines ~35-44):

```ts
export interface RawSellGroupRow {
  id: string;
  sell_group_code: string;
  condition_grade: string | null;
  effective_price: number | null;
  available_count: number | null;
  brand: string | null;
  model_name: string | null;
  hero_media_url: string | null;
  // Spec fields returned by search_available_sell_groups — sourced from a representative
  // AVAILABLE member item (COALESCE with product_model) so the group description matches
  // the rich, category-aware P-code item description and the frontend getSellGroupDescription.
  model_number?: string | null;
  storage_gb?: string | null;
  ram_gb?: string | null;
  cpu?: string | null;
  gpu?: string | null;
  screen_size?: number | null;
  color?: string | null;
  os_family?: string | null;
  year?: number | null;
  battery_health_pct?: number | null;
  is_unlocked?: boolean | null;
  has_touchscreen?: boolean | null;
  category_description_fields?: string[] | null;
}
```

- [ ] **Step 4: Build the rich group description (drop the suffix)**

In the same file, replace the `groupResults` mapping (currently lines ~131-144):

```ts
  const groupResults: InventorySearchResult[] = groups.map((g) => {
    const desc = getItemDescription(
      g as unknown as Record<string, unknown>,
      null,
      g.category_description_fields ?? null,
    ) || [g.brand, g.model_name].filter(Boolean).join(' ') || '—';
    return {
      type: 'sell_group' as const,
      code: g.sell_group_code,
      description: desc,
      grade: g.condition_grade,
      price: g.effective_price,
      available_count: g.available_count ?? 0,
      thumbnail_url: g.hero_media_url,
      display_url: g.hero_media_url,
      order_url: buildOrderUrl(base, g.sell_group_code),
    };
  });
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `deno test supabase/functions/_shared/inventory-search.test.ts --allow-env --no-check`
Expected: all tests PASS, including the new group rich-description test and the existing 3.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/inventory-search.ts supabase/functions/_shared/inventory-search.test.ts
git commit -m "feat(ai): assemble rich sell-group description, drop (N available) suffix"
```

---

## Task 3: Deploy edge functions

**Files:** none (deploy only)

- [ ] **Step 1: Deploy both functions that bundle inventory-search.ts**

Run: `supabase functions deploy generate-pending-drafts test-ai-reply`
Expected: both functions deploy successfully.

- [ ] **Step 2: Hand off to Joey for Playground verification**

STOP here. Ask Joey to verify a G-code offer renders the rich spec line (no `(N available)`) in the AI Test Playground. Do NOT bump version or push until Joey confirms.

---

## Task 4: Version bump & push (AFTER Joey verifies)

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Bump version**

In `package.json`, change `"version": "1.50.0"` to `"version": "1.51.0"`.

- [ ] **Step 2: Commit & push**

```bash
git add package.json
git commit -m "chore: bump version to 1.51.0 — rich sell-group AI offers"
git push origin main
```

---

## Notes

- **Deno test flags:** existing tests in this repo run with `deno test`. Use `--allow-env --no-check` if the runner complains about env access or cross-file type-checking; the assertions are the source of truth.
- **GROUP BY:** the `rep.*` and matching `pm.*` columns are all listed in the `GROUP BY` because the CTE aggregates (`MIN`/`COUNT`). If `db push` raises "column must appear in the GROUP BY clause", add the named column there.
- **Consistency:** the resulting AI group description should equal what `src/lib/utils.ts` `getSellGroupDescription` produces for the same group — same builder, same rep-member, same `description_fields`.
