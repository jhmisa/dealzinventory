# Product Models: color-level media + usable list + Apple category backfill — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `Admin → Products → Product Models` usable by collapsing per-SKU rows to one row per (model + color), sharing one media set across every storage/carrier variant of a color, and categorizing all Apple products.

**Architecture:** Keep `product_media` keyed by SKU so all existing readers are untouched; replicate ("fan out") each media row to sibling SKUs sharing a generated `color_key` via DB triggers (recursion-guarded by `pg_trigger_depth()`). The admin list switches to a grouping RPC. A separate idempotent migration categorizes Apple models by `brand + model_name`.

**Tech Stack:** Supabase Postgres (migrations, triggers, RPC), React 18 + TS + Vite, TanStack Query, shadcn DataTable.

**Spec:** `docs/superpowers/specs/2026-06-28-product-models-color-media-and-category.md`

---

## Conventions for every DB task

- **Apply** each migration by (a) writing the `.sql` file under `supabase/migrations/` AND (b) applying it to the linked remote DB via the Supabase MCP tool `mcp__supabase__apply_migration` (name = filename without extension, query = file contents). This both records migration history and keeps the file in the repo for `supabase db push`.
- **Verify** with `mcp__supabase__execute_sql`. If the MCP is not authenticated in the session, run `ToolSearch` for `select:mcp__supabase__authenticate` and complete auth first.
- All SQL is idempotent (`IF NOT EXISTS` / `CREATE OR REPLACE` / `NOT EXISTS` guards) so re-running is safe.

## File map

**New migrations (`supabase/migrations/`):**
- `20260628120000_product_color_key.sql` — `color_key` generated column + index
- `20260628120100_product_media_fanout_triggers.sql` — fanout trigger fn + trigger on `product_media`
- `20260628120200_product_color_media_inherit_trigger.sql` — inherit trigger fn + trigger on `product_models`
- `20260628120300_backfill_product_color_media.sql` — one-time media backfill to establish the invariant
- `20260628120400_list_product_color_groups_rpc.sql` — list RPC
- `20260628120500_backfill_apple_categories.sql` — Apple category find-or-create + assignment

**Changed (frontend):**
- `src/lib/database.types.ts` — regenerated (adds `color_key`, the RPC)
- `src/services/product-models.ts` — add `ProductColorGroup` type + `getProductColorGroups()`
- `src/hooks/use-product-models.ts` — add `useProductColorGroups()`
- `src/pages/admin/products.tsx` — RPC-backed grouped list + new columns
- `src/pages/admin/product-detail.tsx` — "shared across variants" clarifying copy

---

## Task 1: `color_key` generated column

**Files:** Create `supabase/migrations/20260628120000_product_color_key.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- Group key for sibling SKUs that share visual identity (brand + model + color).
-- color is NOT NULL, so the key is always well-formed.
ALTER TABLE public.product_models
  ADD COLUMN IF NOT EXISTS color_key text
  GENERATED ALWAYS AS (lower(brand) || '|' || lower(model_name) || '|' || lower(color)) STORED;

CREATE INDEX IF NOT EXISTS idx_product_models_color_key
  ON public.product_models (color_key);
```

- [ ] **Step 2: Apply** via `mcp__supabase__apply_migration` (name `20260628120000_product_color_key`).

- [ ] **Step 3: Verify** with `execute_sql`:

```sql
SELECT color_key FROM public.product_models
WHERE brand='Apple' AND model_name='iPhone 15 Pro' AND color='Black Titanium' LIMIT 1;
```
Expected: one row, `color_key = 'apple|iphone 15 pro|black titanium'`.

```sql
-- iPhone 15 Pro Black Titanium should have 4 sibling SKUs (128/256/512/1024GB)
SELECT count(*) FROM public.product_models WHERE color_key='apple|iphone 15 pro|black titanium';
```
Expected: `4`.

---

## Task 2: Fan-out trigger on `product_media`

**Files:** Create `supabase/migrations/20260628120100_product_media_fanout_triggers.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- Replicate every product_media change to all sibling SKUs sharing color_key.
-- Recursion guard: only the top-level write (depth 1) fans out; the cascaded
-- sibling writes run at depth >= 2 and return early. Matching is by file_url.
CREATE OR REPLACE FUNCTION public.fanout_product_media()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_color_key text;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF (TG_OP = 'INSERT') THEN
    SELECT color_key INTO v_color_key FROM public.product_models WHERE id = NEW.product_id;
    IF v_color_key IS NULL THEN RETURN NEW; END IF;
    INSERT INTO public.product_media (product_id, file_url, media_type, role, sort_order)
    SELECT pm.id, NEW.file_url, NEW.media_type, NEW.role, NEW.sort_order
    FROM public.product_models pm
    WHERE pm.color_key = v_color_key
      AND pm.id <> NEW.product_id
      AND NOT EXISTS (
        SELECT 1 FROM public.product_media x
        WHERE x.product_id = pm.id AND x.file_url = NEW.file_url
      );
    RETURN NEW;

  ELSIF (TG_OP = 'UPDATE') THEN
    SELECT color_key INTO v_color_key FROM public.product_models WHERE id = NEW.product_id;
    IF v_color_key IS NULL THEN RETURN NEW; END IF;
    UPDATE public.product_media x
      SET sort_order = NEW.sort_order, role = NEW.role
    FROM public.product_models pm
    WHERE x.product_id = pm.id
      AND pm.color_key = v_color_key
      AND x.product_id <> NEW.product_id
      AND x.file_url = OLD.file_url;
    RETURN NEW;

  ELSE -- DELETE
    SELECT color_key INTO v_color_key FROM public.product_models WHERE id = OLD.product_id;
    IF v_color_key IS NULL THEN RETURN OLD; END IF;
    DELETE FROM public.product_media x
    USING public.product_models pm
    WHERE x.product_id = pm.id
      AND pm.color_key = v_color_key
      AND x.product_id <> OLD.product_id
      AND x.file_url = OLD.file_url;
    RETURN OLD;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_fanout_product_media ON public.product_media;
CREATE TRIGGER trg_fanout_product_media
AFTER INSERT OR UPDATE OR DELETE ON public.product_media
FOR EACH ROW EXECUTE FUNCTION public.fanout_product_media();
```

- [ ] **Step 2: Apply** via `mcp__supabase__apply_migration`.

- [ ] **Step 3: Verify round-trip (insert → fan-out → delete)** with `execute_sql`. Use a throwaway color group that currently has no media, e.g. iPhone 15 Pro White Titanium:

```sql
-- pick the 128GB White Titanium SKU as the write target
WITH t AS (
  SELECT id FROM public.product_models
  WHERE color_key='apple|iphone 15 pro|white titanium' AND storage_gb='128GB' LIMIT 1
)
INSERT INTO public.product_media (product_id, file_url, media_type, role, sort_order)
SELECT id, 'TEST_FANOUT_URL', 'image', 'gallery', 0 FROM t;

-- expect: row replicated to ALL White Titanium siblings (3 storages = 3 rows)
SELECT count(*) AS copies FROM public.product_media m
JOIN public.product_models pm ON pm.id=m.product_id
WHERE pm.color_key='apple|iphone 15 pro|white titanium' AND m.file_url='TEST_FANOUT_URL';
```
Expected: `copies` = number of White Titanium SKUs (e.g. `3`), and importantly **> 1** (proves fan-out, no infinite recursion).

```sql
-- delete from one sibling → removed from all
DELETE FROM public.product_media WHERE file_url='TEST_FANOUT_URL'
  AND product_id=(SELECT id FROM public.product_models
    WHERE color_key='apple|iphone 15 pro|white titanium' AND storage_gb='256GB' LIMIT 1);
SELECT count(*) AS remaining FROM public.product_media WHERE file_url='TEST_FANOUT_URL';
```
Expected: `remaining = 0`.

---

## Task 3: New-SKU media inheritance trigger on `product_models`

**Files:** Create `supabase/migrations/20260628120200_product_color_media_inherit_trigger.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- When a new SKU is added (e.g. a new storage variant from an import), copy one
-- existing sibling's media set so the new variant inherits the color's photos.
-- The INSERTs here run at trigger depth 2, so the fan-out trigger skips them.
CREATE OR REPLACE FUNCTION public.inherit_color_media()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.product_media (product_id, file_url, media_type, role, sort_order)
  SELECT NEW.id, m.file_url, m.media_type, m.role, m.sort_order
  FROM public.product_media m
  WHERE m.product_id = (
    SELECT sib.id FROM public.product_models sib
    WHERE sib.color_key = NEW.color_key AND sib.id <> NEW.id
    ORDER BY sib.id LIMIT 1
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.product_media x
    WHERE x.product_id = NEW.id AND x.file_url = m.file_url
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inherit_color_media ON public.product_models;
CREATE TRIGGER trg_inherit_color_media
AFTER INSERT ON public.product_models
FOR EACH ROW EXECUTE FUNCTION public.inherit_color_media();
```

- [ ] **Step 2: Apply** via `mcp__supabase__apply_migration`.

- [ ] **Step 3: Verify** with `execute_sql` (seed one media row on an existing color, insert a fake new sibling SKU, confirm it inherits, then clean up):

```sql
-- seed: put a test photo on the existing iPhone 15 Pro Blue Titanium group
INSERT INTO public.product_media (product_id, file_url, media_type, role, sort_order)
SELECT id, 'TEST_INHERIT_URL', 'image', 'gallery', 0
FROM public.product_models
WHERE color_key='apple|iphone 15 pro|blue titanium' AND storage_gb='128GB' LIMIT 1;

-- insert a NEW sibling SKU (new storage) for the same color
INSERT INTO public.product_models (brand, model_name, color, storage_gb, status, device_category)
VALUES ('Apple','iPhone 15 Pro','Blue Titanium','2048GB','ACTIVE','IPHONE')
RETURNING id;
-- confirm the new SKU inherited the test photo
SELECT count(*) FROM public.product_media m
JOIN public.product_models pm ON pm.id=m.product_id
WHERE pm.storage_gb='2048GB' AND pm.model_name='iPhone 15 Pro' AND m.file_url='TEST_INHERIT_URL';
```
Expected: `1`.

```sql
-- cleanup test rows
DELETE FROM public.product_media WHERE file_url IN ('TEST_INHERIT_URL');
DELETE FROM public.product_models WHERE storage_gb='2048GB' AND model_name='iPhone 15 Pro';
```
Expected: completes without error.

---

## Task 4: Backfill media to siblings (establish invariant)

**Files:** Create `supabase/migrations/20260628120300_backfill_product_color_media.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- One-time: make every SKU in a color group share the union of that group's media.
-- Disable the fan-out trigger during the bulk insert (we insert the full set
-- directly), then re-enable.
ALTER TABLE public.product_media DISABLE TRIGGER trg_fanout_product_media;

WITH canonical AS (
  -- one representative row per (color_key, file_url); prefer a hero, then lowest sort_order
  SELECT DISTINCT ON (pm.color_key, m.file_url)
    pm.color_key, m.file_url, m.media_type, m.role, m.sort_order
  FROM public.product_media m
  JOIN public.product_models pm ON pm.id = m.product_id
  ORDER BY pm.color_key, m.file_url, (m.role = 'hero') DESC, m.sort_order
)
INSERT INTO public.product_media (product_id, file_url, media_type, role, sort_order)
SELECT s.id, c.file_url, c.media_type, c.role, c.sort_order
FROM canonical c
JOIN public.product_models s ON s.color_key = c.color_key
WHERE NOT EXISTS (
  SELECT 1 FROM public.product_media x
  WHERE x.product_id = s.id AND x.file_url = c.file_url
);

ALTER TABLE public.product_media ENABLE TRIGGER trg_fanout_product_media;
```

- [ ] **Step 2: Apply** via `mcp__supabase__apply_migration`.

- [ ] **Step 3: Verify the invariant** with `execute_sql` (every (color_key, file_url) must appear on ALL siblings of that group):

```sql
SELECT count(*) AS violations FROM (
  SELECT pm.color_key, m.file_url
  FROM public.product_media m
  JOIN public.product_models pm ON pm.id = m.product_id
  GROUP BY pm.color_key, m.file_url
  HAVING count(*) <> (
    SELECT count(*) FROM public.product_models s WHERE s.color_key = pm.color_key
  )
) v;
```
Expected: `violations = 0`.

```sql
-- sanity: a color that previously had photos on only one storage now covers all
SELECT pm.storage_gb, count(m.id) AS photos
FROM public.product_models pm
LEFT JOIN public.product_media m ON m.product_id = pm.id
WHERE pm.color_key = 'apple|iphone 15 pro|blue titanium'
GROUP BY pm.storage_gb ORDER BY 1;
```
Expected: every storage row has the same non-toggling photo count.

---

## Task 5: List RPC `list_product_color_groups`

**Files:** Create `supabase/migrations/20260628120400_list_product_color_groups_rpc.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- One row per color group for the admin Product Models list.
-- SECURITY INVOKER (default) so categories RLS applies as the authenticated caller.
CREATE OR REPLACE FUNCTION public.list_product_color_groups(
  p_search      text DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_media       text DEFAULT NULL   -- 'no-photo' | 'no-video' | NULL
)
RETURNS TABLE (
  representative_id uuid,
  color_key         text,
  brand             text,
  model_name        text,
  color             text,
  category_id       uuid,
  category_name     text,
  short_description text,
  storages          text[],
  sku_count         bigint,
  photo_count       bigint,
  video_count       bigint
)
LANGUAGE sql
STABLE
AS $$
  WITH groups AS (
    SELECT
      pm.color_key,
      (array_agg(pm.id ORDER BY
         nullif(regexp_replace(coalesce(pm.storage_gb,''), '[^0-9]', '', 'g'), '')::int NULLS LAST,
         pm.id))[1] AS representative_id,
      array_agg(DISTINCT pm.storage_gb) FILTER (WHERE pm.storage_gb IS NOT NULL) AS storages,
      count(*) AS sku_count
    FROM public.product_models pm
    GROUP BY pm.color_key
  )
  SELECT
    g.representative_id,
    g.color_key,
    r.brand,
    r.model_name,
    r.color,
    r.category_id,
    c.name AS category_name,
    r.short_description,
    g.storages,
    g.sku_count,
    (SELECT count(*) FROM public.product_media m
       WHERE m.product_id = g.representative_id AND m.media_type = 'image') AS photo_count,
    (SELECT count(*) FROM public.product_media m
       WHERE m.product_id = g.representative_id AND m.media_type = 'video') AS video_count
  FROM groups g
  JOIN public.product_models r ON r.id = g.representative_id
  LEFT JOIN public.categories c ON c.id = r.category_id
  WHERE (p_category_id IS NULL OR r.category_id = p_category_id)
    AND (p_search IS NULL OR (
      r.brand ILIKE '%'||p_search||'%' OR
      r.model_name ILIKE '%'||p_search||'%' OR
      r.color ILIKE '%'||p_search||'%' OR
      coalesce(r.short_description,'') ILIKE '%'||p_search||'%' OR
      EXISTS (SELECT 1 FROM unnest(g.storages) st WHERE st ILIKE '%'||p_search||'%')
    ))
    AND (
      p_media IS NULL
      OR (p_media = 'no-photo' AND NOT EXISTS (
            SELECT 1 FROM public.product_media m
            WHERE m.product_id = g.representative_id AND m.media_type='image'))
      OR (p_media = 'no-video' AND NOT EXISTS (
            SELECT 1 FROM public.product_media m
            WHERE m.product_id = g.representative_id AND m.media_type='video'))
    )
  ORDER BY r.brand, r.model_name, r.color;
$$;

GRANT EXECUTE ON FUNCTION public.list_product_color_groups(text, uuid, text)
  TO authenticated, service_role;
```

- [ ] **Step 2: Apply** via `mcp__supabase__apply_migration`.

- [ ] **Step 3: Verify** with `execute_sql`:

```sql
-- iPhone 15 Pro now collapses from ~22 SKU rows to a handful of color rows
SELECT model_name, color, storages, sku_count, photo_count, video_count
FROM public.list_product_color_groups('iphone 15 pro', NULL, NULL)
ORDER BY model_name, color;
```
Expected: one row per (model, color) — e.g. iPhone 15 Pro × {Black/Blue/White/Natural Titanium} and iPhone 15 Pro Max × its colors; `storages` arrays populated; `sku_count` > 1.

```sql
-- media filter works
SELECT count(*) FROM public.list_product_color_groups(NULL, NULL, 'no-photo');
```
Expected: a number > 0 (color groups lacking photos), and < total group count.

---

## Task 6: Apple category backfill

**Files:** Create `supabase/migrations/20260628120500_backfill_apple_categories.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- Categorize all Apple product_models by brand + model_name (NOT device_category,
-- which is a polluted junk-drawer). Find-or-create categories case-insensitively;
-- assign by LONGEST matching prefix (so 'iPad Pro' wins over 'iPad').

-- 1) ensure the canonical categories exist
INSERT INTO public.categories (name)
SELECT v.catname
FROM (VALUES
  ('iPhone'),('iPad Pro'),('iPad Air'),('iPad mini'),('iPad'),
  ('MacBook Air'),('MacBook Pro'),('MacBook'),('iMac'),('Mac mini'),
  ('Apple Watch'),('AirPods Pro'),('AirPods')
) AS v(catname)
WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.name ILIKE v.catname);

-- 2) assign by longest-prefix match
WITH mapping(prefix, catname) AS (
  VALUES
    ('iPhone','iPhone'),
    ('iPad Pro','iPad Pro'),('iPad Air','iPad Air'),('iPad mini','iPad mini'),('iPad','iPad'),
    ('MacBook Air','MacBook Air'),('MacBook Pro','MacBook Pro'),('MacBook','MacBook'),
    ('iMac','iMac'),('Mac mini','Mac mini'),
    ('Apple Watch','Apple Watch'),('Watch','Apple Watch'),
    ('AirPods Pro','AirPods Pro'),('AirPods','AirPods')
),
resolved AS (
  SELECT pm.id,
    (SELECT c.id
       FROM mapping mp
       JOIN public.categories c ON c.name ILIKE mp.catname
      WHERE pm.model_name ILIKE mp.prefix || '%'
      ORDER BY length(mp.prefix) DESC
      LIMIT 1) AS cat_id
  FROM public.product_models pm
  WHERE pm.brand = 'Apple'
)
UPDATE public.product_models pm
SET category_id = r.cat_id
FROM resolved r
WHERE pm.id = r.id
  AND r.cat_id IS NOT NULL
  AND pm.category_id IS DISTINCT FROM r.cat_id;
```

- [ ] **Step 2: Apply** via `mcp__supabase__apply_migration`.

- [ ] **Step 3: Verify** with `execute_sql`:

```sql
SELECT c.name, count(*) AS n
FROM public.product_models pm
JOIN public.categories c ON c.id = pm.category_id
WHERE pm.brand='Apple'
GROUP BY c.name ORDER BY n DESC;
```
Expected (approx): iPhone 452, iPad Pro 96, iPad 63, iPad Air 56, iPad mini 37, Apple Watch 15, MacBook Pro 10, MacBook Air 5, iMac 4, AirPods 3, AirPods Pro 2, MacBook 2, Mac mini 1 — **total 746**, and **zero** Apple rows with `category_id IS NULL`:

```sql
SELECT count(*) AS uncategorized_apple FROM public.product_models WHERE brand='Apple' AND category_id IS NULL;
```
Expected: `0`.

- [ ] **Step 4: Idempotency check** — re-apply the same SQL via `execute_sql` and confirm the UPDATE affects 0 rows (no `category_id` changes) and no new categories are created.

---

## Task 7: Regenerate database types

**Files:** Modify `src/lib/database.types.ts` (generated file — NOT `src/lib/types.ts`, which is hand-maintained per [[project_types_file_structure]])

- [ ] **Step 1: Regenerate from the linked remote schema**

Run: `supabase gen types typescript --linked > src/lib/database.types.ts`
(`--linked` reads the remote DB over the API; no Docker needed.)

- [ ] **Step 2: Verify** the new symbols exist

Run: `grep -n "color_key" src/lib/database.types.ts | head` → expect matches in `product_models` Row/Insert.
Run: `grep -n "list_product_color_groups" src/lib/database.types.ts | head` → expect a Functions entry.

- [ ] **Step 3: Typecheck**

Run: `npm run build`
Expected: build succeeds (no TS errors from the regenerated file).

> Fallback if `gen types` fails: manually add `color_key: string` to the `product_models` Row type and a `list_product_color_groups` entry under `Functions` in `database.types.ts`, mirroring the RPC's args/returns from Task 5.

- [ ] **Step 4: Commit**

```bash
git add src/lib/database.types.ts
git commit -m "chore(types): regenerate database types (color_key, list_product_color_groups)"
```

---

## Task 8: Service — `getProductColorGroups`

**Files:** Modify `src/services/product-models.ts`

- [ ] **Step 1: Add the type and function** near the existing `getProductModels` (after it). Append:

```ts
export interface ProductColorGroup {
  representative_id: string
  color_key: string
  brand: string
  model_name: string
  color: string
  category_id: string | null
  category_name: string | null
  short_description: string | null
  storages: string[] | null
  sku_count: number
  photo_count: number
  video_count: number
}

export interface ProductColorGroupFilters {
  search?: string
  categoryId?: string
  media?: 'no-photo' | 'no-video'
}

// One row per (brand, model_name, color). Backed by the list_product_color_groups
// RPC (server-side grouping + filtering; also avoids the 1000-row PostgREST cap).
export async function getProductColorGroups(
  filters: ProductColorGroupFilters = {},
): Promise<ProductColorGroup[]> {
  const { data, error } = await supabase.rpc('list_product_color_groups', {
    p_search: filters.search ?? undefined,
    p_category_id: filters.categoryId ?? undefined,
    p_media: filters.media ?? undefined,
  })
  if (error) throw error
  return (data ?? []) as ProductColorGroup[]
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: succeeds. (If `supabase.rpc` complains the name is unknown, Task 7 didn't add the Functions entry — fix the types first.)

- [ ] **Step 3: Commit**

```bash
git add src/services/product-models.ts
git commit -m "feat(products): add getProductColorGroups service (color-grouped list)"
```

---

## Task 9: Hook — `useProductColorGroups`

**Files:** Modify `src/hooks/use-product-models.ts`

- [ ] **Step 1: Add the hook** after the existing `useProductModels`. Insert:

```ts
export function useProductColorGroups(
  filters: productModelsService.ProductColorGroupFilters = {},
) {
  return useQuery({
    queryKey: queryKeys.productModels.list({ ...filters, grouped: true }),
    queryFn: () => productModelsService.getProductColorGroups(filters),
  })
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-product-models.ts
git commit -m "feat(products): add useProductColorGroups hook"
```

---

## Task 10: List page — grouped rows + new columns

**Files:** Modify `src/pages/admin/products.tsx`

- [ ] **Step 1: Replace the columns, row type, and data source.** Rewrite the top of the file (imports through the `columns` array) and the data wiring. Replace the `ProductRow` type + `columns` definition with:

```ts
import type { ProductColorGroup } from '@/services/product-models'

function formatStorages(storages: string[] | null): string {
  if (!storages || storages.length === 0) return '—'
  const toGb = (s: string) => parseInt(s.replace(/[^0-9]/g, ''), 10) || 0
  return [...storages]
    .sort((a, b) => toGb(a) - toGb(b))
    .map((s) => {
      const n = toGb(s)
      return n >= 1024 ? `${n / 1024}TB` : `${n}GB`
    })
    .join(' / ')
}

const columns: ColumnDef<ProductColorGroup>[] = [
  {
    id: 'category',
    header: 'Category',
    cell: ({ row }) =>
      row.original.category_name ? (
        <span className="text-xs bg-muted px-2 py-0.5 rounded">{row.original.category_name}</span>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      ),
  },
  {
    accessorKey: 'brand',
    header: 'Brand',
    cell: ({ row }) => <span className="font-medium">{row.original.brand}</span>,
  },
  { accessorKey: 'model_name', header: 'Model' },
  {
    accessorKey: 'color',
    header: 'Color',
    cell: ({ row }) => <span className="font-medium">{row.original.color}</span>,
  },
  {
    id: 'storages',
    header: 'Storage',
    cell: ({ row }) => (
      <span className="text-muted-foreground text-xs">{formatStorages(row.original.storages)}</span>
    ),
  },
  {
    id: 'short_description',
    header: 'Description',
    cell: ({ row }) => (
      <span className="text-muted-foreground text-xs line-clamp-1">
        {row.original.short_description || '—'}
      </span>
    ),
  },
  {
    id: 'photos',
    header: 'Photos',
    cell: ({ row }) => {
      const count = row.original.photo_count
      return <span className={cn('text-sm', count === 0 && 'text-red-500 font-medium')}>{count}</span>
    },
  },
  {
    id: 'videos',
    header: 'Videos',
    cell: ({ row }) => {
      const count = row.original.video_count
      return <span className={cn('text-sm', count === 0 && 'text-red-500 font-medium')}>{count}</span>
    },
  },
]
```

- [ ] **Step 2: Swap the data hook and remove the client-side media filter.** In `ProductListPage`, replace the `useProductModels(...)` call + `filteredProducts` block with:

```ts
  const { data: categories } = useCategories()
  const { data: groups, isLoading } = useProductColorGroups({
    search: debouncedSearch || undefined,
    categoryId: categoryFilter !== 'all' ? categoryFilter : undefined,
    media: mediaFilter !== 'all' ? (mediaFilter as 'no-photo' | 'no-video') : undefined,
  })
```

Then update the `DataTable` usage:

```tsx
        <DataTable
          columns={columns}
          data={groups ?? []}
          onRowClick={(row) => navigate(`/admin/products/${row.representative_id}`)}
        />
```

Remove the now-unused `useProductModels` import and the old `filteredProducts` constant. Keep `useCreateProductModel`, the Add Product dialog, filters row, and `TableSkeleton` (bump its `columns` prop to `8`).

- [ ] **Step 3: Typecheck + lint**

Run: `npm run build && npm run lint`
Expected: both succeed; no unused-import errors (remove `ProductModelWithCounts`/`useProductModels` if they become unused).

- [ ] **Step 4: Manual check** (`npm run dev` → `/admin/products`): search "iphone 15 pro" now shows one row per color with Color + Storage + correct Photos/Videos counts; the "iPhone" category badge appears; "No Photos"/"No Videos" filters work; clicking a row opens the detail page.

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/products.tsx
git commit -m "feat(products): collapse Product Models list to one row per color (RPC-backed)"
```

---

## Task 11: Detail page — "shared across variants" clarity

**Files:** Modify `src/pages/admin/product-detail.tsx`

- [ ] **Step 1: Add a clarifying line under the model·color subtitle.** Find the subtitle that renders `${model_name} · ${color}` (the line shown as "iPhone 15 Pro · Black Titanium"). Immediately after that element, add:

```tsx
        <p className="text-xs text-muted-foreground mt-1">
          Photos and videos here are shared across every storage and carrier variant of this color —
          upload once.
        </p>
```

Match the surrounding JSX/className conventions (use the existing wrapper; do not introduce inline styles per project rules).

- [ ] **Step 2: Typecheck + lint**

Run: `npm run build && npm run lint`
Expected: both succeed.

- [ ] **Step 3: Manual check** — open a color's detail page; the note appears; uploading a photo then returning to the list shows the count on that color row; opening a different storage variant of the same color shows the same photo.

- [ ] **Step 4: Commit**

```bash
git add src/pages/admin/product-detail.tsx
git commit -m "feat(products): note that product-model media is shared per color"
```

---

## Task 12: Finalize — version, project state, deploy

**Files:** Modify `package.json`, `docs/PROJECT_STATE.md`

- [ ] **Step 1: Bump version** in `package.json` from `1.62.1` to `1.63.0` (minor — new feature).

- [ ] **Step 2: Update `docs/PROJECT_STATE.md`** — move prior "Now" items to "Recently shipped" as needed and add a "Now"/"Recently shipped" entry summarizing: color-level media fan-out for product models, color-grouped Product Models list (+ 1000-row cap fix), Apple category backfill (746 rows). Reference this plan + the spec.

- [ ] **Step 3: Final full verification**

Run: `npm run build && npm run lint`
Expected: both pass.

Re-run the invariant check via `execute_sql` (from Task 4 Step 3) → `violations = 0`.

- [ ] **Step 4: Update memory** — append/update `[[project_backorder_desc_and_dedup]]`'s open item (category backfill) as DONE for Apple, and add a short memory note for the color-fanout media model. (Per memory rules: one file per fact + MEMORY.md pointer.)

- [ ] **Step 5: Deploy** using the `push-to-main` skill (commits remaining changes, pushes to main → Vercel). Confirm the version bump and PROJECT_STATE update are included.

---

## Self-review notes (verified against spec)

- **Spec §"color-fanout"** → Tasks 1–4 (color_key, triggers, inherit, backfill). Recursion guard via `pg_trigger_depth()` ✓; invariant assertion ✓.
- **Spec §"List page redesign"** → Tasks 5, 8–10. Columns `Category · Brand · Model · Color · Storage · Description · Photos · Videos` ✓ (Description kept per preserve-elements; flagged in spec as droppable). 1000-row cap fixed via RPC grouping ✓.
- **Spec §"Detail page"** → Task 11 (write path unchanged; clarifying copy) ✓.
- **Spec §"Category backfill (all Apple lines)"** → Task 6, longest-prefix mapping, find-or-create, expected counts ✓.
- **Spec §"Unchanged surfaces"** → no tasks touch the 32 read sites / 2 search RPCs / shop / edge — confirmed by file map ✓.
- Types consistent across tasks: `ProductColorGroup`, `getProductColorGroups`, `useProductColorGroups`, `list_product_color_groups`, `representative_id`, `formatStorages` used identically in Tasks 5/8/9/10 ✓.
