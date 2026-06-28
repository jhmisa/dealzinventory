# Reliable "Add Backorder": Fuzzy Search + Robust iosys Parser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the "Add Backorder" flow dependable — paste an iosys URL, get correct color/grade/specs parsed, find the existing `product_models` row via locale/format-tolerant fuzzy search (or safely create it), and store per-unit included accessories.

**Architecture:** A new shared, server-side `search_product_models` RPC (bypasses the 1000-row PostgREST cap, normalizes glued/hyphen/JP-color tokens) drives an async `ProductPicker`. The iosys edge-function parser is extended to read the spec `<table>`, carrier model number, no-storage Japanese color, robust grade, and 付属品 accessories. `findMatchingProductModel` gains an Android `model_number` branch; matched models get their NULL spec fields enriched (never overwritten). A new migration adds `included_accessories` to `backorder_lines` + `items` and carries it onto the item at fulfillment.

**Tech Stack:** React 18 + TypeScript (strict) + TanStack Query + cmdk + shadcn/ui; Supabase Postgres (SQL RPC), Deno edge functions (`supabase/functions/_shared`), Deno test for the parser.

---

## Conventions (apply to every task)

- **Migrations are applied via the Supabase CLI against the linked remote** (project ref `aeiyinpxmazmfubotpdk`), NEVER the MCP. Apply with:
  ```bash
  supabase db push --linked
  ```
  Ad-hoc SQL smoke tests use:
  ```bash
  supabase db query --linked "<sql>"
  ```
- **Migration filenames use the `YYYYMMDDHHMMSS_name.sql` timestamp format.** The latest existing migration is `20260628200000_iosys_catalog_sku_key.sql`, so every NEW migration in this plan uses a timestamp strictly after it (this plan uses `2026062910xxxx` values).
- **`src/lib/types.ts` is HAND-MAINTAINED** over `src/lib/database.types.ts`. NEVER run `gen types > src/lib/types.ts` (it clobbers the alias layer + injects banner text). After a schema change, regenerate ONLY `database.types.ts`:
  ```bash
  supabase gen types typescript --linked --schema public > src/lib/database.types.ts
  ```
  then hand-edit `types.ts` aliases if a new exported alias is needed.
- **TypeScript strict, no `any`.** Build check after frontend changes: `npm run build` (tsc via vite). Lint: `npm run lint`.
- **Deno parser tests** run from the catalog/adapter dir: `deno test --allow-read` (the test files import `https://deno.land/std/assert/mod.ts` and read fixtures relative to `import.meta.url`).
- **Commit after every green step.** Use conventional-commit messages. Bump `package.json` `version` once for the whole session (do it in Task 1's commit: `1.77.0` → `1.78.0`).

---

## File Structure

**Created:**
- `supabase/migrations/2026062910000_backorder_included_accessories.sql` — adds `included_accessories text` to `backorder_lines` + `items`; carries it onto the item in `fulfill_backorder_with_item`.
- `supabase/migrations/2026062910100_search_product_models_rpc.sql` — the new fuzzy search RPC.
- `supabase/functions/_shared/supplier-adapters/__fixtures__/iosys-so-52c.html` — saved live HTML fixture for the SO-52C page.

**Modified:**
- `supabase/functions/_shared/catalog/apple-colors.ts` — `colorJaToEn` consults the merged Android color maps too.
- `supabase/functions/_shared/supplier-adapters/types.ts` — `NormalizedSupplierProduct` gains `modelNumber`, `specs`, `includedAccessories`.
- `supabase/functions/_shared/supplier-adapters/iosys.ts` — modelNumber, no-storage colorJa, grade, spec-table, 付属品.
- `supabase/functions/_shared/supplier-adapters/iosys.test.ts` — extend with SO-52C fixture assertions.
- `src/services/product-models.ts` — `searchProductModels`, Android `model_number` branch in `findMatchingProductModel`, `enrichProductModelSpecs`.
- `src/hooks/use-product-models.ts` — `useProductModelSearch`.
- `src/lib/query-keys.ts` — `productModels.search` key.
- `src/components/intake/product-picker.tsx` — async server search (shouldFilter=false, debounce, empty-state default).
- `src/components/backorders/add-backorder-dialog.tsx` — server-search picker, `included_accessories` field, create-with-dedup, spec enrichment, map parsed specs.
- `src/validators/backorder.ts` — `included_accessories` field.
- `src/lib/database.types.ts` — regenerated after each migration.
- `src/lib/types.ts` — alias hand-edits if needed.

---

## Task 1: Migration — `included_accessories` on backorder_lines + items, carried at fulfillment

**Files:**
- Create: `supabase/migrations/2026062910000_backorder_included_accessories.sql`
- Modify: `src/lib/database.types.ts` (regenerated)
- Modify: `package.json:4` (version bump)

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/2026062910000_backorder_included_accessories.sql`:

```sql
-- Backorder fuzzy-search/parser feature — included accessories (per-unit raw text)
-- Stores the iosys 付属品 list verbatim on the backorder line; carried onto the item
-- when the line is fulfilled with a real P-code. Editable by staff; never normalized here.
-- New tables aren't created, so the Oct-2026 ALTER DEFAULT PRIVILEGES grant policy does
-- not apply — ALTER TABLE ADD COLUMN inherits the table's existing grants/RLS.

ALTER TABLE public.backorder_lines ADD COLUMN IF NOT EXISTS included_accessories text;
ALTER TABLE public.items           ADD COLUMN IF NOT EXISTS included_accessories text;

-- Extend the fulfillment RPC: copy the line's included_accessories onto the item it is
-- fulfilled with (only when the item has none yet — never overwrite a staff-entered value).
-- Re-declared in full (CREATE OR REPLACE) to keep the file self-contained and idempotent.
CREATE OR REPLACE FUNCTION public.fulfill_backorder_with_item(
  p_order_item_id uuid,
  p_item_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_line public.backorder_lines%ROWTYPE;
  v_item public.items%ROWTYPE;
  v_oi   public.order_items%ROWTYPE;
BEGIN
  SELECT * INTO v_oi FROM public.order_items WHERE id = p_order_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_item % not found', p_order_item_id;
  END IF;
  IF v_oi.backorder_line_id IS NULL
     OR v_oi.backorder_status NOT IN ('READY','ORDERED','AWAITING_ORDER') THEN
    RAISE EXCEPTION 'order_item % is not an open pre-order', p_order_item_id;
  END IF;

  SELECT * INTO v_line FROM public.backorder_lines WHERE id = v_oi.backorder_line_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'backorder_line % not found', v_oi.backorder_line_id;
  END IF;

  SELECT * INTO v_item FROM public.items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'item % not found', p_item_id;
  END IF;

  IF v_item.item_status <> 'AVAILABLE' THEN
    RAISE EXCEPTION 'item not AVAILABLE (status %)', v_item.item_status;
  END IF;
  IF EXISTS (SELECT 1 FROM public.order_items WHERE item_id = p_item_id) THEN
    RAISE EXCEPTION 'item already in an order';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sell_group_items WHERE item_id = p_item_id) THEN
    RAISE EXCEPTION 'item in a sell group';
  END IF;

  IF v_item.product_id IS DISTINCT FROM v_line.product_id
     OR public._backorder_norm_storage_gb(v_item.storage_gb) IS DISTINCT FROM v_line.storage_gb
     OR nullif(lower(trim(coalesce(v_item.color,''))),'') IS DISTINCT FROM nullif(lower(trim(coalesce(v_line.color,''))),'')
     OR v_item.condition_grade IS DISTINCT FROM v_line.condition_grade THEN
    RAISE EXCEPTION 'core specs do not match backorder line';
  END IF;

  UPDATE public.order_items
    SET item_id = p_item_id,
        backorder_status = 'FULFILLED'
    WHERE id = p_order_item_id;

  UPDATE public.items
    SET item_status = 'RESERVED',
        included_accessories = COALESCE(v_item.included_accessories, v_line.included_accessories)
    WHERE id = p_item_id;

  UPDATE public.backorder_lines
    SET quantity_received = quantity_received + 1
    WHERE id = v_line.id;
END $$;

GRANT EXECUTE ON FUNCTION public.fulfill_backorder_with_item(uuid, uuid) TO authenticated, service_role;
```

- [ ] **Step 2: Apply the migration to the linked remote**

Run:
```bash
supabase db push --linked
```
Expected: output lists `2026062910000_backorder_included_accessories.sql` as applied, ending with `Finished supabase db push.` (no errors).

- [ ] **Step 3: Verify the columns exist**

Run:
```bash
supabase db query --linked "SELECT table_name, column_name FROM information_schema.columns WHERE column_name='included_accessories' AND table_name IN ('items','backorder_lines') ORDER BY table_name;"
```
Expected: two rows — `backorder_lines | included_accessories` and `items | included_accessories`.

- [ ] **Step 4: Regenerate database types**

Run:
```bash
supabase gen types typescript --linked --schema public > src/lib/database.types.ts
```
Expected: file rewritten; `git diff src/lib/database.types.ts` shows `included_accessories: string | null` added to the `items` and `backorder_lines` Row/Insert/Update blocks. (No banner text — this is `database.types.ts`, not `types.ts`.)

- [ ] **Step 5: Bump the package version**

Edit `package.json:4`, change `"version": "1.77.0"` to `"version": "1.78.0"`.

- [ ] **Step 6: Build to confirm types compile**

Run:
```bash
npm run build
```
Expected: `vite build` completes with no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/2026062910000_backorder_included_accessories.sql src/lib/database.types.ts package.json
git commit -m "feat(backorder): add included_accessories to lines + items, carry on fulfillment (v1.78.0)"
```

---

## Task 2: Migration — `search_product_models` fuzzy RPC

**Files:**
- Create: `supabase/migrations/2026062910100_search_product_models_rpc.sql`

The RPC returns INDIVIDUAL `product_models` rows (the columns the picker renders) + hero image url + media count, ranked, capped. Per-token matching is the union of (a) `\m` word-boundary match on a spaced haystack and (b) a separator-stripped substring match (normalize = lower + full-width→half-width fold + strip spaces/hyphens/middle-dots). The haystack ADDS `color_ja` (the gap that broke `ミント`). Exact `model_number`/`part_number` token hits rank first.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/2026062910100_search_product_models_rpc.sql`:

```sql
-- Shared fuzzy product-model search. Returns INDIVIDUAL product_models rows (not color-grouped),
-- bypassing the 1000-row PostgREST cap via a server-side LIMIT. Improves on
-- list_product_color_groups: (1) adds color_ja to the haystack (so ミント matches),
-- (2) each token matches if EITHER a \m word-boundary hit on the spaced haystack OR a
-- separator-stripped substring hit (normalize = lower + full-width→half-width + strip
-- spaces/hyphens/middle-dots ・), so "Xperia10"="Xperia 10", "SO52C"="SO-52C", "ミント" all match.
-- Ranking: exact model_number/part_number token first, then model_name prefix, then brand/model/color.

-- Normalize: lower-case, fold common full-width ASCII/digits to half-width, strip whitespace,
-- ASCII hyphen, JP middle-dot (・) and the long-vowel/horizontal-bar marks sometimes glued in codes.
CREATE OR REPLACE FUNCTION public._spm_normalize(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(
           lower(
             translate(
               coalesce(p,''),
               'ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺ' ||
               'ａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ' ||
               '０１２３４５６７８９',
               'ABCDEFGHIJKLMNOPQRSTUVWXYZ' ||
               'abcdefghijklmnopqrstuvwxyz' ||
               '0123456789'
             )
           ),
           '[\s\-・ー―‐]', '', 'g'
         );
$$;

CREATE OR REPLACE FUNCTION public.search_product_models(
  p_search      text DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_limit       int  DEFAULT 50
)
RETURNS TABLE (
  id                uuid,
  brand             text,
  model_name        text,
  model_number      text,
  part_number       text,
  color             text,
  color_ja          text,
  short_description text,
  storage_gb        text,
  ram_gb            text,
  cpu               text,
  chipset           text,
  screen_size       numeric,
  category_id       uuid,
  category_name     text,
  status            public.product_status,
  hero_image_url    text,
  media_count       bigint
)
LANGUAGE sql
STABLE
AS $$
  WITH hay AS (
    SELECT
      pm.*,
      concat_ws(' ',
        pm.brand, pm.model_name, pm.model_number, pm.part_number,
        pm.color, pm.color_ja, coalesce(pm.short_description,''), coalesce(pm.storage_gb,'')
      ) AS spaced_hay
    FROM public.product_models pm
    WHERE pm.status = 'ACTIVE'
      AND (p_category_id IS NULL OR pm.category_id = p_category_id)
  ),
  filtered AS (
    SELECT h.*,
      public._spm_normalize(h.spaced_hay) AS norm_hay
    FROM hay h
    WHERE (
      p_search IS NULL OR btrim(p_search) = ''
      OR NOT EXISTS (
        SELECT 1
        FROM regexp_split_to_table(btrim(p_search), '\s+') AS tok
        WHERE
          -- (a) word-boundary hit on the spaced haystack (precise, locale-aware)
          h.spaced_hay !~* ('\m' || regexp_replace(tok, '([^a-zA-Z0-9])', '\\\1', 'g'))
          -- AND (b) NO separator-stripped substring hit either -> token truly absent
          AND public._spm_normalize(h.spaced_hay) NOT LIKE
              ('%' || public._spm_normalize(tok) || '%')
      )
    )
  )
  SELECT
    f.id, f.brand, f.model_name, f.model_number, f.part_number,
    f.color, f.color_ja, f.short_description, f.storage_gb, f.ram_gb,
    f.cpu, f.chipset, f.screen_size, f.category_id,
    c.name AS category_name, f.status,
    (SELECT m.file_url FROM public.product_media m
       WHERE m.product_id = f.id
       ORDER BY (m.role = 'hero') DESC, m.sort_order ASC NULLS LAST
       LIMIT 1) AS hero_image_url,
    (SELECT count(*) FROM public.product_media m WHERE m.product_id = f.id) AS media_count
  FROM filtered f
  LEFT JOIN public.categories c ON c.id = f.category_id
  ORDER BY
    -- exact model_number / part_number token match first
    (p_search IS NOT NULL AND (
        lower(coalesce(f.model_number,'')) = lower(btrim(p_search))
        OR lower(coalesce(f.part_number,'')) = lower(btrim(p_search))
        OR public._spm_normalize(f.model_number) = public._spm_normalize(btrim(p_search))
     )) DESC,
    -- model_name prefix match next
    (p_search IS NOT NULL AND f.model_name ILIKE (btrim(p_search) || '%')) DESC,
    f.brand, f.model_name, f.color
  LIMIT GREATEST(p_limit, 1);
$$;

GRANT EXECUTE ON FUNCTION public._spm_normalize(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_product_models(text, uuid, int)
  TO authenticated, service_role;
```

- [ ] **Step 2: Apply the migration**

Run:
```bash
supabase db push --linked
```
Expected: lists `2026062910100_search_product_models_rpc.sql` applied; ends `Finished supabase db push.`

- [ ] **Step 3: Smoke-test — glued tokens + JP color find the SO-52C row**

Run:
```bash
supabase db query --linked "SELECT brand, model_name, model_number, color, color_ja FROM public.search_product_models('Xperia10 IV SO-52C', NULL, 10);"
```
Expected: includes a row `Sony | Xperia 10 IV | SO-52C | <color> | <color_ja>` (one row per stocked color of that model).

Run:
```bash
supabase db query --linked "SELECT brand, model_name, model_number, color FROM public.search_product_models('SO52C mint', NULL, 10);"
```
Expected: returns the `Sony | Xperia 10 IV | SO-52C | Mint` row (hyphen-less code + English color both matched).

Run:
```bash
supabase db query --linked "SELECT brand, model_name, color, color_ja FROM public.search_product_models('xperia 10 mint', NULL, 10);"
```
Expected: returns the Sony Xperia 10 (IV) Mint row(s) — the spaced form and Japanese-or-English `Mint`/`ミント` color match.

- [ ] **Step 4: Smoke-test — Sony falls beyond the old 1000-row cap but is found**

Run:
```bash
supabase db query --linked "SELECT count(*) FROM public.search_product_models('SONY Xperia10', NULL, 50);"
```
Expected: a count `>= 1` (the regression case from the spec — bare glued `Xperia10` now returns rows).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/2026062910100_search_product_models_rpc.sql
git commit -m "feat(catalog): search_product_models fuzzy RPC (glued/hyphen/JP-color tolerant)"
```

---

## Task 3: Service `searchProductModels` + hook `useProductModelSearch` + query key

**Files:**
- Modify: `src/lib/query-keys.ts:21` (add `search` under `productModels`)
- Modify: `src/services/product-models.ts:235` (add `searchProductModels` after `getProductModelsWithHeroImage`)
- Modify: `src/hooks/use-product-models.ts:27` (add `useProductModelSearch`)

- [ ] **Step 1: Add the query key**

In `src/lib/query-keys.ts`, inside the `productModels` object (after line 21 `media: ...`), add a `search` key. The block becomes:

```ts
  productModels: {
    all: ['product-models'] as const,
    lists: () => [...queryKeys.productModels.all, 'list'] as const,
    list: (filters: Record<string, unknown>) => [...queryKeys.productModels.lists(), filters] as const,
    details: () => [...queryKeys.productModels.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.productModels.details(), id] as const,
    media: (id: string) => [...queryKeys.productModels.all, 'media', id] as const,
    search: (query: string, categoryId?: string) =>
      [...queryKeys.productModels.all, 'search', query, categoryId ?? null] as const,
  },
```

- [ ] **Step 2: Add the service function**

In `src/services/product-models.ts`, after `getProductModelsWithHeroImage` (ends line 235), add:

```ts
// Server-side fuzzy search over product_models via the search_product_models RPC. Returns
// INDIVIDUAL rows shaped as ProductModelWithHeroImage (the picker renders these directly),
// bypassing the 1000-row PostgREST cap and tolerating glued/hyphen/JP-color query forms.
export async function searchProductModels(
  query: string,
  categoryId?: string,
  limit = 50,
): Promise<ProductModelWithHeroImage[]> {
  const { data, error } = await supabase.rpc('search_product_models', {
    p_search: query,
    p_category_id: categoryId ?? undefined,
    p_limit: limit,
  })
  if (error) throw error
  return (data ?? []).map((r) => ({
    ...(r as object),
    hero_image_url: (r as { hero_image_url: string | null }).hero_image_url ?? null,
    media_count: Number((r as { media_count: number }).media_count ?? 0),
    categories: (r as { category_name: string | null }).category_name
      ? { name: (r as { category_name: string }).category_name }
      : null,
  })) as ProductModelWithHeroImage[]
}
```

- [ ] **Step 3: Add the hook**

In `src/hooks/use-product-models.ts`, after `useProductModelsWithHeroImage` (ends line 27), add:

```ts
export function useProductModelSearch(query: string, categoryId?: string) {
  return useQuery({
    queryKey: queryKeys.productModels.search(query, categoryId),
    queryFn: () => productModelsService.searchProductModels(query, categoryId),
    enabled: query.trim().length > 0,
    staleTime: 30_000,
  })
}
```

- [ ] **Step 4: Build to confirm types compile**

Run:
```bash
npm run build
```
Expected: build succeeds. (The RPC name `search_product_models` is now in `database.types.ts` from Task 2's regen, so `supabase.rpc('search_product_models', ...)` type-checks.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/query-keys.ts src/services/product-models.ts src/hooks/use-product-models.ts
git commit -m "feat(catalog): searchProductModels service + useProductModelSearch hook"
```

---

## Task 4: `ProductPicker` → async server search

The picker currently filters a passed-in `products` array client-side via cmdk's composite `value` (line 140). Switch to `shouldFilter={false}`, a debounced input, and server results from `useProductModelSearch`. Keep the selected/auto-matched off-list row visible (still rendered from the passed `products` prop, which the dialog seeds with the matched model). When the query is empty, show the passed `products` (the dialog supplies a small recent/auto-matched set — see Task 9), NOT a fetch of the whole table.

**Files:**
- Modify: `src/components/intake/product-picker.tsx` (whole component body)

- [ ] **Step 1: Rewrite the component to search the server**

Replace the entire contents of `src/components/intake/product-picker.tsx` with:

```tsx
import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronsUpDown, Image as ImageIcon, Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { ProductForm } from '@/components/items/product-form'
import { useProductModelSearch } from '@/hooks/use-product-models'
import type { ProductModelWithHeroImage } from '@/lib/types'
import type { ProductModelFormValues } from '@/validators/product-model'

interface ProductPickerProps {
  value: string
  onSelect: (productId: string) => void
  // Off-list rows to always keep available for display (selected row + auto-matched row +
  // a small default/recent set shown when the search box is empty). NOT the whole table.
  products: ProductModelWithHeroImage[]
  initialSearch?: string
  categoryId?: string
  onCreate?: (values: ProductModelFormValues) => Promise<string>
  invoiceDescription?: string
}

export function ProductPicker({
  value,
  onSelect,
  products,
  initialSearch,
  categoryId,
  onCreate,
  invoiceDescription,
}: ProductPickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)

  // Debounce the typed term ~250ms before hitting the server.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250)
    return () => clearTimeout(t)
  }, [search])

  const { data: serverResults, isFetching } = useProductModelSearch(debounced, categoryId)

  // Selected/auto-matched row comes from the passed `products` (off-list safe).
  const selected = value ? products.find((p) => p.id === value) : null

  // What the list renders: server results while searching, else the passed default set.
  // Always include the selected row so it stays visible/checkable even if absent from results.
  const rows = useMemo(() => {
    const base = debounced.length > 0 ? (serverResults ?? []) : products
    if (selected && !base.some((p) => p.id === selected.id)) {
      return [selected, ...base]
    }
    return base
  }, [debounced, serverResults, products, selected])

  async function handleProductCreate(values: ProductModelFormValues) {
    if (!onCreate) return
    setCreateLoading(true)
    try {
      const newProductId = await onCreate(values)
      setCreateDialogOpen(false)
      onSelect(newProductId)
    } catch {
      // Error handling done by parent via toast
    } finally {
      setCreateLoading(false)
    }
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen && initialSearch && !value) {
      setSearch(initialSearch)
    }
    if (!nextOpen) setSearch('')
    setOpen(nextOpen)
  }

  return (
    <>
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-8 w-full justify-between text-xs font-normal"
        >
          {selected ? (
            <span className="flex items-center gap-1.5 truncate">
              {selected.hero_image_url ? (
                <img
                  src={selected.hero_image_url}
                  alt=""
                  className="h-5 w-5 rounded object-cover shrink-0"
                />
              ) : (
                <ImageIcon className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <span className="truncate">
                {selected.brand} {selected.model_name}
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">Select product...</span>
          )}
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder="Search products..."
            className="h-8 text-xs"
          />
          <CommandList className="max-h-[350px]">
            {isFetching && (
              <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
              </div>
            )}
            <CommandEmpty>
              <div className="py-2 text-center">
                <p className="text-sm text-muted-foreground">
                  {debounced.length === 0 ? 'Type to search products.' : 'No products found.'}
                </p>
                {onCreate && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => {
                      setOpen(false)
                      setCreateDialogOpen(true)
                    }}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Create Product
                  </Button>
                )}
              </div>
            </CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__none__"
                onSelect={() => {
                  onSelect('')
                  setOpen(false)
                }}
              >
                <Check
                  className={cn(
                    'mr-2 h-3.5 w-3.5',
                    !value ? 'opacity-100' : 'opacity-0'
                  )}
                />
                <span className="text-muted-foreground">None</span>
              </CommandItem>
              {rows.map((product) => (
                <CommandItem
                  key={product.id}
                  value={product.id}
                  onSelect={() => {
                    onSelect(product.id)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-3.5 w-3.5 shrink-0',
                      value === product.id ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <div className="flex items-center gap-2 min-w-0">
                    {product.hero_image_url ? (
                      <img
                        src={product.hero_image_url}
                        alt=""
                        className="h-8 w-8 rounded object-cover shrink-0"
                      />
                    ) : (
                      <div className="h-8 w-8 rounded bg-muted flex items-center justify-center shrink-0">
                        <ImageIcon className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-xs font-medium">
                        {product.brand} {product.model_name}
                      </div>
                      {(product.model_number || product.part_number) && (
                        <div className="text-[11px] font-mono text-muted-foreground/80">
                          {[
                            product.model_number,
                            product.part_number ? `(${product.part_number})` : null,
                          ]
                            .filter(Boolean)
                            .join(' ')}
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground">
                        {product.short_description || product.color}
                      </div>
                      {(() => {
                        const specs = [
                          product.cpu,
                          product.ram_gb ? `${product.ram_gb}GB` : null,
                          product.storage_gb ? `${product.storage_gb}GB` : null,
                          product.screen_size ? `${product.screen_size}"` : null,
                          product.short_description ? product.color : null,
                        ].filter(Boolean)
                        return specs.length > 0 ? (
                          <div className="text-[11px] text-muted-foreground/70">
                            {specs.join(' · ')}
                          </div>
                        ) : null
                      })()}
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>

    {onCreate && (
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Product</DialogTitle>
          </DialogHeader>
          {invoiceDescription && (
            <div className="rounded-md border bg-muted/50 px-3 py-2">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Invoice Description</p>
              <p className="text-sm select-all">{invoiceDescription}</p>
            </div>
          )}
          <ProductForm
            loading={createLoading}
            onSubmit={handleProductCreate}
            onCancel={() => setCreateDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>
    )}
    </>
  )
}
```

- [ ] **Step 2: Build to confirm types + all call sites still compile**

Run:
```bash
npm run build
```
Expected: build succeeds. (Other callers pass `products` + `value` + `onSelect`; the new `categoryId` prop is optional, so existing call sites are unaffected. The `initialSearch` behavior is unchanged.)

- [ ] **Step 3: Lint**

Run:
```bash
npm run lint
```
Expected: no errors in `product-picker.tsx` (the unused `storage_gb` composite value string was removed; `useMemo`/`useEffect` deps are complete).

- [ ] **Step 4: Commit**

```bash
git add src/components/intake/product-picker.tsx
git commit -m "feat(picker): async server-side product search (shouldFilter=false, debounced)"
```

---

## Task 5: iosys parser — modelNumber, no-storage colorJa, grade, spec table, 付属品

This is TDD against a real saved fixture. First save the SO-52C HTML, then extend `NormalizedSupplierProduct` (done in Task 6 — but the parser needs the fields, so we add the type fields here too and Task 6 only documents/finalizes), write the failing test, then implement.

**Files:**
- Create: `supabase/functions/_shared/supplier-adapters/__fixtures__/iosys-so-52c.html`
- Modify: `supabase/functions/_shared/supplier-adapters/types.ts` (add `modelNumber`, `specs`, `includedAccessories`)
- Modify: `supabase/functions/_shared/supplier-adapters/iosys.ts` (parse the new fields)
- Modify: `supabase/functions/_shared/catalog/apple-colors.ts` (merge Android color maps into `colorJaToEn`)
- Modify: `supabase/functions/_shared/supplier-adapters/iosys.test.ts` (SO-52C fixture assertions)

- [ ] **Step 1: Save the real SO-52C fixture**

Run:
```bash
curl -sL "https://iosys.co.jp/items/smartphone/xperia10/docomo/xperia10_iv_so-52c/278266" \
  -o supabase/functions/_shared/supplier-adapters/__fixtures__/iosys-so-52c.html
```
Then verify it captured the spec table and color (not a bot wall):
```bash
grep -c 'id="spec"' supabase/functions/_shared/supplier-adapters/__fixtures__/iosys-so-52c.html
grep -o 'ミント' supabase/functions/_shared/supplier-adapters/__fixtures__/iosys-so-52c.html | head -1
```
Expected: the first prints `1` (the spec div exists); the second prints `ミント`. If either is empty, the page didn't render server-side — retry adding a desktop User-Agent: `curl -sL -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" "<url>" -o <path>`. Inspect the saved file's `<div id="spec">` rows with `grep -A40 'id="spec"' <path>` to confirm the actual `<th>`/`<td>` label text (`CPU`, `RAM`, `ROM`, etc.) before writing the implementation — adjust the label list in Step 6 to match the live markup if it differs.

- [ ] **Step 2: Extend `NormalizedSupplierProduct`**

In `supabase/functions/_shared/supplier-adapters/types.ts`, replace the interface with:

```ts
export interface NormalizedSupplierSpecs {
  os: string | null
  cpu: string | null
  ramGb: number | null
  storageGb: number | null
  screenSize: number | null // inches, numeric
  camera: string | null
  comms: string | null // 通信
  bands: string | null // 電波帯
  externalMemory: string | null // 外部メモリ
  year: number | null // from 発売日
  ports: string | null // 接続端子
}

export interface NormalizedSupplierProduct {
  supplierKey: "iosys"
  supplierProductCode: string
  sourceUrl: string
  brandText: string | null
  modelText: string | null
  modelNumber: string | null // carrier/region model code, e.g. SO-52C / SC-54D / A301SH
  color: string | null // canonical English (for inventory + customer-facing)
  colorJa: string | null // original Japanese token (for the Kaitori side)
  storageGb: number | null
  ramGb: number | null
  rankText: string | null // supplier-native rank (e.g. "新品", "Aランク")
  conditionGrade: "S" | "A" | "B" | "C" | "D" | "J" | null
  supplierPrice: number | null // our cost (JPY)
  stock: number | null
  imageUrls: string[] // full listing gallery (may be empty)
  specs: NormalizedSupplierSpecs // parsed from the <div id="spec"> table
  includedAccessories: string | null // verbatim 付属品 text
}

export interface SupplierAdapter {
  key: string
  matches(url: string): boolean
  extractCode(input: string): string | null
  parse(html: string, input: string): NormalizedSupplierProduct
}
```

- [ ] **Step 3: Write the failing SO-52C test**

Append to `supabase/functions/_shared/supplier-adapters/iosys.test.ts`:

```ts
// --- Sony SO-52C (Android, no storage token in title, JP color, spec table) ----------
const so52cHtml = await Deno.readTextFile(
  new URL("./__fixtures__/iosys-so-52c.html", import.meta.url),
)
const so52cUrl =
  "https://iosys.co.jp/items/smartphone/xperia10/docomo/xperia10_iv_so-52c/278266"

Deno.test("iosys: SO-52C Android — modelNumber, JP color, grade, spec table, accessories", () => {
  const p = iosysAdapter.parse(so52cHtml, so52cUrl)
  assertEquals(p.modelNumber, "SO-52C")
  assertEquals(p.colorJa, "ミント")
  assertEquals(p.color, "Mint")
  assertEquals(p.conditionGrade, "C")
  assertEquals(p.storageGb, 128)
  assertEquals(p.specs.ramGb, 6)
  assertEquals((p.specs.cpu ?? "").includes("Snapdragon 695") || (p.specs.cpu ?? "").includes("Snapdragon695"), true)
  assertEquals((p.includedAccessories ?? "").includes("箱"), true)
  assertEquals((p.includedAccessories ?? "").includes("マニュアル"), true)
})
```

- [ ] **Step 4: Run it to verify it fails**

Run (from the adapter dir):
```bash
cd supabase/functions/_shared/supplier-adapters && deno test --allow-read iosys.test.ts
```
Expected: FAIL — the new test errors because `p.modelNumber` / `p.specs` / `p.includedAccessories` are `undefined` and the assertions on `colorJa`/`color`/`conditionGrade`/`storageGb` are wrong (the current parser returns null color, grade A default).

- [ ] **Step 5: Merge the Android color maps into `colorJaToEn`**

In `supabase/functions/_shared/catalog/apple-colors.ts`, replace the `colorJaToEn` function (lines 76-84) with one that consults the Android maps too. Add the import at the top (after the file's opening comment, before `export const JA_TO_EN_COLOR`):

```ts
import {
  GALAXY_COLORS_JA_EN,
  XPERIA_COLORS_JA_EN,
  AQUOS_COLORS_JA_EN,
  PIXEL_COLORS_JA_EN,
  XIAOMI_COLORS_JA_EN,
  OPPO_COLORS_JA_EN,
  ARROWS_COLORS_JA_EN,
  HUAWEI_COLORS_JA_EN,
  ASUS_COLORS_JA_EN,
  MOTOROLA_COLORS_JA_EN,
} from "./android-listing.ts"
```

Then replace the `colorJaToEn` function body with:

```ts
// All Android brand color maps, consulted after the Apple map. Order is arbitrary — keys
// rarely collide, and where they do (e.g. ミント -> Mint) every map agrees.
const ANDROID_COLOR_MAPS: Record<string, string>[] = [
  GALAXY_COLORS_JA_EN,
  XPERIA_COLORS_JA_EN,
  AQUOS_COLORS_JA_EN,
  PIXEL_COLORS_JA_EN,
  XIAOMI_COLORS_JA_EN,
  OPPO_COLORS_JA_EN,
  ARROWS_COLORS_JA_EN,
  HUAWEI_COLORS_JA_EN,
  ASUS_COLORS_JA_EN,
  MOTOROLA_COLORS_JA_EN,
]

/** Resolve a Japanese color token to canonical English (Apple + all Android maps), or null. */
export function colorJaToEn(colorJa: string | null | undefined): string | null {
  if (!colorJa) return null
  const key = colorJa.trim()
  if (key in JA_TO_EN_COLOR) return JA_TO_EN_COLOR[key]
  const compact = key.replace(/[\s　]+/g, "")
  if (compact in JA_TO_EN_COLOR) return JA_TO_EN_COLOR[compact]
  for (const m of ANDROID_COLOR_MAPS) {
    if (key in m) return m[key]
    if (compact in m) return m[compact]
  }
  return null
}
```

- [ ] **Step 6: Implement the parser changes**

In `supabase/functions/_shared/supplier-adapters/iosys.ts`, make these edits:

(a) Extend `RANK_TO_GRADE` to cover the `中古Xランク` forms and a bare J. Replace the map (lines 6-19) with:

```ts
const RANK_TO_GRADE: Record<string, NormalizedSupplierProduct["conditionGrade"]> = {
  "新品": "S",
  "未使用": "S",
  "未使用品": "S",
  "new": "S",
  "s": "S",
  "a": "A",
  "aランク": "A",
  "b": "B",
  "bランク": "B",
  "c": "C",
  "cランク": "C",
  "d": "D",
  "dランク": "D",
  "j": "J",
  "jランク": "J",
}
```

(b) Add helper functions just below `pickSpec` (after line 109). These parse the spec table, model number, and accessories:

```ts
/** Parse the <div id="spec"> ... <table> ... </table> into a label->value map. */
function parseSpecTable(html: string): Record<string, string> {
  const out: Record<string, string> = {}
  const block = html.match(/<div[^>]*id="spec"[\s\S]*?<table[\s\S]*?<\/table>/i)
  const scope = block ? block[0] : html
  for (const row of scope.matchAll(/<tr[^>]*>\s*<th[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/gi)) {
    const label = decodeEntities(row[1].replace(/<[^>]+>/g, "").trim())
    const value = decodeEntities(row[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
    if (label) out[label] = value
  }
  return out
}

/** Extract a Japanese carrier model code (SO-52C, SC-54D, A301SH, XQ-CT44, SCG14...) from text. */
function extractModelNumber(...candidates: (string | null)[]): string | null {
  const re =
    /\b(SO-\d{2}[A-Za-z]+|SOG\d+|SOV\d+|XQ-[A-Z]{2}\d{2}|SC-\d{2}[A-Z]|SCG\d+|SCV\d+|SM-[A-Z0-9]+|SH-(?:RM)?\d+[A-Z]?|SHG\d+|SHV\d+|F-\d{2}[A-Z]|FCG\d+|CPH\d+|OPG\d+|XIG\d+|G[A-Z0-9]{4}|A\d{3}(?:SH|SO|OP|XM|MO|FC)|XT\d{4}-\d|HWV\d+|HW-\d{2}[A-Z])\b/
  for (const c of candidates) {
    if (!c) continue
    const m = c.match(re)
    if (m) return m[1]
  }
  return null
}

/** "5.0インチ" / "6.1 inch" -> 6.1 (numeric). Null if not parseable. */
function parseScreenInches(str: string | null): number | null {
  if (!str) return null
  const m = str.match(/(\d+(?:\.\d+)?)\s*(?:インチ|inch|"|型)/i)
  if (!m) return null
  const n = parseFloat(m[1])
  return Number.isFinite(n) ? n : null
}

/** "2022年6月" / "2022/06" / "2022" -> 2022. Null if no 4-digit year. */
function parseYear(str: string | null): number | null {
  if (!str) return null
  const m = str.match(/(20\d{2})/)
  return m ? Number(m[1]) : null
}
```

(c) Inside `parse()`, replace the color block (lines 170-175) so colorJa does NOT require a storage token, and parse the model number first so it can anchor the color:

```ts
  // Model number (carrier/region code) — from the URL slug and the title. Anchors the color.
  const modelNumber = extractModelNumber(modelText, title, input)

  // Color: iosys lists the Japanese token. For Apple titles it follows the storage
  // ("128GB ホワイト"); for Android titles there is NO storage token, so fall back to the
  // token after the model number (and before any 【...】 bracket). Keep colorJa raw and derive
  // canonical English (now consulting the Android color maps too). Unknown tokens stay raw.
  let colorJa: string | null = null
  if (title) {
    const storageAnchored = title.match(/\d+\s*(?:GB|TB)\s+([^【|]+)/i)
    if (storageAnchored) {
      colorJa = decodeEntities(storageAnchored[1].trim())
    } else if (modelNumber) {
      // text after the model number up to the first 【 / | / end
      const afterCode = title.split(modelNumber)[1] ?? ""
      const codeAnchored = afterCode.match(/^\s*([^【|]+)/)
      if (codeAnchored) colorJa = decodeEntities(codeAnchored[1].trim()) || null
    }
  }
  const color = colorJaToEn(colorJa) ?? colorJa
```

(d) Parse the spec table and use it to correct storage/RAM and fill the `specs` object. Replace the storage/RAM/rank blocks (lines 177-188) with:

```ts
  // Spec table (<div id="spec"><table>): authoritative for OS/CPU/RAM/ROM/screen/camera/etc.
  const spec = parseSpecTable(html)
  const specRamGb = parseStorage(spec["RAM"] ?? null)
  const specStorageGb = parseStorage(spec["ROM"] ?? spec["容量"] ?? null)

  // Storage: spec table ROM > JSON-LD ストレージ > title token.
  const storageGb =
    specStorageGb ??
    parseStorage(pickSpec(ldDescription, "ストレージ")) ??
    parseStorage(title)

  // RAM: spec table > JSON-LD メモリ.
  const ramGb = specRamGb ?? parseStorage(pickSpec(ldDescription, "メモリ"))

  const specs: NormalizedSupplierProduct["specs"] = {
    os: spec["OS"] ?? null,
    cpu: spec["CPU"] ?? null,
    ramGb: specRamGb,
    storageGb: specStorageGb,
    screenSize: parseScreenInches(spec["ディスプレイ"] ?? null),
    camera: spec["カメラ"] ?? null,
    comms: spec["通信"] ?? null,
    bands: spec["電波帯"] ?? null,
    externalMemory: spec["外部メモリ"] ?? null,
    year: parseYear(spec["発売日"] ?? null),
    ports: spec["接続端子"] ?? null,
  }

  // Rank / condition: <p class="condition">, the spec table 状態, OR a 中古Xランク token
  // anywhere in the page body (the SO-52C page expresses grade only as "中古Cランク").
  const rankText =
    pick(html, /<p class="condition">\s*([^<]+?)\s*<\/p>/) ??
    (spec["状態"] ?? null) ??
    pickSpec(ldDescription, "状態") ??
    (() => {
      const m = html.match(/中古\s*([SABCDJ])\s*ランク/i)
      return m ? m[1] : null
    })()
  const conditionGrade = mapRank(rankText)

  // Included accessories (付属品): verbatim text. Try the spec table first, then a labelled block.
  const includedAccessories =
    (spec["付属品"] ?? null) ??
    (() => {
      const m = html.match(/付属品[\s\S]{0,40}?<td[^>]*>([\s\S]*?)<\/td>/i)
      return m ? decodeEntities(m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()) || null : null
    })()
```

(e) Add the three new fields to the returned object. In the `return { ... }` block (lines 230-245), add `modelNumber,`, `specs,`, and `includedAccessories,` (e.g. after `modelText,` add `modelNumber,`; after `imageUrls,` add `specs,` and `includedAccessories,`).

- [ ] **Step 7: Run the parser tests**

Run:
```bash
cd supabase/functions/_shared/supplier-adapters && deno test --allow-read iosys.test.ts
```
Expected: PASS — including the existing iPhone 384323 test (its `modelNumber` is now `A3093`, but that test does not assert `modelNumber`, so it stays green) and the new SO-52C test.

- [ ] **Step 8: Run the full catalog + adapter suites (guard the color-map merge)**

Run:
```bash
cd supabase/functions/_shared && deno test --allow-read
```
Expected: the whole suite passes (the spec notes ~201 tests green pre-change). The merged `colorJaToEn` is additive (Apple keys still win first), so no existing assertion regresses.

- [ ] **Step 9: Commit**

```bash
git add supabase/functions/_shared/supplier-adapters/__fixtures__/iosys-so-52c.html \
        supabase/functions/_shared/supplier-adapters/types.ts \
        supabase/functions/_shared/supplier-adapters/iosys.ts \
        supabase/functions/_shared/supplier-adapters/iosys.test.ts \
        supabase/functions/_shared/catalog/apple-colors.ts
git commit -m "feat(iosys): parse modelNumber, no-storage JP color, grade, spec table, 付属品"
```

---

## Task 6: Deploy the parser (edge function) so the dialog sees the new fields

The dialog calls `fetch-supplier-product` (an edge function bundling `_shared`). The new parser fields only reach the UI after that function is redeployed.

**Files:** none (deploy only).

- [ ] **Step 1: Find the function that returns the parsed product**

Run:
```bash
grep -rln "supplier-adapters\|iosysAdapter\|NormalizedSupplierProduct" supabase/functions --include=index.ts
```
Expected: lists `supabase/functions/fetch-supplier-product/index.ts` (the function `fetchSupplierProduct` invokes).

- [ ] **Step 2: Deploy it**

Run:
```bash
supabase functions deploy fetch-supplier-product
```
Expected: `Deployed Functions on project aeiyinpxmazmfubotpdk: fetch-supplier-product`.

- [ ] **Step 3: Confirm the deployed function returns the new fields**

Run (replace `<URL>` with the SO-52C URL):
```bash
supabase functions invoke fetch-supplier-product --no-verify-jwt \
  --body '{"url":"https://iosys.co.jp/items/smartphone/xperia10/docomo/xperia10_iv_so-52c/278266"}'
```
Expected: JSON with `product.modelNumber == "SO-52C"`, `product.color == "Mint"`, `product.conditionGrade == "C"`, `product.specs.ramGb == 6`, and `product.includedAccessories` containing 箱. If `--no-verify-jwt` is rejected, invoke from the running app instead (Task 9 verification covers this).

- [ ] **Step 4: Commit (no code change — record the deploy in the message only if a config changed)**

No commit needed unless `supabase/config.toml` changed. Skip if `git status` is clean.

---

## Task 7: `findMatchingProductModel` — Android model_number branch + color_ja

Add an Android branch keyed on the parsed `modelNumber` between the Apple part-number stage and the clean-name fallback. Also let the color fallback compare against `color_ja`. The dialog passes `modelNumber` (Task 9 wires it).

**Files:**
- Modify: `src/services/product-models.ts:13-18` (extend `ProductModelMatchInput`)
- Modify: `src/services/product-models.ts:78-116` (add Android branch + color_ja compare)

- [ ] **Step 1: Add `modelNumber` to the match input**

In `src/services/product-models.ts`, replace the `ProductModelMatchInput` interface (lines 13-18) with:

```ts
export interface ProductModelMatchInput {
  brand?: string | null
  modelText?: string | null
  modelNumber?: string | null // carrier/region code for Android (SO-52C, SC-54D, ...)
  storageGb?: number | null
  color?: string | null
  colorJa?: string | null
}
```

- [ ] **Step 2: Add the Android `model_number` branch**

In `findMatchingProductModel`, immediately after the Apple part-number block (after line 89, before the `// (b) Fallback` comment), insert:

```ts
  // (a2) Android model_number exact match (SO-52C, SC-54D, ...). Disambiguate by color/storage.
  const modelNo = (input.modelNumber ?? "").trim()
  if (modelNo) {
    const { data, error } = await supabase
      .from('product_models')
      .select(select)
      .eq('model_number', modelNo)
      .eq('status', 'ACTIVE')
    if (error) throw error
    const rows = data ?? []
    if (rows.length > 0) {
      const wantStorage = normalizeStorageGb(input.storageGb)
      const wantColorEn = (input.color ?? '').trim().toLowerCase()
      const wantColorJa = (input.colorJa ?? '').trim()
      const storageMatches = wantStorage == null
        ? rows
        : rows.filter((r) => normalizeStorageGb((r as { storage_gb: unknown }).storage_gb) === wantStorage)
      const pool = storageMatches.length > 0 ? storageMatches : rows
      const byColor = pool.find((r) => {
        const en = ((r as { color: string | null }).color ?? '').trim().toLowerCase()
        const ja = ((r as { color_ja: string | null }).color_ja ?? '').trim()
        return (wantColorEn && en === wantColorEn) || (wantColorJa && ja === wantColorJa)
      })
      const chosen = byColor ?? pool[0]
      if (chosen) return toHero(chosen as Record<string, unknown>)
    }
  }
```

- [ ] **Step 3: Let the clean-name fallback also match color_ja**

In the same function, in the fallback color block (lines 112-114), replace the `exact` computation with one that also accepts a `color_ja` match:

```ts
  const wantColorJa = (input.colorJa ?? '').trim()
  const exact = (wantColor || wantColorJa)
    ? storageMatches.find((r) => {
        const en = ((r as { color: string | null }).color ?? '').trim().toLowerCase()
        const ja = ((r as { color_ja: string | null }).color_ja ?? '').trim()
        return (wantColor && en === wantColor) || (wantColorJa && ja === wantColorJa)
      })
    : undefined
```

- [ ] **Step 4: Build**

Run:
```bash
npm run build
```
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/services/product-models.ts
git commit -m "feat(match): Android model_number branch + color_ja disambiguation"
```

---

## Task 8: Spec enrichment of NULL fields on confident match

Add a service that fills ONLY the NULL absolute-spec fields of a matched/selected model from the parsed iosys specs — never overwriting existing values. Per the locked decision, the dialog calls this silently ONLY on a CONFIDENT match (Apple part_number exact OR Android model_number exact); fuzzy/manual selections defer enrichment.

**Files:**
- Modify: `src/services/product-models.ts` (add `enrichProductModelSpecs` after `updateProductModel`, ~line 293)

- [ ] **Step 1: Add the enrichment service**

In `src/services/product-models.ts`, after `updateProductModel` (ends line 293), add:

```ts
// Absolute (catalog) specs parsed from a supplier listing's spec table. Only the fields that
// belong canonically on product_models. ram/storage are stored as text on product_models.
export interface ParsedModelSpecs {
  cpu?: string | null
  chipset?: string | null
  ramGb?: number | null
  storageGb?: number | null
  screenSize?: number | null
  camera?: string | null
  ports?: string | null
  osFamily?: string | null
  year?: number | null
}

// Fill ONLY the NULL/empty absolute-spec fields of a product model from parsed specs. Never
// overwrites a value the model already has. Returns the number of fields written (0 = nothing to do).
// Caller gates this to CONFIDENT matches (Apple part# exact / Android model_number exact).
export async function enrichProductModelSpecs(
  modelId: string,
  current: Pick<ProductModel, 'cpu' | 'chipset' | 'ram_gb' | 'storage_gb' | 'screen_size' | 'camera' | 'ports' | 'os_family' | 'year'>,
  parsed: ParsedModelSpecs,
): Promise<number> {
  const updates: ProductModelUpdate = {}
  const isEmpty = (v: unknown) => v == null || v === ''
  if (isEmpty(current.cpu) && parsed.cpu) updates.cpu = parsed.cpu
  if (isEmpty(current.chipset) && parsed.chipset) updates.chipset = parsed.chipset
  if (isEmpty(current.ram_gb) && parsed.ramGb != null) updates.ram_gb = String(parsed.ramGb)
  if (isEmpty(current.storage_gb) && parsed.storageGb != null) updates.storage_gb = String(parsed.storageGb)
  if (isEmpty(current.screen_size) && parsed.screenSize != null) updates.screen_size = parsed.screenSize
  if (isEmpty(current.camera) && parsed.camera) updates.camera = parsed.camera
  if (isEmpty(current.ports) && parsed.ports) updates.ports = parsed.ports
  if (isEmpty(current.os_family) && parsed.osFamily) updates.os_family = parsed.osFamily
  if (isEmpty(current.year) && parsed.year != null) updates.year = parsed.year

  const keys = Object.keys(updates)
  if (keys.length === 0) return 0

  const { error } = await supabase.from('product_models').update(updates).eq('id', modelId)
  if (error) throw error
  return keys.length
}
```

- [ ] **Step 2: Build**

Run:
```bash
npm run build
```
Expected: build succeeds. (`ProductModel`, `ProductModelUpdate` are already imported at the top of the file, line 3.)

- [ ] **Step 3: Commit**

```bash
git add src/services/product-models.ts
git commit -m "feat(catalog): enrichProductModelSpecs — fill NULL spec fields only, never overwrite"
```

---

## Task 9: Dialog wiring — server-search picker, accessories field, create-with-dedup, enrichment

This task wires everything into `add-backorder-dialog.tsx`: stop fetching the whole table, pass the parsed `modelNumber`/`colorJa`/`specs` through, enrich on confident match, add the Included Accessories field, and enable guided create-with-dedup.

**Files:**
- Modify: `src/validators/backorder.ts` (add `included_accessories`)
- Modify: `src/components/backorders/add-backorder-dialog.tsx` (many spots — see steps)

- [ ] **Step 1: Add `included_accessories` to the validator**

In `src/validators/backorder.ts`, inside the `z.object({...})` after `cpu` (line 21), add:

```ts
    included_accessories: z.string().trim().optional(),
```

- [ ] **Step 2: Add it to the dialog's `defaultValues`**

In `src/components/backorders/add-backorder-dialog.tsx`, in `defaultValues` (after `cpu: '',` line 111), add:

```ts
  included_accessories: '',
```

- [ ] **Step 3: Extend `ParsedSupplierSpecs` to carry modelNumber + the spec object**

Replace the `ParsedSupplierSpecs` interface (lines 57-64) with:

```tsx
interface ParsedSupplierSpecs {
  storageGb: number | null
  color: string | null
  colorJa: string | null
  ramGb: number | null
  brandText: string | null
  modelText: string | null
  modelNumber: string | null
  // Absolute catalog specs parsed from the iosys spec table (for NULL-field enrichment).
  cpu: string | null
  screenSize: number | null
  camera: string | null
  ports: string | null
  osFamily: string | null
  year: number | null
}
```

- [ ] **Step 4: Stop loading the whole table; keep only the small default/off-list set**

Replace the `useProductModelsWithHeroImage()` import-and-call so the picker gets a SMALL set, not 1000 rows. Change line 39 import to also bring in nothing extra (keep), and change the data hook (line 126).

Replace line 126:
```ts
  const { data: products } = useProductModelsWithHeroImage()
```
with:
```ts
  // Do NOT load the whole table (1000-row cap bug). The picker searches the server itself; here we
  // only keep the auto-matched row so it stays visible/selectable when off the default list.
  const products: ProductModelWithHeroImage[] = []
```
Remove the now-unused import on line 39:
```ts
import { useProductModelsWithHeroImage } from '@/hooks/use-product-models'
```
(delete that line entirely).

- [ ] **Step 5: Import the enrichment service + create hook**

Update the import on line 41 and add the enrichment/create imports. Replace line 41:
```ts
import { findMatchingProductModel, cleanModelName } from '@/services/product-models'
```
with:
```ts
import {
  findMatchingProductModel,
  cleanModelName,
  enrichProductModelSpecs,
  searchProductModels,
} from '@/services/product-models'
import { useCreateProductModel } from '@/hooks/use-product-models'
```

Then inside the component, after `const { data: suppliers } = useSuppliers()` (line 127), add:
```ts
  const createProductModel = useCreateProductModel()
```

- [ ] **Step 6: Pass the parsed model number + colorJa + specs through on Fetch**

In `handleFetch`, replace the `setParsed({...})` call (lines 244-251) with:

```ts
      setParsed({
        storageGb: product.storageGb ?? null,
        color: product.color ?? null,
        colorJa: product.colorJa ?? null,
        ramGb: product.ramGb ?? null,
        brandText: product.brandText ?? null,
        modelText: product.modelText ?? null,
        modelNumber: product.modelNumber ?? null,
        cpu: product.specs?.cpu ?? null,
        screenSize: product.specs?.screenSize ?? null,
        camera: product.specs?.camera ?? null,
        ports: product.specs?.ports ?? null,
        osFamily: product.specs?.os ?? null,
        year: product.specs?.year ?? null,
      })
```

Also prefill the accessories field. After `form.setValue('supplier_url', url.trim())` (line 223), add:
```ts
      form.setValue('included_accessories', product.includedAccessories ?? '')
```

- [ ] **Step 7: Use modelNumber + colorJa in the auto-match, and enrich on confident match**

Replace the `findMatchingProductModel` try-block (lines 257-270) with:

```ts
      try {
        const isApplePart = /\b[A-Z0-9]{4,7}\/[A-Z]{1,2}\b/.test(product.modelText ?? '')
        const match = await findMatchingProductModel({
          brand: product.brandText,
          modelText: product.modelText,
          modelNumber: product.modelNumber,
          storageGb: product.storageGb,
          color: product.color,
          colorJa: product.colorJa,
        })
        if (match) {
          setMatchedModel(match)
          form.setValue('product_id', match.id)
          // Confident match = Apple part# exact OR Android model_number exact. Enrich NULL specs
          // silently; fuzzy/manual selections defer enrichment (handled by staff confirming).
          const confident = isApplePart || Boolean(product.modelNumber && match.model_number)
          if (confident && product.specs) {
            try {
              const written = await enrichProductModelSpecs(
                match.id,
                {
                  cpu: match.cpu,
                  chipset: match.chipset,
                  ram_gb: match.ram_gb,
                  storage_gb: match.storage_gb,
                  screen_size: match.screen_size,
                  camera: match.camera,
                  ports: match.ports,
                  os_family: match.os_family,
                  year: match.year,
                },
                {
                  cpu: product.specs.cpu,
                  ramGb: product.specs.ramGb,
                  storageGb: product.specs.storageGb,
                  screenSize: product.specs.screenSize,
                  camera: product.specs.camera,
                  ports: product.specs.ports,
                  osFamily: product.specs.os,
                  year: product.specs.year,
                },
              )
              if (written > 0) {
                await queryClient.invalidateQueries({ queryKey: ['product-models'] })
                toast.success(`Filled ${written} missing spec field(s) on the model`)
              }
            } catch {
              // enrichment is best-effort; never block the flow
            }
          }
        }
      } catch {
        // ignore — manual picker selection remains available
      }
```

- [ ] **Step 8: Wire the picker: pass the small product set, categoryId, and create-with-dedup**

Replace the `<ProductPicker .../>` usage (lines 550-555) with:

```tsx
                    <ProductPicker
                      value={field.value}
                      onSelect={field.onChange}
                      products={productList}
                      initialSearch={pickerSearch || parsedHint || undefined}
                      categoryId={matchedModel?.category_id ?? undefined}
                      onCreate={handleCreateProduct}
                    />
```

- [ ] **Step 9: Implement guided create-with-dedup (`handleCreateProduct`)**

Add this function inside the component, just before `handleSubmit` (before line 433). It re-runs `searchProductModels` on brand + model + model_number, shows near-matches, and requires explicit confirmation before inserting:

```ts
  // Guided "Create Product" with a dedup preview. Before inserting, re-run the search RPC on
  // brand + model name + model number; if near-matches exist, require an explicit confirm so a
  // model that merely failed to surface isn't duplicated.
  async function handleCreateProduct(values: ProductModelFormValues): Promise<string> {
    const probe = [values.brand, values.model_name, values.model_number]
      .filter(Boolean)
      .join(' ')
      .trim()
    if (probe) {
      try {
        const near = await searchProductModels(probe, undefined, 5)
        if (near.length > 0) {
          const list = near
            .map((m) => `• ${m.brand} ${m.model_name}${m.model_number ? ` (${m.model_number})` : ''} — ${m.color}`)
            .join('\n')
          const proceed = window.confirm(
            `Possible existing matches found:\n\n${list}\n\nCreate a NEW product model anyway?`,
          )
          if (!proceed) {
            // Adopt the closest existing row instead of creating a duplicate.
            setMatchedModel(near[0])
            form.setValue('product_id', near[0].id)
            throw new Error('cancelled-create-adopted-existing')
          }
        }
      } catch (err) {
        if (err instanceof Error && err.message === 'cancelled-create-adopted-existing') throw err
        // search failure is non-fatal; fall through to create
      }
    }
    const created = await createProductModel.mutateAsync(values as unknown as ProductModelInsert)
    setMatchedModel({
      ...(created as ProductModel),
      hero_image_url: null,
      media_count: 0,
      categories: null,
    } as ProductModelWithHeroImage)
    return created.id
  }
```

Add the needed imports at the top of the file (with the other type/value imports near line 49-51):
```ts
import type { ProductModelFormValues } from '@/validators/product-model'
import type { ProductModel, ProductModelInsert, ProductModelWithHeroImage } from '@/lib/types'
```
(Replace the existing `import type { ProductModelWithHeroImage } from '@/lib/types'` on line 51 with this combined import; add the `ProductModelFormValues` import if not already present.)

- [ ] **Step 10: Persist `included_accessories` in `createBackorderLine`**

In `handleSubmit`, in the `createBackorderLine({...})` call, after `cpu: values.cpu?.trim() || null,` (line 461), add:

```ts
        included_accessories: values.included_accessories?.trim() || null,
```

- [ ] **Step 11: Add the Included Accessories form field to the UI**

In the JSX, after the CPU `FormField` block (ends ~line 719, the field with `name="cpu"`), add a new field:

```tsx
              {/* Included accessories — prefilled from the iosys 付属品 list, editable; carried
                  onto the item when the backorder is received. */}
              <FormField
                control={form.control}
                name="included_accessories"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Included Accessories</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ''} placeholder="e.g. 箱 / マニュアル" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
```

- [ ] **Step 12: Build**

Run:
```bash
npm run build
```
Expected: build succeeds with no TS errors. (`productList` still merges `matchedModel` into the small `products` array, so the off-list matched row stays visible.)

- [ ] **Step 13: Lint**

Run:
```bash
npm run lint
```
Expected: no new errors. (If lint flags `productList` no longer needing `products` in deps, leave the memo as-is — it reads both.)

- [ ] **Step 14: Commit**

```bash
git add src/validators/backorder.ts src/components/backorders/add-backorder-dialog.tsx
git commit -m "feat(backorder): server-search picker, accessories field, create-with-dedup, spec enrichment"
```

---

## Task 10: Multi-brand verification harness (real iosys fetch + assert)

A runnable Deno script that fetches real iosys single-product URLs for several brands, runs the parser, and asserts color (EN+JA), grade, specs, modelNumber, and accessories per brand — plus a small in-script check that the search-RPC query forms are tolerant. This is the `/loop` driver from the spec; run it until all brands are green.

**Files:**
- Create: `supabase/functions/_shared/supplier-adapters/verify-multibrand.ts`

- [ ] **Step 1: Write the harness**

Create `supabase/functions/_shared/supplier-adapters/verify-multibrand.ts`:

```ts
// Multi-brand Add-Backorder verification harness. Fetches REAL iosys single-product pages,
// runs the iosys parser, and asserts color/grade/specs/modelNumber/accessories per brand.
// Run: deno run --allow-net supabase/functions/_shared/supplier-adapters/verify-multibrand.ts
// Iterate via /loop until every brand prints PASS. URLs are live; if a listing 404s (sold out),
// swap it for another single-product URL of the same brand from iosys.co.jp.
import { iosysAdapter } from "./iosys.ts"

interface Case {
  brand: string
  url: string
  // Soft expectations: a missing/null parse is a FAIL only for the listed keys.
  expect: {
    modelNumberLike?: RegExp
    colorEnNotNull?: boolean
    colorJaNotNull?: boolean
    gradeNotNull?: boolean
    storageNotNull?: boolean
    cpuNotNull?: boolean
    accessoriesNotNull?: boolean
  }
}

const CASES: Case[] = [
  {
    brand: "Sony Xperia (SO-52C)",
    url: "https://iosys.co.jp/items/smartphone/xperia10/docomo/xperia10_iv_so-52c/278266",
    expect: { modelNumberLike: /SO-52C/, colorEnNotNull: true, colorJaNotNull: true, gradeNotNull: true, storageNotNull: true, cpuNotNull: true, accessoriesNotNull: true },
  },
  // Fill these with current live single-product URLs (one per brand) before running. Pick any
  // in-stock unit from each brand's iosys section:
  { brand: "Apple iPhone", url: "https://iosys.co.jp/items/smartphone/iphone/simfree/", expect: { colorEnNotNull: true, gradeNotNull: true, storageNotNull: true } },
  { brand: "Apple iPad",   url: "https://iosys.co.jp/items/tablet/ipad/wifi/",          expect: { colorEnNotNull: true, gradeNotNull: true, storageNotNull: true } },
  { brand: "Samsung Galaxy", url: "https://iosys.co.jp/items/smartphone/galaxy/",       expect: { modelNumberLike: /SC-|SM-|SCG|SCV/, colorEnNotNull: true, gradeNotNull: true } },
  { brand: "Sharp AQUOS",    url: "https://iosys.co.jp/items/smartphone/aquos/",        expect: { modelNumberLike: /SH-|SHG|SHV/, gradeNotNull: true } },
  { brand: "Google Pixel",   url: "https://iosys.co.jp/items/smartphone/pixel/",        expect: { colorEnNotNull: true, gradeNotNull: true } },
]

function check(label: string, ok: boolean, detail: string): boolean {
  console.log(`  ${ok ? "✓" : "✗"} ${label}: ${detail}`)
  return ok
}

let anyFail = false
for (const c of CASES) {
  console.log(`\n=== ${c.brand} ===\n  ${c.url}`)
  // Resolve the section URL to a concrete product URL when needed: fetch and grab the first
  // /items/.../<digits> link. (Single-product URLs like SO-52C are used directly.)
  let productUrl = c.url
  let html = ""
  try {
    const res = await fetch(c.url, { headers: { "User-Agent": "Mozilla/5.0" } })
    html = await res.text()
    if (!/\/items\/[^"']*\/\d{4,}/.test(productUrl)) {
      const m = html.match(/href="(\/items\/[^"']*\/\d{4,})"/)
      if (m) {
        productUrl = "https://iosys.co.jp" + m[1]
        const r2 = await fetch(productUrl, { headers: { "User-Agent": "Mozilla/5.0" } })
        html = await r2.text()
        console.log(`  -> resolved product: ${productUrl}`)
      }
    }
  } catch (e) {
    console.log(`  ✗ fetch failed: ${e instanceof Error ? e.message : e}`)
    anyFail = true
    continue
  }

  const p = iosysAdapter.parse(html, productUrl)
  let pass = true
  if (c.expect.modelNumberLike) pass = check("modelNumber", c.expect.modelNumberLike.test(p.modelNumber ?? ""), String(p.modelNumber)) && pass
  if (c.expect.colorEnNotNull) pass = check("color (EN)", p.color != null, String(p.color)) && pass
  if (c.expect.colorJaNotNull) pass = check("color (JA)", p.colorJa != null, String(p.colorJa)) && pass
  if (c.expect.gradeNotNull) pass = check("grade", p.conditionGrade != null, String(p.conditionGrade)) && pass
  if (c.expect.storageNotNull) pass = check("storage", p.storageGb != null, String(p.storageGb)) && pass
  if (c.expect.cpuNotNull) pass = check("cpu", p.specs.cpu != null, String(p.specs.cpu)) && pass
  if (c.expect.accessoriesNotNull) pass = check("accessories", p.includedAccessories != null, String(p.includedAccessories)) && pass
  console.log(`  ${pass ? "PASS" : "FAIL"}`)
  if (!pass) anyFail = true
}

console.log(`\n${anyFail ? "SOME BRANDS FAILED" : "ALL BRANDS PASS"}`)
if (anyFail) Deno.exit(1)
```

- [ ] **Step 2: Run the harness**

Run:
```bash
deno run --allow-net supabase/functions/_shared/supplier-adapters/verify-multibrand.ts
```
Expected: each brand prints `PASS`, ending `ALL BRANDS PASS`. If a brand FAILs on a real per-brand title/spec-table quirk, fix the parser in `iosys.ts` (and add a fixture-based assertion to `iosys.test.ts` for that quirk), re-run Task 5's `deno test`, redeploy (Task 6), then re-run this harness. Iterate via `/loop` until green.

- [ ] **Step 3: Verify the search RPC against the same parsed strings (manual SQL spot-check)**

For each brand that PASSed, take its parsed `brandText + modelText` and a glued/hyphen/JP-color variant, and confirm the RPC returns the model. Example for Sony:
```bash
supabase db query --linked "SELECT brand, model_name, model_number, color FROM public.search_product_models('Sony Xperia10 IV SO52C ミント', NULL, 5);"
```
Expected: the matching `Sony | Xperia 10 IV | SO-52C` row appears. Repeat with each brand's parsed string + one formatting variant.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/supplier-adapters/verify-multibrand.ts
git commit -m "test(backorder): multi-brand iosys parse+search verification harness"
```

---

## Task 11: End-to-end manual verification in the running app

**Files:** none (manual verification + PROJECT_STATE update).

- [ ] **Step 1: Run the app and exercise Add Backorder**

Run:
```bash
npm run dev
```
Open the admin Backorders page, click Add Backorder, paste `https://iosys.co.jp/items/smartphone/xperia10/docomo/xperia10_iv_so-52c/278266`, click Fetch.

Expected (matches the spec's per-URL assertions):
1. Parsed line shows the Sony Xperia model; Color = `Mint` (English) + `ミント` (Japanese); Grade = `C`; Storage = `128`; RAM = `6`; CPU contains `Snapdragon 695`.
2. The Product Model picker auto-selects `Sony Xperia 10 IV (SO-52C)` Mint (off-list row visible).
3. Typing `Xperia10`, `SO52C`, or `ミント` into the picker returns the model (server search).
4. The model's previously-NULL `storage_gb` is filled to 128 (toast "Filled N missing spec field(s)"); existing values untouched.
5. Included Accessories field is prefilled (e.g. `箱 / マニュアル`), editable.

- [ ] **Step 2: Verify create-with-dedup**

In the picker, clear the selection, search a non-existent string, click "Create Product", fill an obviously duplicate model (e.g. brand `Sony`, model `Xperia 10 IV`, model_number `SO-52C`), submit. Expected: a confirm dialog lists the existing SO-52C match; clicking Cancel adopts the existing row instead of inserting a duplicate.

- [ ] **Step 3: Verify enrichment did not overwrite**

Run:
```bash
supabase db query --linked "SELECT model_name, storage_gb, ram_gb, cpu, screen_size FROM public.product_models WHERE model_number='SO-52C' ORDER BY storage_gb;"
```
Expected: `storage_gb` now populated; pre-existing `ram_gb=6` and `cpu` unchanged (not overwritten with a different value).

- [ ] **Step 4: Update PROJECT_STATE.md**

Add a "Recently shipped" entry to `docs/PROJECT_STATE.md` summarizing: search_product_models RPC, robust iosys parser (modelNumber/spec-table/付属品/JP-color/grade), Android match branch, NULL-only spec enrichment, included_accessories on lines+items carried at fulfillment, async ProductPicker. List touched files.

- [ ] **Step 5: Commit**

```bash
git add docs/PROJECT_STATE.md
git commit -m "docs(state): backorder fuzzy-search + robust iosys parser shipped (v1.78.0)"
```

---

## Self-Review

**1. Spec coverage** (each spec section → task):
- Workstream A (server fuzzy search, causes 1 & 2): Task 2 (RPC: color_ja in haystack, word-boundary OR separator-stripped normalize, ranking, LIMIT, GRANT), Task 3 (service+hook+key), Task 4 (async picker, shouldFilter=false, debounce, empty-state default). ✓
- Workstream B (robust parser, cause 3): Task 5 — modelNumber, no-storage colorJa, merged color map (ミント→Mint), grade incl. 中古Cランク, spec table (os/cpu/ram/rom/screen/camera/comms/bands/externalMemory/year/ports), 付属品; Task 6 deploys it. ✓
- Workstream C (auto-match Android + enrichment, cause 4 + specs decision): Task 7 (Android model_number branch + color_ja), Task 8 (enrich NULL only), Task 9 step 7 (confident-match gating: Apple part# OR Android model_number). ✓
- Workstream D (create-if-missing guided + dedup): Task 9 step 9 (`handleCreateProduct` re-runs search RPC, shows near-matches, requires explicit confirm, adopts existing on cancel). ✓
- Workstream E (accessories storage): Task 1 (migration: columns + carry at fulfillment), Task 9 (validator + prefill + field + persist). ✓
- Verification via /loop multi-brand (Apple iPhone+iPad, Sony incl SO-52C, Samsung, Sharp AQUOS, Google Pixel; glued/hyphen/JP-color variants): Task 10 (runnable harness) + Task 11 (in-app E2E). ✓
- Locked decisions: #1 enrich-NULL-only on confident match (Tasks 8/9), #2 guided create+dedup (Task 9), #3 one shared RPC wired to Add Backorder first (Tasks 2-4, 9; intake/Messages out of scope — not implemented, correct), #4 accessories raw text on both tables + carried to item (Tasks 1/9), #5 empty-query picker shows small set not whole table (Task 4 + Task 9 step 4). ✓
- Out-of-scope items (intake/Messages picker adoption, data backfill, accessory taxonomy, non-iosys adapters) are correctly NOT given tasks.

**2. Placeholder scan:** No "TBD/TODO/handle errors/similar to Task N". Every code step contains real code. The two areas requiring live inspection are explicitly bounded with verification commands and adjustment instructions (Task 5 step 1: confirm spec-table label text from the saved fixture; Task 10: fill concrete per-brand product URLs) — these are genuine "the live HTML must be read" steps, not hand-waving, and each ships with the exact command to read the truth and the fallback if it differs.

**3. Type/name consistency:**
- `searchProductModels(query, categoryId?, limit?)` — defined Task 3, used Task 9 (`searchProductModels(probe, undefined, 5)`). ✓
- `useProductModelSearch(query, categoryId?)` — defined Task 3, used Task 4. ✓
- `queryKeys.productModels.search(query, categoryId?)` — defined Task 3, used Task 3. ✓
- `findMatchingProductModel` input gains `modelNumber`/`colorJa` (Task 7), passed in Task 9. ✓
- `enrichProductModelSpecs(modelId, current, parsed)` with `ParsedModelSpecs` — defined Task 8, called Task 9 with matching field names (`cpu/chipset/ram_gb/storage_gb/screen_size/camera/ports/os_family/year` current; `cpu/ramGb/storageGb/screenSize/camera/ports/osFamily/year` parsed). ✓
- `NormalizedSupplierProduct` new fields `modelNumber/specs/includedAccessories` + `NormalizedSupplierSpecs` — defined Task 5, consumed Task 9. ✓
- `colorJaToEn` signature unchanged (Task 5) — callers in `iosys.ts` and android tests unaffected. ✓
- RPC name `search_product_models` consistent across Tasks 2/3/9/10. ✓
- `_spm_normalize` helper name consistent within Task 2. ✓
- `ProductPicker` new optional `categoryId` prop (Task 4) used in Task 9; existing callers unaffected (optional). ✓
- product_models spec columns used in enrichment (`cpu, chipset, ram_gb, storage_gb, screen_size, camera, ports, os_family, year`) all verified present in `database.types.ts`. ✓
- items/backorder_lines `included_accessories` column (Task 1) matches validator/insert field name (Task 9) and the fulfillment carry (Task 1 SQL). ✓

No inconsistencies found. Plan is complete.
