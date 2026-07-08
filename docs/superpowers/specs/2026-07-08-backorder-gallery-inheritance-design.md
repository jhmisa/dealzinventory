# Backorder (B-code) — Gallery Inheritance, Detail Page & Accessories

**Date:** 2026-07-08
**Status:** Design — awaiting review
**Branch context:** `feat/canned-responses-ai-consolidation`

## Problem

B-codes (backorder lines) are anchored to a `product_models` template via a `NOT NULL`
FK, but their photos have been sourced from a separate curated layer
(`backorder_line_media`, scraped from iosys at creation time). In practice this meant a
B-code effectively showed a single scraped photo instead of the rich gallery already held
by its product model. Three gaps:

1. **Photos** — B-codes don't reuse the product model's full photo+video gallery.
2. **iosys link not viewable** — `supplier_url` is stored on every B-code but never
   surfaced in the admin UI. There is also no B-code detail page at all.
3. **付属品 (included accessories)** — captured and translated to English on the line, but
   shown nowhere.

## Goal

- Every B-code inherits the **full photos + videos of its linked product model** as the
  single photo source. No per-line photo curation.
- B-codes get a **detail page** mirroring the P-code Item Detail page, reachable by
  clicking a B-code, exposing the **iosys link** and the item's specs/pricing/source.
- The English **included-accessories** string appears on the detail page and on the
  customer-facing description (offer / `/mine`) as a separate line under the spec line.
- Creating a B-code for a model **not in the catalog** is hard-blocked with a clear error.

## Current State (verified)

- `backorder_lines.product_id` → `product_models(id)`, `NOT NULL`. Every B-code already
  has a template.
- Reads already join `product_media` through the template *and* the curated
  `backorder_line_media`, rendering curated-first then gallery-fallback in:
  - `services/backorders.ts` → `getBackorderLine`, `listBackorderLines`
  - `services/mine.ts` → `getClaimableBackorder`
  - `services/showcase.ts` → `getShowcaseBackorder`
- The messaging AI offer deep-links to `/mine/{code}` and pulls its attached photo from the
  same media path, so it benefits automatically once `/mine` uses the gallery.
- `translateAccessories()` in `supabase/functions/_shared/supplier-adapters/iosys.ts`
  already maps the finite 付属品 vocabulary to English; `fetchSupplierProduct` returns
  `includedAccessories` **already in English**; the Add-Backorder dialog already saves it
  to `backorder_lines.included_accessories`. Data is captured — only display is missing.
- The Add-Backorder dialog already **requires** `product_id`, auto-matches on fetch
  (`findMatchingProductModel`), but also offers an inline "Create Product" button (via
  `ProductPicker` `onCreate`) that produces a **bare, photo-less** model.
- Item Detail page (`src/pages/admin/item-detail.tsx`, route `admin/items/:id`) is composed
  from reusable cards: `UnifiedGalleryCard`, `EditableSpecsCard`, `FinancialsCard`,
  `SourceAuditTabs`, `SupplierDescriptionBanner`.

## Design

### Part A — Gallery is the single photo source

Remove the `backorder_line_media` layer everywhere; `product_media` (ordered by
`sort_order`) becomes the only photo+video source for B-codes.

- Drop the `backorder_line_media` join from: `getBackorderLine`, `getShowcaseBackorder`,
  `getClaimableBackorder`. Keep the `product_media` join. Photos and videos both derive
  from `product_media` (`media_type === 'video'` → video).
- Remove now-dead service functions: `listBackorderMedia`, `deleteBackorderMedia`,
  `saveBackorderPhotos`, `searchProductImages` (and their imports).
- Result: existing B-codes immediately show their model gallery. B-codes whose model was
  never harvested show no photos — acceptable, and Part B prevents new ones.

### Part B — Simplify the Add-Backorder dialog

- **Remove the entire Photos section**: photo grid, "Search web for more", the
  `dedupeSupplierImages` helper, the `photos`/`kept` state, the probe effect, and the
  `saveBackorderPhotos` call in `handleSubmit`. The iosys fetch still runs and still fills
  price / stock / specs / **included accessories**; its `imageUrls` are ignored.
- **Remove the inline "Create Product" button** (`ProductPicker` `onCreate` prop and
  `handleCreateProduct`). Manual picker *selection* of an existing model stays (covers
  fuzzy auto-match misses).
- **Hard-block on no catalog match**: when `handleFetch`'s `findMatchingProductModel`
  returns null and no model is selected, show a persistent inline error (and toast):

  > **No matching product model.** This item isn't in the catalog yet. Add the model
  > first — harvest it so its photos come with it — then create the backorder.

  Submit remains blocked while `product_id` is empty (already enforced by the schema).

### Part C — B-code detail page (mirrors P-code Item Detail)

- New route `admin/backorders/:id` → `BackorderDetailPage` (`src/pages/admin/backorder-detail.tsx`).
- Composed from the same card pattern as `item-detail.tsx`:
  - **Header** — B-code, status chip (ACTIVE/PAUSED/CLOSED), grade badge, actions
    (Edit, Close/Pause). Back link to `/admin/backorders`.
  - **Gallery** — `product_media` photos + videos.
  - **Specs** — product-model specs + line config (grade, color, storage, RAM, CPU,
    screen). Read-only (or reuse `EditableSpecsCard` read paths where practical).
  - **Pricing** — supplier → markup → selling → discount → profit; mirrors the Add
    dialog's pricing summary.
  - **Source** — supplier name, **iosys link `supplier_url` as a clickable ↗ (new tab)**,
    supplier product code, supplier stock, lead-time range. Mirrors `SourceAuditTabs`.
  - **Included Accessories** — labeled field, e.g. *Included: Box, Power Adapter, USB-C
    Charging Cable, Manual* (from `included_accessories`).
- `getBackorderLine` provides the data (already joins product model + media + supplier).
- **Backorders list rows become clickable** → navigate to `/admin/backorders/:id`
  (`backorder-list.tsx`), matching P-code → Item Detail UX. The earlier "↗ icon in the
  list" idea is dropped; the link lives on the detail page.

### Part D — Included accessories in the description

- `backorder_lines.included_accessories` already holds the English string. Surface it:
  - **Detail page** — dedicated "Included Accessories" field (Part C).
  - **Customer offer / `/mine`** and **admin list** — render as a **separate line under**
    the spec description (not appended inline). Empty/null → no line.
- Implementation: the description surfaces (`getBackorderDescription` in
  `backorder-list.tsx`, `getClaimableBackorder` subtitle in `mine.ts`, and the offer
  builder path) emit an optional second line from `included_accessories` when present.
  The exact plumbing (return a `{ description, accessories }` pair vs. a second field on the
  claimable/offer shape) is settled in the implementation plan; the visible outcome is a
  second line beneath the spec line.

### Part E — Remediate-then-drop (guarded migration)

**Audit finding (2026-07-08, live data via anon REST):** dropping `backorder_line_media`
is **not yet redundant**. Of 284 ACTIVE B-lines, 283 carry exactly one curated photo, and
**12 of those are tied to a product model with zero `product_media`** — the curated photo
is their only image. Plus ≥1 curated photo belongs to a non-ACTIVE line not visible to the
anon key. The 12 stranded B-codes span **11 distinct models**:

| Models needing media (harvest first) |
| --- |
| Apple iPhone 12 mini (Blue, (PRODUCT)RED), iPhone 13 (Starlight), iPhone 14 Pro Max (Gold), iPhone 12 (Black), iPhone XR (White), iPhone 14 (Purple) |
| Oppo Reno A (Blue, Black), Oppo Find X3 Pro 5G (Gloss Black), Oppo Reno11 A (Dark Green) |

**Step E1 — Harvest the stranded models.** Use the `harvest-catalog-models` skill to
populate `product_media` for the 11 models (full iosys lineup incl. the specific colors
above). Re-run the audit until zero models are stranded — including non-ACTIVE lines
(the migration query below sees all statuses).

**Step E2 — Guarded drop migration.** The migration runs as `postgres`, so it sees every
line regardless of status. It MUST first assert redundancy and abort if any line is still
stranded:

```sql
-- Abort the whole migration if any backorder line (any status) still has a curated
-- photo while its product model has no product_media — i.e. the drop is not yet safe.
DO $$
DECLARE stranded int;
BEGIN
  SELECT count(*) INTO stranded
  FROM backorder_lines bl
  WHERE EXISTS (SELECT 1 FROM backorder_line_media m WHERE m.backorder_line_id = bl.id)
    AND NOT EXISTS (SELECT 1 FROM product_media pm WHERE pm.product_id = bl.product_id);
  IF stranded > 0 THEN
    RAISE EXCEPTION 'Refusing to drop backorder_line_media: % B-line(s) would lose their only photo (model has no product_media). Harvest those models first.', stranded;
  END IF;
END $$;
```

Only after the guard passes:
- `DROP TABLE public.backorder_line_media` (CASCADE for its FK/index).
- Remove the `backorder-media` storage bucket and its `storage.objects` policies.
- Drop the `backorder_media_source` enum (now unused).
- Delete edge functions `save-backorder-photos` and `search-product-images` from the repo.

After the guard passes, remaining curated photos are provably redundant (every affected
model has gallery media); discarding them leaves each B-code showing its model gallery.

## Out of Scope / No Change

- **Fulfillment flow** (`reserve_backorder`, `fulfill_backorder_with_item`,
  `mark_backorder_ordered`, To-Fulfill queue) — untouched.
- **Messaging offer builder** — no direct change; it benefits from Part A automatically via
  `/mine`. (We will verify the attached offer photo resolves to the first gallery image.)
- **Accessories translation** — already implemented; not re-touched.
- **Catalog harvest** — unchanged; remains the way models (and their media) enter the
  catalog.

## Testing / Verification

- Backorder reads return gallery media (photos+videos) with no `backorder_line_media`
  reference; TypeScript types regenerated and `tsc --noEmit` clean.
- Add-Backorder dialog: fetch a listing whose model exists → creates B-code with no photo
  step; fetch a listing whose model is absent → hard-block error, no create path.
- New `/admin/backorders/:id` renders gallery, specs, pricing, source (iosys ↗ opens the
  listing), and accessories; clicking a list row navigates there.
- Customer `/mine/{B-code}` shows the model gallery and the accessories line under the spec
  line; a messaging offer for that B-code attaches a gallery photo.
- Migration applies cleanly; `backorder_line_media` and the bucket are gone; no runtime
  references remain (grep clean).

## Risks / Edge Cases

- **Model without media** — a harvested model can still lack photos; B-code then shows an
  empty gallery. Mitigated by Part B (must be in catalog) but harvest completeness is the
  real guarantee. Non-blocking.
- **Existing B-codes on media-less models** — 12 known (11 models) + ≥1 hidden non-ACTIVE.
  Addressed by Part E1 (harvest first) + the E2 migration guard, which refuses to drop
  while any line (any status) is still stranded. No B-code silently loses its only photo.
- **Offer photo path** — must confirm the messaging attachment picks the first
  `product_media` image for backorders after curated media is removed.

## Affected Files (indicative)

- `supabase/migrations/<new>_drop_backorder_line_media.sql`
- `supabase/functions/save-backorder-photos/` (delete), `.../search-product-images/` (delete)
- `src/services/backorders.ts`, `src/services/mine.ts`, `src/services/showcase.ts`
- `src/components/backorders/add-backorder-dialog.tsx`, `.../backorder-list.tsx`
- `src/pages/admin/backorder-detail.tsx` (new), `src/routes.tsx`
- `src/validators/backorder.ts`, `src/lib/types.ts`, `src/lib/database.types.ts` (regen)
</content>
</invoke>
