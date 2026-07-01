# Backorder (B-code) Showcase Media Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Backorder (B-code) rows on the Admin Items list the same showcase-photos/videos buttons and product-model thumbnail link that regular stock rows have, with media sourced from the tied Product Model; then verify the existing B-code order + code-swap flow end-to-end.

**Architecture:** Add a `getShowcaseBackorder` resolver that shapes a `backorder_lines` row (+ its `product_models.product_media` and curated `backorder_line_media`) into the existing `ShowcaseItem` type. Route the `B` code prefix to it in the showcase page. Add the two showcase buttons + a product-model `<Link>` to the B-code branch of the Items-list unified summary cell. Part 2 (customer ordering + fulfillment swap) already exists and is only verified, not rebuilt.

**Tech Stack:** React 18 + TypeScript, Vite, TanStack Query, Supabase JS client, Tailwind + shadcn/ui, lucide-react icons, React Router.

**Spec:** `docs/superpowers/specs/2026-07-01-backorder-showcase-media-design.md`

**Testing note (read first):** This repo has **no unit-test runner** (no `vitest`/`jest`, no `test` script, no `*.test.ts`). Do **not** add one — it's out of scope. Automated gates are `npm run build` (Vite build = TS typecheck + bundle) and `npm run lint` (eslint). Behavioural correctness of the pure data-shaping resolver is verified by running it in the real app (the showcase window against a live B-code) in Tasks 4–5. This is a deliberate, documented deviation from unit-level TDD, forced by the absence of a test harness.

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `src/services/showcase.ts` | Per-code showcase resolvers returning `ShowcaseItem` | **Modify** — add `getShowcaseBackorder` |
| `src/pages/admin/showcase.tsx` | The `/admin/showcase` presentation window; picks a resolver by code prefix | **Modify** — import + route `B` prefix (two dispatch sites) |
| `src/pages/admin/items.tsx` | Admin Items unified list; renders per-`_kind` row cells | **Modify** — B-row: thumbnail `<Link>` + Showcase Photos/Videos buttons |

No new files. No new dependencies.

---

### Task 1: `getShowcaseBackorder` resolver

**Files:**
- Modify: `src/services/showcase.ts` (append a new exported function; imports `supabase` and `getItemDescription` already present at top of file)

Context: `ShowcaseItem` is already defined at the top of this file with fields
`{ id, item_code, selling_price, purchase_price, discount, condition_grade, condition_notes, description, photos: {id,url}[], videos: {id,url}[] }`.
The showcase page computes the displayed price as `(selling_price ?? purchase_price) - (discount ?? 0)`, so returning `selling_price` + `discount = discount_amount` is correct. `backorder_lines` carries flat spec columns (`cpu`, `ram_gb`, `storage_gb`, `screen_size`, `color`) plus `selling_price`, `discount_amount`, `condition_grade`, `product_id`, so `select('*')` gives `getItemDescription` everything it needs (mirrors `listBackorderLines`/`getBackorderLine`).

- [x] **Step 1: Add the resolver function**

Append to `src/services/showcase.ts` (after `getShowcaseAccessory`):

```ts
export async function getShowcaseBackorder(bCode: string): Promise<ShowcaseItem | null> {
  // Resolve a B-code to its backorder line, joined to the tied product model's
  // catalog media plus any curated backorder-line photos. Mirrors the media
  // precedence in getClaimableBackorder (services/mine.ts) so the staff showcase
  // matches the customer /mine view.
  const { data, error } = await supabase
    .from('backorder_lines')
    .select(`
      *,
      product_models(
        brand, model_name, color, short_description, cpu, ram_gb, storage_gb, screen_size,
        categories(name, description_fields),
        product_media(id, file_url, media_type, sort_order)
      ),
      backorder_line_media(id, file_url, sort_order)
    `)
    .eq('backorder_code', bCode.toUpperCase())
    .maybeSingle()

  if (error || !data) return null

  const pm = data.product_models as Record<string, unknown> | null
  const productMedia = (pm?.product_media ?? []) as Array<{ id: string; file_url: string; media_type: string; sort_order: number }>
  const curated = (data.backorder_line_media ?? []) as Array<{ id: string; file_url: string; sort_order: number }>

  const category = pm?.categories as { name: string; description_fields: string[] } | null
  const description = getItemDescription(data as unknown as Record<string, unknown>, pm, category?.description_fields)

  // Photos: curated backorder shots first, then catalog product-model images.
  const curatedPhotos = curated
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((m) => ({ id: m.id, url: m.file_url }))
  const catalogPhotos = productMedia
    .filter((m) => m.media_type === 'image')
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((m) => ({ id: m.id, url: m.file_url }))

  // Videos: catalog product-model only (curated backorder media is photos-only).
  const videos = productMedia
    .filter((m) => m.media_type === 'video')
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((m) => ({ id: m.id, url: m.file_url }))

  const discount = Number(data.discount_amount ?? 0)

  return {
    id: data.id,
    item_code: data.backorder_code,
    selling_price: data.selling_price,
    purchase_price: null,
    discount: discount > 0 ? discount : null,
    condition_grade: data.condition_grade,
    condition_notes: null,
    description,
    photos: [...curatedPhotos, ...catalogPhotos],
    videos,
  }
}
```

- [x] **Step 2: Typecheck**

Run: `npm run build`
Expected: build succeeds (no TS errors). If a Supabase relation type complains, it is because `backorder_lines`→`backorder_line_media` needs the FK in generated types — confirm the join name matches `backorder_line_media` (it is used identically in `services/backorders.ts:getBackorderLine`, so it is valid).

- [x] **Step 3: Commit**

```bash
git add src/services/showcase.ts
git commit -m "feat(showcase): add getShowcaseBackorder resolver for B-codes"
```

---

### Task 2: Route the `B` prefix in the showcase page

**Files:**
- Modify: `src/pages/admin/showcase.tsx:5` (import) and the two fetcher-dispatch chains (currently ~L51–53 and ~L73–75)

- [x] **Step 1: Add the import**

Change line 5 from:

```ts
import { getShowcaseItem, getShowcaseAccessory, getShowcaseSellGroup, type ShowcaseItem } from '@/services/showcase'
```

to:

```ts
import { getShowcaseItem, getShowcaseAccessory, getShowcaseSellGroup, getShowcaseBackorder, type ShowcaseItem } from '@/services/showcase'
```

- [x] **Step 2: Route `B` in the query-param dispatch (first chain)**

Find (inside the `?item=` `useEffect`):

```ts
    const fetcher = upper.startsWith('A') ? getShowcaseAccessory
      : upper.startsWith('G') ? getShowcaseSellGroup
      : getShowcaseItem
```

Replace with:

```ts
    const fetcher = upper.startsWith('A') ? getShowcaseAccessory
      : upper.startsWith('G') ? getShowcaseSellGroup
      : upper.startsWith('B') ? getShowcaseBackorder
      : getShowcaseItem
```

- [x] **Step 3: Route `B` in the BroadcastChannel dispatch (second chain)**

Find (inside the `BroadcastChannel('showcase')` `useEffect`):

```ts
      const fetcher = upper.startsWith('A') ? getShowcaseAccessory
        : upper.startsWith('G') ? getShowcaseSellGroup
        : getShowcaseItem
```

Replace with (note the deeper indentation — this is the nested chain):

```ts
      const fetcher = upper.startsWith('A') ? getShowcaseAccessory
        : upper.startsWith('G') ? getShowcaseSellGroup
        : upper.startsWith('B') ? getShowcaseBackorder
        : getShowcaseItem
```

- [x] **Step 4: Typecheck**

Run: `npm run build`
Expected: build succeeds.

- [x] **Step 5: Commit**

```bash
git add src/pages/admin/showcase.tsx
git commit -m "feat(showcase): route B-code prefix to getShowcaseBackorder"
```

---

### Task 3: Items-list B-row parity (thumbnail link + showcase buttons)

**Files:**
- Modify: `src/pages/admin/items.tsx` — the `_kind === 'backorder'` branch of the `unified_summary` cell (~L975–1013)

Context: `Link` (react-router), `Image`, `Play` (lucide), and `openShowcase` are already imported / in scope in this file. `openShowcase(code, mode)` is code-agnostic — it broadcasts the code + opens the showcase window; no change needed there. The backorder row `r` has `r.product_id` and `r.backorder_code`.

- [x] **Step 1: Make the thumbnail a product-model link**

Find (the thumbnail block inside the backorder branch):

```tsx
              {thumbUrl ? (
                <img src={thumbUrl} alt="" className="h-10 w-10 rounded border bg-muted flex-shrink-0 object-cover" />
              ) : (
                <div className="h-10 w-10 rounded border bg-muted flex-shrink-0 flex items-center justify-center text-muted-foreground text-xs">—</div>
              )}
```

Replace with:

```tsx
              {r.product_id ? (
                <Link
                  to={`/admin/products/${r.product_id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="h-10 w-10 rounded border bg-muted flex-shrink-0 overflow-hidden hover:ring-2 hover:ring-primary/50 transition-shadow"
                  title="Go to product model"
                >
                  {thumbUrl ? (
                    <img src={thumbUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-muted-foreground text-xs">—</div>
                  )}
                </Link>
              ) : thumbUrl ? (
                <img src={thumbUrl} alt="" className="h-10 w-10 rounded border bg-muted flex-shrink-0 object-cover" />
              ) : (
                <div className="h-10 w-10 rounded border bg-muted flex-shrink-0 flex items-center justify-center text-muted-foreground text-xs">—</div>
              )}
```

- [x] **Step 2: Add the Showcase Photos + Videos buttons**

Find (the "Copy Mine link" button that closes the backorder branch's icon row):

```tsx
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    title="Copy Mine link"
                    onClick={(e) => {
                      e.stopPropagation()
                      navigator.clipboard.writeText(`${window.location.origin}/mine/${r.backorder_code}`)
                      toast.success('Mine link copied')
                    }}
                  >
                    <Link2 className="h-3 w-3" />
                  </Button>
```

Insert immediately **after** that closing `</Button>` (still inside the same `flex items-center gap-2` div):

```tsx
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    title="Showcase Photos"
                    onClick={(e) => { e.stopPropagation(); openShowcase(r.backorder_code, 'photos') }}
                  >
                    <Image className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    title="Showcase Videos"
                    onClick={(e) => { e.stopPropagation(); openShowcase(r.backorder_code, 'videos') }}
                  >
                    <Play className="h-3 w-3" />
                  </Button>
```

- [x] **Step 3: Typecheck + lint**

Run: `npm run build && npm run lint`
Expected: build succeeds; lint reports no new errors for `items.tsx`.

- [x] **Step 4: Commit**

```bash
git add src/pages/admin/items.tsx
git commit -m "feat(items): B-code row showcase buttons + product-model thumbnail link"
```

---

### Task 4: Manual visual verification (Part 1)

**Files:** none (verification only). Use the dev server + a real ACTIVE B-code (e.g. `B000280` from the current data).

- [x] **Step 1: Start the dev server** (if not already running)

Run: `npm run dev`
Expected: Vite serves the app (note the local URL).

- [x] **Step 2: Verify the Items-list B-row**

Log in as staff (dev creds in `.env.local`), go to Admin → Items, "All" or "Backorder" tab.
Confirm the B-code row now shows: `[grade] [⏳ Pre-order] [🔗 link] [📷 photos] [▶️ videos]` and the thumbnail has a hover ring.
Expected: all four icons present, matching a P-code row's affordances.

- [x] **Step 3: Verify the product-model link**

Click the B-row thumbnail.
Expected: navigates to `/admin/products/<product_id>` (the tied product model), not the row's own click handler.

- [x] **Step 4: Verify the showcase window — photos**

Click the 📷 Showcase Photos icon.
Expected: the vertical showcase window opens on the Photos tab showing the product model's catalog photos (plus any curated backorder photos first). Description + price render (selling price minus discount).

- [x] **Step 5: Verify the showcase window — videos**

Click the ▶️ Showcase Videos icon.
Expected: showcase window opens on the Videos tab. If the model has catalog videos they play; if none, the empty-videos state renders (same as an item with no videos — acceptable).

- [x] **Step 6: Record evidence**

Screenshot the B-row (icons visible) and the open showcase window. If any step fails, fix the relevant task's code and re-verify before continuing.

---

### Task 5: End-to-end verification of Part 2 (order + code swap — no rebuild)

**Files:** none unless a bug is found. This flow already exists (`getClaimableBackorder`, `claim-mine` edge fn, `reserve_backorder_unit`, `swap-dialog.tsx`, `fulfill_backorder_with_item`). Goal: confirm it works; fix narrowly only if broken.

- [x] **Step 1: Open the customer pre-order page**

Visit `/mine/<B-code>` for an ACTIVE line with availability > 0 (as a test customer).
Expected: product page renders with the ⏳ Pre-order badge, estimated lead-time, and media.

- [x] **Step 2: Place the pre-order**

Complete checkout (new or existing order).
Expected: "Order Confirmed" with an ORD code.

- [x] **Step 3: Confirm the reserved order item (DB check)**

Run (Supabase CLI):
```bash
supabase db execute "select oi.id, oi.backorder_line_id, oi.backorder_status, oi.item_id from order_items oi join orders o on o.id = oi.order_id where o.order_code = '<ORD-code>';"
```
Expected: one row with `backorder_line_id` set, `backorder_status = AWAITING_ORDER`, `item_id` NULL. Also confirm the backorder line's `available` decremented by 1.

- [x] **Step 4: Swap in a real P-code**

In Admin → Backorders → To Fulfill, open the swap dialog for that line. Scan/type a matching AVAILABLE P-code (same product/grade/storage/color).
Expected: the spec-match table shows all green + AVAILABLE; "Confirm swap" enabled.

- [x] **Step 5: Confirm the swap persisted (DB check)**

After confirming, re-run the query from Step 3.
Expected: the same `order_items` row now has `item_id` set to the P-code's id and `backorder_status = FULFILLED`; the P-code item is now committed to the order (invoiced order item switched from the B placeholder to the real P-code).

- [x] **Step 6: Record outcome**

Note pass/fail per step. If any step fails, capture the exact error and stop for a narrow fix + re-verify; do not redesign the flow.

---

## Self-Review

**Spec coverage:**
- Spec §1 `getShowcaseBackorder` → Task 1 ✅ (curated-first photos, catalog fallback, catalog videos, `ShowcaseItem` shape, `getItemDescription`, price = selling_price − discount_amount, grade).
- Spec §2 route `B` prefix (both dispatch spots) → Task 2 ✅.
- Spec §3 Items-list B-row (showcase buttons + product-model thumbnail link with null fallback) → Task 3 ✅.
- Spec §4 verify Part 2 end-to-end → Task 5 ✅.
- Spec "Testing" (resolver behaviour, visual, E2E) → Tasks 4–5 ✅, with the documented no-unit-runner adaptation (verify in-app rather than isolated unit tests).

**Placeholder scan:** No TBD/TODO; every code step shows complete code; every command shows expected output. ✅

**Type consistency:** `getShowcaseBackorder` returns the exact `ShowcaseItem` field set the page consumes (`selling_price`/`purchase_price`/`discount`/`condition_grade`/`condition_notes`/`description`/`photos`/`videos`). `item_code` intentionally holds the B-code (same convention `getShowcaseSellGroup`/`getShowcaseAccessory` use for their codes). Function name used identically in Task 1 (definition), Task 2 (import + both dispatches). ✅
