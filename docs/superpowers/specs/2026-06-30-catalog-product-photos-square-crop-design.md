# Catalog Product Photos — Square, Center-Cropped (iosys harvest)

**Date:** 2026-06-30
**Status:** Design — awaiting approval
**Author:** Claude (with Joey)

## Goal

Give iosys-harvested `product_models` real product photos, where **every stored photo is a square (1:1) image, center-cropped**, conforming to the existing `IMAGE_SIZES` standard in `CLAUDE.md` (1080² display + 256² thumbnail, WebP, center crop to square).

Applies to **new harvests AND a one-time backfill** of all already-harvested `product_models`.

## Background / Why this is needed

Two findings from investigating the current state:

1. **The catalog harvest never captured images.** The iosys catalog harvest (`supabase/functions/_shared/catalog/` → `harvest-iosys-catalog` edge function → `iosys_catalog` staging → per-brand `*-fill-gaps.sql` data-ops → `product_models`) parses each listing card's `<img alt="...">` **title text** only, to extract identity + specs. It reads the `alt` and discards the `src`. No image field exists anywhere in the catalog pipeline (`AndroidListingSku`, `ListingSku`, `CatalogRow`, the `iosys_catalog` table). So harvested models have no photos by design.

2. **No image in the system is square or center-cropped today.** `save-backorder-photos` re-hosts the raw iosys JPEG unchanged (no crop/resize). `enhance-image` is an AI (fal.ai) call. The "center crop to square → 1080/256 WebP" rule in `CLAUDE.md` is documented but **not implemented anywhere**. This goal builds that pipeline for the first time.

### Data model (confirmed)

- `product_media.product_id` → **`product_models.id`** (product_models is the catalog SKU table — one row per brand+model+storage+color, with a `color_key` column).
- `product_media` columns: `product_id, file_url, media_type, role, sort_order` (+ id/created_at). Unique on `(product_id, file_url)` (`20260628170600_product_media_unique_url.sql`).
- **Fanout trigger `trg_fanout_product_media`** (`20260628170100_product_media_fanout_triggers.sql`): inserting **one** `product_media` row replicates it to every other `product_model` sharing the same `color_key`. So we attach **one hero photo per color group**, not per SKU — the trigger spreads it across storage variants.
- `/admin/products` reads photos via `src/services/product-models.ts` (`product_media(...)` join, `toHero` picks `role==='hero'` → `hero_image_url`).
- Storage buckets that exist: `photo-group-media`, `kaitori-media`, `id-documents`, `accessory-media`, `ticket-media`, `system-feedback-media`, `backorder-media`, `messaging-attachments`. **No `product-media` bucket yet.**

## Decisions (locked with Joey)

- **Square method: center-crop to square** (cover, center gravity). Joey chose this over pad-to-square knowing tall phone shots may clip top/bottom. In practice iosys `_L` images are near-square product shots with whitespace, so center crop mostly trims margins.
- **Scope: new harvests + one-time backfill** of existing harvested `product_models`.
- **Image source: iosys listing image** (`…/{code}_{n}_L.jpg|webp`) — free, accurate, already proven scrapeable by the backorder harvest. Not AI generation / external search.
- **Engine: ImageMagick-WASM** (`@imagemagick/magick-wasm`) in the Deno edge runtime (Supabase's documented choice; `sharp` won't run in edge).

## Architecture

```
listing parsers (capture <img src> _L)        ── NEW: capture image_url
        │
        ▼
CatalogRow.image_url ── iosys_catalog.image_url (NEW column)
        │
        ▼
promote data-ops (unchanged identity/spec logic)
        │
        ▼  for each color_key missing a hero
save-product-photos edge function  ── NEW
   fetch iosys _L  →  center-crop square (cover)
   →  1080² webp @82  +  256² webp @80
   →  upload both to product-media bucket
   →  INSERT product_media (role='hero', file_url=display)
        │
        ▼
trg_fanout_product_media  → shares hero across all SKUs of that color_key
        │
        ▼
/admin/products renders hero_image_url
```

The harvest path and the backfill path are the **same pipeline** — backfill is just running it once over the full catalog.

## Section 1 — Storage & data

- **New migration:** create public-read bucket `product-media` (mirror the `photo-group-media` policies: public `SELECT`; authenticated `INSERT`/`DELETE`).
- **New migration:** add `image_url text` column to `iosys_catalog` (nullable; staging only, TRUNCATE+reload each harvest).
- `product_media` rows reused as-is: `product_id` = a representative `product_model.id` for the color group, `role='hero'`, `media_type='image'`, `sort_order=0`, `file_url` = the **1080² display** public URL. The fanout trigger handles replication — **insert exactly one row per color group**; do not pre-fan-out manually.
- Storage path convention (per `CLAUDE.md`): `product-media/{color_key}/{uuid}_display.webp` and `{uuid}_thumb.webp`. Both sizes stored; `file_url` points to `_display`. The `_thumb` is retrievable by the naming convention (`_display`→`_thumb`); wiring the thumb into list cards is a follow-up, not part of this goal (current `/admin/products` uses the hero/display url).

## Section 2 — `save-product-photos` edge function (core new capability)

New function `supabase/functions/save-product-photos/index.ts`, adapted from `save-backorder-photos` with the crop pipeline added.

**Request:** `{ product_model_id: string, image_url: string }` (single hero per call; batch by calling per color group). Service-role client, CORS like siblings.

**Pipeline per image:**
1. `fetch(image_url, { headers: { 'User-Agent': BROWSER_UA } })` (reuse browser UA; iosys blocks default agents).
2. Decode bytes with ImageMagick-WASM.
3. **Center-crop to square:** crop to `min(w,h) × min(w,h)` centered (ImageMagick `-gravity center` cover), i.e. equivalent to `resize: 'cover'` to a 1:1 box.
4. Produce two WebP outputs: `1080×1080 @ quality 82` (display), `256×256 @ quality 80` (thumb).
5. Upload both to `product-media/{color_key}/...` (resolve `color_key` from the product_model; `crypto.randomUUID()` base name).
6. `INSERT` one `product_media` row (`product_id=product_model_id`, `file_url`=display public URL, `media_type='image'`, `role='hero'`, `sort_order=0`). On unique-violation `(product_id, file_url)` or an existing hero for the color group, skip (idempotent).
7. Return `{ media, skipped }` like `save-backorder-photos`.

**Idempotency / re-runs:** before processing, skip color groups that already have a `role='hero'` row, so re-running the backfill is safe and cheap.

**Error handling:** per-image try/catch → push to `skipped`, never fail the whole batch (mirrors `save-backorder-photos`). Log fetch/upload/insert failures with truncated URL.

## Section 3 — Harvest + backfill integration

**Parser changes** (`_shared/catalog/` listing parsers — `android-listing.ts`, `iosys-listing.ts`, and any Apple Watch/Mac variants):
- Where each card's `<img alt="...">` is matched, also capture the `<img ... src="...">` for the same tag (the `_L` large variant; normalize `_M`/`_S`→`_L` if needed).
- Add `image_url?: string` to the parsed SKU types and to `CatalogRow`.
- Row-builders carry `image_url` through. Dedup keeps the representative listing's image (same selection rule already used for the representative listing).

**Staging → promote:**
- `harvest-iosys-catalog` writes `image_url` into `iosys_catalog`.
- Promote data-ops unchanged for identity/specs. A **post-promote step** (new data-op SQL or a small orchestration in the harvest function) selects, per `color_key`, one `iosys_catalog` row with a non-null `image_url` whose color group has **no** `product_media` hero, and calls `save-product-photos` (`product_model_id` = representative model, `image_url`). Throttle to respect rate limits (reuse the established ~25 calls / 40s guidance if calling in bulk).

**One-time backfill:**
- Re-run the catalog harvest (now image-capturing) to repopulate `iosys_catalog.image_url` across the full lineup, then run the post-promote photo step over **all** color groups missing a hero. This single pass covers every already-harvested model. Log how many color groups were filled vs. skipped (no image found).

## Section 4 — Verification

1. **Stored files are truly square:** download a sample of uploaded `_display.webp` and `_thumb.webp` from `product-media` and assert dimensions are exactly `1080×1080` and `256×256` (e.g. via ImageMagick `identify` or a header check). This is the explicit acceptance criterion.
2. **Center-crop is sane:** visually spot-check ~5 phones + ~3 laptops/tablets that the device isn't badly clipped (accept whitespace trim; flag if a device body is cut off — informs any later move to the "smart pad" alternative).
3. **Hero renders:** load `/admin/products` with the dev staff login and confirm harvested models show their photo (`hero_image_url` populated).
4. **Fanout works:** for one color group with multiple storages, confirm all storage SKUs share the same hero `file_url` after a single insert.
5. **Idempotent:** re-run the backfill; confirm no duplicate `product_media` rows and skip counts reported.

## Out of scope (YAGNI)

- Re-processing existing `backorder_line_media` raw photos into squares (separate follow-up; can later share the same crop engine).
- Wiring the 256² thumb into list cards (current readers use the hero/display URL).
- `photo_groups` / `photo_group_media` verification workflow (we write `product_media` heroes, which is what the catalog surfaces).
- Multiple gallery images per model (hero only for v1).
- The "smart pad-if-tall" crop alternative (only if verification shows center-crop clips devices badly).

## Risks

- **Center-crop clipping** tall phone shots — accepted by decision; verification step 2 is the early-warning check.
- **ImageMagick-WASM cold start / memory** in edge runtime — mitigate by initializing once per invocation and processing sequentially.
- **iosys hotlink rot / hotlink protection** — we re-host into our bucket immediately, so stored copies are durable; the browser UA handles the fetch.
- **Rate limiting on bulk backfill** — throttle the photo step.
