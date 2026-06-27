# Backorder / Pre-order Supplier Inventory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let staff add supplier (iosys) listings as quantity-bearing **backorder lines** (B-codes) that surface in inventory search, are offered to customers as labeled pre-orders, and are fulfilled by a manual B→P swap once real stock is intaken.

**Architecture:** A new `backorder_lines` table (B-code, mirrors item spec columns) feeds a third inventory-search RPC alongside items and sell-groups. A `fetch-supplier-product` edge function parses iosys pages via a pluggable per-supplier adapter into a normalized payload. Customer confirmations create normal orders whose `order_items` point at a B-line until staff scan a matching P-code; a transactional RPC enforces spec-match (hard-block on core specs) and performs the swap. A "To Fulfill" worklist drives procurement.

**Tech Stack:** Supabase Postgres (migrations + plpgsql RPCs), Deno edge functions + `_shared` modules (Deno test for TDD), React 18 + Vite + TypeScript, TanStack Query, React Hook Form + Zod, shadcn/ui.

**Reference spec:** `docs/superpowers/specs/2026-06-27-backorder-supplier-inventory-design.md`

**Conventions to follow (existing analogs):**
- Service file pattern: `src/services/sell-groups.ts`
- Description formatter: `src/lib/utils.ts` `getItemDescription()` and edge `_shared/item-description.ts`
- Search RPC + shaping: `supabase/functions/_shared/inventory-search.ts` (+ `.test.ts`)
- Admin list page: `src/pages/admin/items.tsx`; sidebar: `src/components/layout/sidebar.tsx`
- Migration naming: `YYYYMMDDHHMMSS_snake_case.sql`; grants per `20260528000000_explicit_public_grants.sql`
- Deno tests run: `deno test --allow-all supabase/functions/_shared/<file>.test.ts`
- Migrations apply: `supabase db push` (full access via CLI — apply automatically)
- Types regen: `supabase gen types typescript --local > src/lib/database.types.ts` (then re-export in `types.ts` as existing)

---

## Phase 1 — Data model & code generation

### Task 1: `backorder_lines` table + B-code sequence

**Files:**
- Create: `supabase/migrations/20260627120000_backorder_lines.sql`

- [ ] **Step 1: Write the migration**

```sql
-- B-code sequence (mirrors p_code_seq / g_code_seq)
CREATE SEQUENCE IF NOT EXISTS b_code_seq START 1;

-- Status enums
DO $$ BEGIN
  CREATE TYPE backorder_line_status AS ENUM ('ACTIVE', 'PAUSED', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE public.backorder_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  backorder_code text UNIQUE NOT NULL,
  product_id uuid NOT NULL REFERENCES public.product_models(id),
  condition_grade condition_grade NOT NULL,
  color text,
  storage_gb integer,
  ram_gb integer,
  cpu text,
  screen_size numeric,
  condition_notes text,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id),
  supplier_price numeric,
  selling_price numeric,
  supplier_url text,
  supplier_product_code text,
  supplier_stock integer,
  quantity_total integer NOT NULL DEFAULT 0,
  quantity_reserved integer NOT NULL DEFAULT 0,
  quantity_received integer NOT NULL DEFAULT 0,
  available integer GENERATED ALWAYS AS (quantity_total - quantity_reserved - quantity_received) STORED,
  lead_time_days integer NOT NULL DEFAULT 7,
  photo_group_id uuid REFERENCES public.photo_groups(id),
  status backorder_line_status NOT NULL DEFAULT 'ACTIVE',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_backorder_lines_status ON public.backorder_lines(status);
CREATE INDEX idx_backorder_lines_product ON public.backorder_lines(product_id);

-- updated_at trigger (reuse existing function used by other tables)
CREATE TRIGGER set_backorder_lines_updated_at
  BEFORE UPDATE ON public.backorder_lines
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS: staff (authenticated) full access; anon read for search surfaces
ALTER TABLE public.backorder_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY backorder_lines_auth_all ON public.backorder_lines
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY backorder_lines_anon_read ON public.backorder_lines
  FOR SELECT TO anon USING (status = 'ACTIVE');

GRANT ALL ON public.backorder_lines TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.b_code_seq TO anon, authenticated, service_role;

-- Curated photos for a backorder line (used only when photo_group_id is null)
DO $$ BEGIN
  CREATE TYPE backorder_media_source AS ENUM ('iosys','web','manual');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE public.backorder_line_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  backorder_line_id uuid NOT NULL REFERENCES public.backorder_lines(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  source backorder_media_source NOT NULL DEFAULT 'iosys',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_backorder_line_media_line ON public.backorder_line_media(backorder_line_id, sort_order);

ALTER TABLE public.backorder_line_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY backorder_media_auth_all ON public.backorder_line_media
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY backorder_media_anon_read ON public.backorder_line_media
  FOR SELECT TO anon USING (true);
GRANT ALL ON public.backorder_line_media TO anon, authenticated, service_role;

-- Public-read storage bucket for copied candidate photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('backorder-media', 'backorder-media', true)
ON CONFLICT (id) DO NOTHING;
```

> Mirror the storage RLS policy pattern of the existing `photo-group-media` bucket
> (public read; authenticated write) — copy those `storage.objects` policies and
> swap the bucket id. Find them with
> `grep -rn "photo-group-media" supabase/migrations`.

> **Before writing:** confirm the trigger function name. Run
> `grep -rn "FUNCTION public.set_updated_at\|updated_at()" supabase/migrations | head`.
> If the project uses a different name (e.g. `handle_updated_at`), use that name instead.
> Confirm the grade enum type name with
> `grep -rn "CREATE TYPE.*grade" supabase/migrations`.

- [ ] **Step 2: Apply and verify**

Run:
```bash
supabase db push
psql "$(supabase status -o json | python3 -c 'import sys,json;print(json.load(sys.stdin)["DB_URL"])')" \
  -c "select column_name, data_type from information_schema.columns where table_name='backorder_lines' order by ordinal_position;"
```
Expected: lists all columns including generated `available`.

- [ ] **Step 3: Verify B-code generation works**

Run:
```bash
psql "$DB_URL" -c "select generate_code('B','b_code_seq');"
```
Expected: `B000001`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260627120000_backorder_lines.sql
git commit -m "feat(db): backorder_lines table + b_code_seq"
```

### Task 2: `order_items` backorder linkage

**Files:**
- Create: `supabase/migrations/20260627120100_order_items_backorder.sql`

- [ ] **Step 1: Inspect current order_items shape**

Run: `grep -rn "create table public.order_items\|order_items" supabase/migrations/20260210000001_initial_schema.sql | head`
Confirm `item_id` current nullability and whether a unique constraint on `item_id` exists.

- [ ] **Step 2: Write the migration**

```sql
DO $$ BEGIN
  CREATE TYPE backorder_fulfillment_status AS ENUM ('AWAITING_ORDER','ORDERED','READY','FULFILLED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS backorder_line_id uuid REFERENCES public.backorder_lines(id),
  ADD COLUMN IF NOT EXISTS backorder_status backorder_fulfillment_status;

-- item_id must allow NULL for unfulfilled pre-orders
ALTER TABLE public.order_items ALTER COLUMN item_id DROP NOT NULL;

-- Legal combinations:
--  in-stock row:        item_id set,  backorder_line_id null
--  unfulfilled preorder: item_id null, backorder_line_id set, status in (AWAITING_ORDER,ORDERED,READY)
--  fulfilled preorder:  item_id set,  backorder_line_id set, status = FULFILLED
ALTER TABLE public.order_items ADD CONSTRAINT order_items_backorder_chk CHECK (
  (backorder_line_id IS NULL AND item_id IS NOT NULL AND backorder_status IS NULL)
  OR (backorder_line_id IS NOT NULL AND item_id IS NULL AND backorder_status IN ('AWAITING_ORDER','ORDERED','READY'))
  OR (backorder_line_id IS NOT NULL AND item_id IS NOT NULL AND backorder_status = 'FULFILLED')
);

CREATE INDEX idx_order_items_backorder_line ON public.order_items(backorder_line_id) WHERE backorder_line_id IS NOT NULL;
```

> If Step 1 found a `UNIQUE(item_id)` constraint, it stays valid because NULLs are
> not unique-checked in Postgres. Note that in the commit message if relevant.

- [ ] **Step 3: Apply and verify**

Run: `supabase db push` then
```bash
psql "$DB_URL" -c "\d+ public.order_items" | grep -E "backorder|item_id"
```
Expected: `backorder_line_id`, `backorder_status` present; `item_id` nullable; check constraint listed.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260627120100_order_items_backorder.sql
git commit -m "feat(db): order_items backorder linkage + status + check"
```

---

## Phase 2 — Backorder search RPC + result shaping

### Task 3: `search_available_backorder_lines` SQL function

**Files:**
- Create: `supabase/migrations/20260627120200_search_backorder_lines.sql`

- [ ] **Step 1: Read the existing function to mirror its shape exactly**

Run: `grep -rn "search_available_sell_groups" supabase/migrations | head` then read that function. Match its **return columns, parameter names, and ordering** so the three search functions are drop-in compatible.

- [ ] **Step 2: Write the migration (adapt columns to match the sell-groups function)**

```sql
CREATE OR REPLACE FUNCTION public.search_available_backorder_lines(
  search_query text DEFAULT NULL,
  result_limit integer DEFAULT 20,
  filter_brand text DEFAULT NULL,
  filter_category_id uuid DEFAULT NULL,
  price_min numeric DEFAULT NULL,
  price_max numeric DEFAULT NULL
)
RETURNS TABLE (
  backorder_code text,
  product_id uuid,
  brand text,
  model_name text,
  color text,
  storage_gb integer,
  ram_gb integer,
  cpu text,
  screen_size numeric,
  condition_grade condition_grade,
  selling_price numeric,
  available integer,
  lead_time_days integer,
  photo_group_id uuid,
  hero_media_url text,
  category_id uuid,
  description_fields jsonb
)
LANGUAGE sql STABLE AS $$
  SELECT
    bl.backorder_code, bl.product_id,
    pm.brand, pm.model_name,
    bl.color, bl.storage_gb, bl.ram_gb, bl.cpu, bl.screen_size,
    bl.condition_grade, bl.selling_price, bl.available, bl.lead_time_days,
    bl.photo_group_id, hero.file_url,
    c.id, c.description_fields
  FROM public.backorder_lines bl
  JOIN public.product_models pm ON pm.id = bl.product_id
  LEFT JOIN public.categories c ON c.id = pm.category_id
  LEFT JOIN LATERAL (
    SELECT file_url FROM public.backorder_line_media m
    WHERE m.backorder_line_id = bl.id ORDER BY m.sort_order LIMIT 1
  ) hero ON true
  WHERE bl.status = 'ACTIVE'
    AND bl.available > 0
    AND (search_query IS NULL
         OR bl.backorder_code ILIKE '%'||search_query||'%'
         OR pm.brand ILIKE '%'||search_query||'%'
         OR pm.model_name ILIKE '%'||search_query||'%'
         OR bl.color ILIKE '%'||search_query||'%')
    AND (filter_brand IS NULL OR pm.brand = filter_brand)
    AND (filter_category_id IS NULL OR pm.category_id = filter_category_id)
    AND (price_min IS NULL OR bl.selling_price >= price_min)
    AND (price_max IS NULL OR bl.selling_price <= price_max)
  ORDER BY bl.created_at DESC
  LIMIT result_limit;
$$;

GRANT EXECUTE ON FUNCTION public.search_available_backorder_lines TO anon, authenticated, service_role;
```

> Adjust `category_id` join column name if `product_models` uses a different FK
> (check with `grep -n "category" supabase/migrations/20260210000001_initial_schema.sql`).

- [ ] **Step 3: Apply and smoke-test**

Run: `supabase db push` then
```bash
psql "$DB_URL" -c "select * from search_available_backorder_lines(null,5);"
```
Expected: runs without error (empty until rows exist).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260627120200_search_backorder_lines.sql
git commit -m "feat(db): search_available_backorder_lines RPC"
```

### Task 4: Add `'backorder'` result type to shared inventory search (TDD)

**Files:**
- Modify: `supabase/functions/_shared/inventory-search.ts`
- Test: `supabase/functions/_shared/inventory-search.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `inventory-search.test.ts`:

```ts
Deno.test("maps a backorder line into a pre-order labeled result", () => {
  const row = {
    backorder_code: "B000001",
    product_id: "p1",
    brand: "Apple", model_name: "iPhone 15 Plus",
    color: "Pink", storage_gb: 128, ram_gb: null, cpu: null, screen_size: 6.7,
    condition_grade: "S", selling_price: 110800, available: 272, lead_time_days: 9,
    photo_group_id: null, hero_media_url: "https://ourstorage/backorder-media/x.webp",
    category_id: "c1", description_fields: ["model_name","storage_gb","color"],
  }
  const r = mapBackorderRow(row)
  assertEquals(r.type, "backorder")
  assertEquals(r.code, "B000001")
  assertEquals(r.available_count, 272)
  assertEquals(r.lead_time_days, 9)
  assertEquals(r.price, 110800)
  // spec line uses the SAME formatter as items/sell-groups
  assertEquals(r.description, "iPhone 15 Plus 128 Pink")
  assertEquals(r.thumbnail_url, "https://ourstorage/backorder-media/x.webp") // our copied hero
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `deno test --allow-all supabase/functions/_shared/inventory-search.test.ts`
Expected: FAIL — `mapBackorderRow` not defined.

- [ ] **Step 3: Implement `mapBackorderRow` and extend the type union**

In `inventory-search.ts`: extend the result type and add the mapper, reusing the existing description builder (`buildItemDescription`/equivalent already imported in this file — match the existing function name used by `mapItemRow`).

```ts
// extend the union
export type InventoryResultType = "item" | "sell_group" | "backorder"

export interface InventorySearchResult {
  type: InventoryResultType
  code: string
  description: string
  grade: string | null
  price: number | null
  available_count: number | null
  thumbnail_url: string | null
  display_url: string | null
  order_url: string
  lead_time_days?: number | null   // backorder only
}

export function mapBackorderRow(row: any): InventorySearchResult {
  const description = buildDescriptionFromFields(row, row.description_fields) // existing shared helper
  const photo = row.photo_group_id ? null : (row.hero_media_url ?? null)
  return {
    type: "backorder",
    code: row.backorder_code,
    description,
    grade: row.condition_grade ?? null,
    price: row.selling_price ?? null,
    available_count: row.available ?? null,
    thumbnail_url: photo,
    display_url: photo,
    order_url: buildOrderUrl(row.backorder_code), // mirror existing helper
    lead_time_days: row.lead_time_days ?? null,
  }
}
```

> Match `buildDescriptionFromFields` / `buildOrderUrl` to whatever the file already
> calls for items. If photo_group_id is set, leave photo resolution to the existing
> photo-group lookup path used by item/sell-group results.

- [ ] **Step 4: Wire backorder search into the main search entry**

In the function that runs item + sell-group searches (e.g. `searchInventory`), add a parallel call to the `search_available_backorder_lines` RPC and map rows via `mapBackorderRow`, merging into results. Mirror the exact-code branch so a `B`-code query short-circuits to a direct lookup like P/G codes do.

- [ ] **Step 5: Run tests to verify pass**

Run: `deno test --allow-all supabase/functions/_shared/inventory-search.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/inventory-search.ts supabase/functions/_shared/inventory-search.test.ts
git commit -m "feat(search): include backorder lines as pre-order results"
```

---

## Phase 3 — Supplier fetch/parse edge function (iosys adapter)

### Task 5: Normalized type + iosys adapter (TDD)

**Files:**
- Create: `supabase/functions/_shared/supplier-adapters/types.ts`
- Create: `supabase/functions/_shared/supplier-adapters/iosys.ts`
- Create: `supabase/functions/_shared/supplier-adapters/iosys.test.ts`
- Create (fixture): `supabase/functions/_shared/supplier-adapters/__fixtures__/iosys-384323.html` (paste a saved iosys product page)

- [ ] **Step 1: Define the normalized type**

`types.ts`:

```ts
export interface NormalizedSupplierProduct {
  supplierKey: "iosys"
  supplierProductCode: string
  sourceUrl: string
  brandText: string | null
  modelText: string | null
  color: string | null
  storageGb: number | null
  ramGb: number | null
  rankText: string | null          // supplier-native rank (e.g. "新品", "Aランク")
  conditionGrade: "S" | "A" | "B" | "C" | "D" | "J" | null
  supplierPrice: number | null     // our cost (JPY)
  stock: number | null
  imageUrls: string[]              // full listing gallery (may be empty)
}

export interface SupplierAdapter {
  key: string
  matches(url: string): boolean
  extractCode(input: string): string | null
  parse(html: string, input: string): NormalizedSupplierProduct
}
```

- [ ] **Step 2: Write the failing iosys test**

`iosys.test.ts`:

```ts
import { iosysAdapter } from "./iosys.ts"
import { assertEquals } from "https://deno.land/std/assert/mod.ts"

const html = await Deno.readTextFile(new URL("./__fixtures__/iosys-384323.html", import.meta.url))

Deno.test("iosys: extracts product code from URL", () => {
  assertEquals(
    iosysAdapter.extractCode("https://iosys.co.jp/items/smartphone/iphone/simfree/iphone15_plus_a3093/384323"),
    "384323",
  )
})

Deno.test("iosys: matches host", () => {
  assertEquals(iosysAdapter.matches("https://iosys.co.jp/items/x/1"), true)
  assertEquals(iosysAdapter.matches("https://other.com/x"), false)
})

Deno.test("iosys: parses model, price, stock, rank->grade", () => {
  const p = iosysAdapter.parse(html, "https://iosys.co.jp/.../384323")
  assertEquals(p.supplierProductCode, "384323")
  assertEquals(p.brandText, "Apple")
  assertEquals(p.storageGb, 128)
  assertEquals(typeof p.supplierPrice, "number")
  assertEquals(p.conditionGrade, "S") // iosys "新品/New" -> S
  assertEquals(p.imageUrls.length > 0, true) // gallery scraped
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `deno test --allow-all supabase/functions/_shared/supplier-adapters/iosys.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the iosys adapter**

`iosys.ts` — use `deno_dom` (already used elsewhere? check `grep -rn "deno_dom\|DOMParser" supabase/functions`) or regex extraction against the page's structured fields. Include the rank→grade map:

```ts
import { NormalizedSupplierProduct, SupplierAdapter } from "./types.ts"

const RANK_TO_GRADE: Record<string, NormalizedSupplierProduct["conditionGrade"]> = {
  "新品": "S", "未使用": "S", "new": "S",
  "a": "A", "aランク": "A",
  "b": "B", "bランク": "B",
  "c": "C", "cランク": "C",
}

function mapRank(rankText: string | null) {
  if (!rankText) return null
  return RANK_TO_GRADE[rankText.trim().toLowerCase()] ?? RANK_TO_GRADE[rankText.trim()] ?? null
}

export const iosysAdapter: SupplierAdapter = {
  key: "iosys",
  matches: (url) => /(^|\.)iosys\.co\.jp/i.test(safeHost(url)),
  extractCode: (input) => {
    const m = input.match(/\/(\d{4,})(?:[/?#]|$)/)
    return m ? m[1] : (/^\d{4,}$/.test(input.trim()) ? input.trim() : null)
  },
  parse: (html, input) => {
    // Extract via DOM/regex. Keep selectors in ONE place; if a field is missing, return null for it.
    const code = iosysAdapter.extractCode(input)!
    const price = parseYen(pick(html, /...price selector.../))
    const stock = parseInt(pick(html, /...stock selector.../) ?? "") || null
    const rankText = pick(html, /...rank selector.../)
    return {
      supplierKey: "iosys",
      supplierProductCode: code,
      sourceUrl: input,
      brandText: pick(html, /...brand.../),
      modelText: pick(html, /...model.../),
      color: pick(html, /...color.../),
      storageGb: parseStorage(pick(html, /...storage.../)),
      ramGb: parseInt(pick(html, /...ram.../) ?? "") || null,
      rankText,
      conditionGrade: mapRank(rankText),
      supplierPrice: price,
      stock,
      imageUrls: pickAll(html, /...gallery <img> srcs.../), // all listing photos; dedupe, absolute-ize URLs
    }
  },
}
```

> Implement `safeHost`, `pick`, `pickAll`, `parseYen`, `parseStorage` as small local
> helpers. `pickAll` returns all matches (gallery image srcs), deduped and resolved
> to absolute URLs.
> Tune selectors against the saved fixture until the test passes — the fixture is
> the contract. Do NOT hardcode values to pass the test; parse them.

- [ ] **Step 5: Run to verify pass**

Run: `deno test --allow-all supabase/functions/_shared/supplier-adapters/iosys.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/supplier-adapters/
git commit -m "feat(supplier): iosys adapter -> NormalizedSupplierProduct (TDD)"
```

### Task 6: Adapter registry / dispatch (TDD)

**Files:**
- Create: `supabase/functions/_shared/supplier-adapters/registry.ts`
- Create: `supabase/functions/_shared/supplier-adapters/registry.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { resolveAdapter } from "./registry.ts"
import { assertEquals } from "https://deno.land/std/assert/mod.ts"

Deno.test("resolves iosys by url", () => {
  assertEquals(resolveAdapter("https://iosys.co.jp/items/x/1")?.key, "iosys")
})
Deno.test("returns null for unknown host", () => {
  assertEquals(resolveAdapter("https://unknown.example/x"), null)
})
```

- [ ] **Step 2: Run — fails.** `deno test --allow-all .../registry.test.ts`

- [ ] **Step 3: Implement**

```ts
import { iosysAdapter } from "./iosys.ts"
import { SupplierAdapter } from "./types.ts"

const ADAPTERS: SupplierAdapter[] = [iosysAdapter]

export function resolveAdapter(url: string): SupplierAdapter | null {
  return ADAPTERS.find((a) => a.matches(url)) ?? null
}
```

- [ ] **Step 4: Run — pass.** Commit:

```bash
git add supabase/functions/_shared/supplier-adapters/registry.ts supabase/functions/_shared/supplier-adapters/registry.test.ts
git commit -m "feat(supplier): adapter registry/dispatch by host"
```

### Task 7: `fetch-supplier-product` edge function

**Files:**
- Create: `supabase/functions/fetch-supplier-product/index.ts`

- [ ] **Step 1: Read an existing edge function for the request/CORS/error boilerplate**

Run: `ls supabase/functions` and read `supabase/functions/customer-auth/index.ts` (or any) for the standard `serve`, CORS headers, and error JSON shape. Match it.

- [ ] **Step 2: Implement**

```ts
import { serve } from "https://deno.land/std/http/server.ts"
import { resolveAdapter } from "../_shared/supplier-adapters/registry.ts"
import { corsHeaders } from "../_shared/cors.ts" // match existing path

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  try {
    const { url } = await req.json()
    if (!url) return json({ error: "url required" }, 400)
    const adapter = resolveAdapter(url)
    if (!adapter) return json({ error: "No supplier adapter matches this URL" }, 422)
    const code = adapter.extractCode(url)
    if (!code) return json({ error: "Could not find a product code in the URL" }, 422)
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 DealzBot" } })
    if (!res.ok) return json({ error: `Supplier returned ${res.status}` }, 502)
    const html = await res.text()
    const product = adapter.parse(html, url)
    return json({ product }, 200)
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500)
  }
})

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}
```

- [ ] **Step 3: Type-check + deploy**

Run:
```bash
deno check supabase/functions/fetch-supplier-product/index.ts
supabase functions deploy fetch-supplier-product
```
Expected: checks clean; deploy succeeds.

- [ ] **Step 4: Live smoke test**

Run (with a real iosys URL):
```bash
curl -s -X POST "$SUPABASE_URL/functions/v1/fetch-supplier-product" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
  -d '{"url":"https://iosys.co.jp/items/smartphone/iphone/simfree/iphone15_plus_a3093/384323"}' | python3 -m json.tool
```
Expected: JSON `product` with brand/model/price/stock populated.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/fetch-supplier-product/index.ts
git commit -m "feat(edge): fetch-supplier-product (pluggable supplier adapters)"
```

### Task 7b: Optional web image-search provider (pluggable, degrades gracefully)

**Files:**
- Create: `supabase/functions/_shared/image-search/types.ts`
- Create: `supabase/functions/_shared/image-search/provider.ts`
- Create: `supabase/functions/search-product-images/index.ts`

- [ ] **Step 1: Interface + env-keyed provider**

`types.ts`:
```ts
export interface ImageSearchProvider {
  key: string
  isConfigured(): boolean
  search(query: string, limit: number): Promise<string[]> // image URLs
}
```

`provider.ts` — a single provider selected by `IMAGE_SEARCH_PROVIDER` env var, with
its API key from env. If unset, `isConfigured()` returns false.

```ts
import { ImageSearchProvider } from "./types.ts"

// Default: Google Custom Search JSON API (searchType=image). Swappable later.
export const imageSearchProvider: ImageSearchProvider = {
  key: "google_cse",
  isConfigured: () => !!Deno.env.get("IMAGE_SEARCH_API_KEY") && !!Deno.env.get("IMAGE_SEARCH_CX"),
  async search(query, limit) {
    const key = Deno.env.get("IMAGE_SEARCH_API_KEY")!
    const cx = Deno.env.get("IMAGE_SEARCH_CX")!
    const url = `https://www.googleapis.com/customsearch/v1?key=${key}&cx=${cx}&searchType=image&num=${Math.min(limit,10)}&q=${encodeURIComponent(query)}`
    const res = await fetch(url)
    if (!res.ok) return []
    const data = await res.json()
    return (data.items ?? []).map((i: any) => i.link).filter(Boolean)
  },
}
```

- [ ] **Step 2: Edge function** `search-product-images/index.ts` — POST `{ query, limit? }`;
  if `!imageSearchProvider.isConfigured()` return `{ configured: false, images: [] }`
  (200) so the UI knows to keep the button disabled; else return
  `{ configured: true, images }`. Reuse the CORS/json boilerplate from Task 7.

- [ ] **Step 3: Type-check + deploy + commit**

```bash
deno check supabase/functions/search-product-images/index.ts
supabase functions deploy search-product-images
git add supabase/functions/_shared/image-search/ supabase/functions/search-product-images/
git commit -m "feat(edge): optional pluggable web image-search provider"
```

> When Joey provides a key, set it once: `supabase secrets set IMAGE_SEARCH_PROVIDER=google_cse IMAGE_SEARCH_API_KEY=... IMAGE_SEARCH_CX=...`. Until then the function reports `configured:false` and the UI button stays disabled — the iosys-gallery path needs no key.

### Task 7c: Server-side copy-to-storage for kept photos

**Files:**
- Create: `supabase/functions/save-backorder-photos/index.ts`

Browsers can't reliably fetch cross-origin iosys/web images and re-upload (CORS),
so the copy runs server-side.

- [ ] **Step 1: Implement** — POST `{ backorder_line_id, image_urls: string[] }`.
  Use a service-role Supabase client (mirror an existing function that writes
  storage — find with `grep -rln "service_role\|SERVICE_ROLE" supabase/functions`).
  For each URL in order: `fetch` the bytes, `storage.from('backorder-media').upload(path, blob)`
  where `path = \`${backorder_line_id}/${i}_${crypto.randomUUID()}.\${ext}\``, get the
  public URL, then `insert into backorder_line_media (backorder_line_id, file_url, source, sort_order)`.
  Skip (don't fail the whole batch) any URL that 404s. Return the created media rows.

- [ ] **Step 2: Type-check + deploy + smoke**

```bash
deno check supabase/functions/save-backorder-photos/index.ts
supabase functions deploy save-backorder-photos
```
Smoke: POST a real line id + 2 image URLs → 2 rows + 2 objects in `backorder-media`.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/save-backorder-photos/index.ts
git commit -m "feat(edge): copy kept backorder photos into our storage"
```

---

## Phase 4 — Spec-match verifier + swap RPC

### Task 8: Core-spec match verifier (TDD)

**Files:**
- Create: `supabase/functions/_shared/backorder-match.ts`
- Create: `supabase/functions/_shared/backorder-match.test.ts`

This pure function powers the client-side swap preview (the same rule is enforced
authoritatively in the RPC, Task 9).

- [ ] **Step 1: Failing test**

```ts
import { verifyPCodeMatch } from "./backorder-match.ts"
import { assertEquals } from "https://deno.land/std/assert/mod.ts"

const line = { product_id: "p1", storage_gb: 128, color: "Pink", condition_grade: "S" }

Deno.test("passes when core specs match", () => {
  const r = verifyPCodeMatch({ product_id: "p1", storage_gb: 128, color: "Pink", condition_grade: "S" }, line)
  assertEquals(r.ok, true)
  assertEquals(r.blocking.length, 0)
})

Deno.test("hard-blocks on storage mismatch", () => {
  const r = verifyPCodeMatch({ product_id: "p1", storage_gb: 256, color: "Pink", condition_grade: "S" }, line)
  assertEquals(r.ok, false)
  assertEquals(r.blocking.includes("storage_gb"), true)
})
```

- [ ] **Step 2: Run — fails.**

- [ ] **Step 3: Implement**

```ts
const CORE_FIELDS = ["product_id", "storage_gb", "color", "condition_grade"] as const
type Core = typeof CORE_FIELDS[number]

export interface MatchResult {
  ok: boolean
  fields: Array<{ field: Core; itemValue: unknown; lineValue: unknown; match: boolean }>
  blocking: Core[]
}

export function verifyPCodeMatch(item: Record<string, unknown>, line: Record<string, unknown>): MatchResult {
  const fields = CORE_FIELDS.map((f) => {
    const match = norm(item[f]) === norm(line[f])
    return { field: f, itemValue: item[f], lineValue: line[f], match }
  })
  const blocking = fields.filter((f) => !f.match).map((f) => f.field)
  return { ok: blocking.length === 0, fields, blocking }
}

function norm(v: unknown) {
  return typeof v === "string" ? v.trim().toLowerCase() : v
}
```

- [ ] **Step 4: Run — pass.** Commit:

```bash
git add supabase/functions/_shared/backorder-match.ts supabase/functions/_shared/backorder-match.test.ts
git commit -m "feat(backorder): core-spec match verifier (TDD)"
```

### Task 9: Transactional swap + mark-ordered RPCs

**Files:**
- Create: `supabase/migrations/20260627120300_backorder_fulfillment_rpcs.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Mark a pre-order as ordered from supplier
CREATE OR REPLACE FUNCTION public.mark_backorder_ordered(p_order_item_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.order_items
  SET backorder_status = 'ORDERED'
  WHERE id = p_order_item_id AND backorder_status = 'AWAITING_ORDER';
  IF NOT FOUND THEN RAISE EXCEPTION 'order_item % not awaiting order', p_order_item_id; END IF;
END $$;

-- Swap a real P-code into a waiting pre-order, enforcing eligibility + core-spec match
CREATE OR REPLACE FUNCTION public.fulfill_backorder_with_item(
  p_order_item_id uuid,
  p_item_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_line public.backorder_lines%ROWTYPE;
  v_item public.items%ROWTYPE;
  v_oi public.order_items%ROWTYPE;
BEGIN
  SELECT * INTO v_oi FROM public.order_items WHERE id = p_order_item_id FOR UPDATE;
  IF v_oi.backorder_line_id IS NULL OR v_oi.backorder_status NOT IN ('READY','ORDERED','AWAITING_ORDER') THEN
    RAISE EXCEPTION 'order_item % is not an open pre-order', p_order_item_id;
  END IF;

  SELECT * INTO v_line FROM public.backorder_lines WHERE id = v_oi.backorder_line_id;
  SELECT * INTO v_item FROM public.items WHERE id = p_item_id FOR UPDATE;

  -- eligibility
  IF v_item.item_status <> 'AVAILABLE' THEN RAISE EXCEPTION 'item not AVAILABLE'; END IF;
  IF EXISTS (SELECT 1 FROM public.order_items WHERE item_id = p_item_id) THEN RAISE EXCEPTION 'item already in an order'; END IF;
  IF EXISTS (SELECT 1 FROM public.sell_group_items WHERE item_id = p_item_id) THEN RAISE EXCEPTION 'item in a sell group'; END IF;

  -- core-spec hard-block (mirror _shared/backorder-match.ts)
  IF v_item.product_id IS DISTINCT FROM v_line.product_id
     OR v_item.storage_gb IS DISTINCT FROM v_line.storage_gb
     OR lower(trim(coalesce(v_item.color,''))) IS DISTINCT FROM lower(trim(coalesce(v_line.color,'')))
     OR v_item.condition_grade IS DISTINCT FROM v_line.condition_grade THEN
    RAISE EXCEPTION 'core specs do not match backorder line';
  END IF;

  -- perform swap
  UPDATE public.order_items
    SET item_id = p_item_id, backorder_status = 'FULFILLED'
    WHERE id = p_order_item_id;
  UPDATE public.items SET item_status = 'RESERVED' WHERE id = p_item_id;
  UPDATE public.backorder_lines
    SET quantity_received = quantity_received + 1
    WHERE id = v_line.id;
END $$;

GRANT EXECUTE ON FUNCTION public.mark_backorder_ordered TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fulfill_backorder_with_item TO authenticated, service_role;
```

> Confirm `items.item_status` enum has `RESERVED` (it does per types). If the
> project transitions sold items differently (e.g. via a trigger), align this
> UPDATE with that path — check `grep -rn "RESERVED" supabase/migrations`.

- [ ] **Step 2: Apply + verify guard fires**

Run: `supabase db push` then test the hard-block with seeded rows:
```bash
psql "$DB_URL" -c "select public.fulfill_backorder_with_item('<bad_oi>','<wrong_spec_item>');" || echo "blocked as expected"
```
Expected: raises "core specs do not match".

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260627120300_backorder_fulfillment_rpcs.sql
git commit -m "feat(db): transactional backorder swap + mark-ordered RPCs"
```

---

## Phase 5 — Frontend service layer

### Task 10: `backorders` service + reservation RPC + types

**Files:**
- Create: `src/services/backorders.ts`
- Create: `supabase/migrations/20260627120400_reserve_backorder.sql`
- Modify: `src/lib/database.types.ts` (regen), `src/lib/types.ts` (re-export new tables/enums if pattern requires)

- [ ] **Step 1: Reservation RPC (used when a customer confirms)**

`20260627120400_reserve_backorder.sql`:

```sql
-- Atomically reserve 1 unit on a B-line and create the pre-order order_item
CREATE OR REPLACE FUNCTION public.reserve_backorder_unit(
  p_order_id uuid,
  p_backorder_line_id uuid,
  p_unit_price numeric
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_oi_id uuid; v_avail integer;
BEGIN
  SELECT available INTO v_avail FROM public.backorder_lines WHERE id = p_backorder_line_id FOR UPDATE;
  IF v_avail IS NULL OR v_avail < 1 THEN RAISE EXCEPTION 'backorder line not available'; END IF;
  UPDATE public.backorder_lines SET quantity_reserved = quantity_reserved + 1 WHERE id = p_backorder_line_id;
  INSERT INTO public.order_items (order_id, backorder_line_id, backorder_status, unit_price, item_id)
  VALUES (p_order_id, p_backorder_line_id, 'AWAITING_ORDER', p_unit_price, NULL)
  RETURNING id INTO v_oi_id;
  RETURN v_oi_id;
END $$;

GRANT EXECUTE ON FUNCTION public.reserve_backorder_unit TO authenticated, service_role;
```

> Match `order_items` price column name (`unit_price`?) by checking the table; adjust insert columns accordingly.

Apply: `supabase db push`. Regenerate types:
`supabase gen types typescript --local > src/lib/database.types.ts`

- [ ] **Step 2: Write the service (mirror `src/services/sell-groups.ts` shape)**

`src/services/backorders.ts` — functions:

```ts
import { supabase } from "@/lib/supabase"

export async function listBackorderLines(filters?: { status?: string; search?: string }) { /* select with product_models join; mirror sell-groups list */ }
export async function getBackorderLine(id: string) { /* single with joins */ }
export async function generateBackorderCode(): Promise<string> {
  const { data, error } = await supabase.rpc("generate_code", { prefix: "B", seq_name: "b_code_seq" })
  if (error) throw error
  return data as string
}
export async function createBackorderLine(input: BackorderLineInsert) { /* insert with generated code */ }
export async function updateBackorderLine(id: string, updates: BackorderLineUpdate) { /* ... */ }
export async function fetchSupplierProduct(url: string) {
  const { data, error } = await supabase.functions.invoke("fetch-supplier-product", { body: { url } })
  if (error) throw error
  return data.product as NormalizedSupplierProduct // includes imageUrls[]
}
export async function searchProductImages(query: string, limit = 8): Promise<{ configured: boolean; images: string[] }> {
  const { data, error } = await supabase.functions.invoke("search-product-images", { body: { query, limit } })
  if (error) throw error
  return data
}
export async function saveBackorderPhotos(backorderLineId: string, imageUrls: string[]) {
  const { data, error } = await supabase.functions.invoke("save-backorder-photos", {
    body: { backorder_line_id: backorderLineId, image_urls: imageUrls },
  })
  if (error) throw error
  return data
}
export async function listBackorderMedia(backorderLineId: string) { /* select * from backorder_line_media order by sort_order */ }
export async function deleteBackorderMedia(mediaId: string) { /* delete row + best-effort storage remove */ }
export async function listToFulfill() { /* order_items where backorder_line_id not null and status <> FULFILLED, joined to order/customer/line; group client-side */ }
export async function markBackorderOrdered(orderItemId: string) {
  const { error } = await supabase.rpc("mark_backorder_ordered", { p_order_item_id: orderItemId })
  if (error) throw error
}
export async function fulfillBackorderWithItem(orderItemId: string, itemId: string) {
  const { error } = await supabase.rpc("fulfill_backorder_with_item", { p_order_item_id: orderItemId, p_item_id: itemId })
  if (error) throw error
}
export async function findEligiblePCodes(line: { product_id: string; storage_gb: number|null; color: string|null; condition_grade: string }) {
  // items where status AVAILABLE, matching core specs, not in order/sell-group
}
```

All Supabase calls wrapped per the project's error convention (the existing services show the pattern — follow it exactly).

- [ ] **Step 3: Verify build + lint**

Run: `npm run build && npm run lint`
Expected: no type errors; lint clean.

- [ ] **Step 4: Commit**

```bash
git add src/services/backorders.ts src/lib/database.types.ts supabase/migrations/20260627120400_reserve_backorder.sql
git commit -m "feat(service): backorders service + reserve RPC + types"
```

---

## Phase 6 — Admin UI (`/admin/backorders`)

### Task 11: Route + sidebar entry

**Files:**
- Modify: `src/components/layout/sidebar.tsx` (Inventory group, after "New Intake")
- Modify: the router config (find with `grep -rn "admin/items" src/ | grep -i route`)
- Create: `src/pages/admin/backorders.tsx` (stub returning a heading)

- [ ] **Step 1: Add nav item** — in the `Inventory` group array add:
```ts
{ title: 'Backorder', href: '/admin/backorders', icon: PackagePlus },
```
(import `PackagePlus` from lucide-react; place after `New Intake`.)

- [ ] **Step 2: Add the route** mapping `/admin/backorders` → `BackordersPage`.

- [ ] **Step 3: Verify** `npm run build` then load `/admin/backorders` shows the heading. Commit:
```bash
git add src/components/layout/sidebar.tsx src/pages/admin/backorders.tsx <router file>
git commit -m "feat(ui): backorders route + Inventory sidebar entry"
```

### Task 12: Backorder list view

**Files:**
- Modify: `src/pages/admin/backorders.tsx`
- Create: `src/components/backorders/backorder-list.tsx`, `src/components/backorders/index.ts`

- [ ] **Step 1: Build the list** with a TanStack Query hook `useQuery(['backorder-lines', filters], () => listBackorderLines(filters))`. Columns: B-code, spec line (via `getItemDescription`), grade, supplier price, sell price, `available / reserved / received`, lead time, status. Tabs/filter by status. Mirror `src/pages/admin/items.tsx` table patterns and skeleton loading.

- [ ] **Step 2: Verify** `npm run build && npm run lint`; load page (empty state ok). Commit:
```bash
git add src/pages/admin/backorders.tsx src/components/backorders/
git commit -m "feat(ui): backorder list view"
```

### Task 13: Add Backorder modal (paste-to-add)

**Files:**
- Create: `src/components/backorders/add-backorder-dialog.tsx`
- Create: `src/validators/backorder.ts` (Zod)

- [ ] **Step 1: Zod schema** (`backorder.ts`): `product_id` (required), `condition_grade`, `color`, `storage_gb`, `ram_gb`, `cpu`, `screen_size`, `supplier_id` (required), `supplier_price`, `selling_price` (required), `supplier_url`, `supplier_product_code`, `supplier_stock`, `quantity_total` (>=1), `lead_time_days` (>=0), `photo_group_id` (optional). Photos
themselves are saved separately via `saveBackorderPhotos` after the line is created.

- [ ] **Step 2: Dialog flow:**
  1. Paste box → `fetchSupplierProduct(url)` → prefill RHF fields from `NormalizedSupplierProduct` (specs + price + stock).
  2. **Product-model mapping** (required): a model combobox pre-filtered by parsed brand/model text; on select, fill `product_id`. If a matching `photo_group` exists for model+color, offer **"use our photo group"** (sets `photo_group_id`, hides the photo grid).
  3. **Photo curate grid:** seed with `product.imageUrls` (iosys gallery) as selected candidates. Each tile has a remove (✗) toggle. A **"Search web for more"** button calls `searchProductImages(\`${brand} ${model} ${color}\`)`; if `configured === false`, the button is disabled with a tooltip ("set IMAGE_SEARCH_API_KEY to enable"). Appends returned URLs as candidates. (No photo group case only.)
  4. Staff confirm → `createBackorderLine` (generates B-code) → if not using a photo group, `saveBackorderPhotos(lineId, keptUrls)` to copy them into storage + create media rows. Invalidate `['backorder-lines']`.
  5. Toast success/error per convention.

- [ ] **Step 3: Verify** build/lint; manually add one real iosys URL end-to-end → row appears with a spec line identical to how the same model reads on the Items page. Commit:
```bash
git add src/components/backorders/add-backorder-dialog.tsx src/validators/backorder.ts
git commit -m "feat(ui): add-backorder paste-to-add dialog"
```

### Task 14: To Fulfill worklist + Mark ordered

**Files:**
- Create: `src/components/backorders/to-fulfill.tsx`
- Modify: `src/pages/admin/backorders.tsx` (second tab/view)

- [ ] **Step 1: Worklist** — `useQuery(['backorder-to-fulfill'], listToFulfill)`. Group rows by `backorder_status` (To order / Ordered / Ready to swap). Show order code, customer, B-code + spec line, lead time, status.

- [ ] **Step 2: Procurement summary** — aggregate `AWAITING_ORDER` rows by B-line: "order N× B000001 from iosys" with the supplier URL link.

- [ ] **Step 3: Mark ordered** action → `markBackorderOrdered(orderItemId)`, invalidate query.

- [ ] **Step 4: Verify** build/lint; with a seeded pre-order, "Mark ordered" flips state. Commit:
```bash
git add src/components/backorders/to-fulfill.tsx src/pages/admin/backorders.tsx
git commit -m "feat(ui): to-fulfill worklist + procurement summary + mark ordered"
```

### Task 15: Swap dialog (scan/verify/confirm)

**Files:**
- Create: `src/components/backorders/swap-dialog.tsx`

- [ ] **Step 1: Build the dialog** opened from a `READY` (or eligible) row:
  1. Scan QR or type a P-code (reuse the existing QR scanner component — find with `grep -rn "scan" src/components/shared`).
  2. Resolve the item; run `verifyPCodeMatch(item, line)` for a live field-by-field ✓/✗ preview. Disable Confirm if `!ok`.
  3. Confirm → `fulfillBackorderWithItem(orderItemId, itemId)`; on the RPC error (server-side hard-block) surface the message. Invalidate `['backorder-to-fulfill']`, `['backorder-lines']`, and items queries.

- [ ] **Step 2: Verify** build/lint; seed an AVAILABLE matching P-code and a mismatched one — confirm match swaps and mismatch is blocked both client- and server-side. Commit:
```bash
git add src/components/backorders/swap-dialog.tsx
git commit -m "feat(ui): backorder->P-code swap dialog with spec verification"
```

---

## Phase 7 — Customer messaging offer integration

### Task 16: Pre-order badge + lead-time line in offers (TDD)

**Files:**
- Modify: `supabase/functions/_shared/offer-reply.ts`
- Test: `supabase/functions/_shared/offer-reply.test.ts`

- [ ] **Step 1: Read** `offer-reply.ts` + its test to learn the code-assembled emoji block format and the `{{OFFER:CODE}}` token handling.

- [ ] **Step 2: Failing test** — assert that an offer for a `backorder` result renders the standard block PLUS a pre-order badge and `⏳ Pre-order · ~9 days` line, and still emits `{{OFFER:B000001}}`:

```ts
Deno.test("backorder offer shows pre-order + lead time", () => {
  const block = buildOfferBlock({
    type: "backorder", code: "B000001", description: "iPhone 15 Plus 128 Pink",
    price: 110800, grade: "S", available_count: 272, lead_time_days: 9,
    thumbnail_url: null, display_url: null, order_url: "https://x/B000001",
  })
  assert(block.includes("Pre-order"))
  assert(block.includes("9"))
  assert(block.includes("{{OFFER:B000001}}"))
})
```

- [ ] **Step 3: Run — fails.**

- [ ] **Step 4: Implement** — branch on `type === "backorder"` (or `lead_time_days != null`) to append the badge + lead-time line; everything else unchanged so P/G offers are untouched.

- [ ] **Step 5: Run — pass.** Then confirm the AI search tool actually receives backorder results (verify the messaging search path calls the entry function extended in Task 4; add to the playground/integration check if present).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/offer-reply.ts supabase/functions/_shared/offer-reply.test.ts
git commit -m "feat(messaging): pre-order badge + lead time on backorder offers"
```

---

## Phase 8 — Wire-up, docs, deploy

### Task 17: Update SYSTEM_MAP + PROJECT_STATE; deploy

**Files:**
- Modify: `docs/SYSTEM_MAP.md`, `docs/PROJECT_STATE.md`

- [ ] **Step 1: SYSTEM_MAP** — add a "Backorder / pre-order" feature row mapping: `backorder_lines` + `order_items` columns, `fetch-supplier-product` edge fn, `search_available_backorder_lines` / `fulfill_backorder_with_item` / `reserve_backorder_unit` RPCs, `src/services/backorders.ts`, `src/pages/admin/backorders.tsx`.

- [ ] **Step 2: PROJECT_STATE** — move the backorder item from "Now" to "Recently shipped" with the version bump.

- [ ] **Step 3: Deploy** — use the `push-to-main` skill (bumps version, commits, pushes; Vercel auto-deploys). Ensure `supabase functions deploy fetch-supplier-product` ran and migrations are pushed to the cloud project.

- [ ] **Step 4: Final smoke** — on production: add a real iosys backorder, confirm it appears in inventory search and messaging offers as a pre-order; run one full add→reserve→mark-ordered→swap cycle with a test order.

---

## Self-review notes (coverage map spec → tasks)

- B-code table + sequence → Task 1
- order_items linkage + status + CHECK → Task 2
- search RPC + `'backorder'` result type + shared formatter → Tasks 3, 4
- pluggable per-supplier fetch/parse (iosys only) + rank→grade + gallery → Tasks 5, 6, 7
- photos: iosys gallery + optional web search + copy-to-storage + `backorder_line_media` → Tasks 1, 7b, 7c, 13
- core-spec hard-block verifier (client + server) → Tasks 8, 9
- reserve-on-confirm + services + types → Task 10
- placement in Inventory sidebar → Task 11
- list view (identical spec line) → Task 12
- paste-to-add with required model mapping + photo reuse/fallback → Task 13
- To Fulfill worklist (4 states) + procurement summary + mark ordered → Task 14
- manual swap: scan → verify → hard-block → RESERVED + received++ → Task 15
- AI offer pre-order badge + lead time → Task 16
- docs + deploy → Task 17

**Deferred (per spec non-goals):** prepayment gating, bulk-sheet import, auto price/stock refresh cron (manual "Refresh from iosys" can be a small follow-up on Task 12), additional supplier adapters.
