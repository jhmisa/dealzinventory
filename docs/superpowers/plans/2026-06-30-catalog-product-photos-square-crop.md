# Catalog Product Photos (Square, Center-Cropped) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give iosys-harvested `product_models` a hero photo that is stored as a true square (1:1), center-cropped WebP (1080² display + 256² thumb), for both new harvests and a one-time backfill of all existing models.

**Architecture:** A new pure `square-crop.ts` module does center-crop → square WebP via ImageMagick-WASM. A new `card-images.ts` module pairs each iosys listing card's `<img src>` with its `<img alt>` title; `harvestCatalog` attaches that URL to each `CatalogRow.image_url` (one central join point — the delicate per-brand parsers are untouched) and it's staged into `iosys_catalog.image_url`. A new `save-product-photos` edge function fetches an image, square-crops it, uploads to a new `product-media` bucket, and inserts one `product_media` hero row — the existing `trg_fanout_product_media` trigger spreads it to every storage variant of that color. Backfill = a data-op that builds a job list (one representative model per color group missing a hero, matched catalog→product_models) + a runner that calls the edge function throttled.

**Tech Stack:** Supabase (Postgres, Storage, Edge Functions/Deno), TypeScript, ImageMagick-WASM (`imagemagick_deno`), Deno test.

---

## Spec

Design spec: `docs/superpowers/specs/2026-06-30-catalog-product-photos-square-crop-design.md`

## Locked decisions (from the spec)

- **Square = center-crop to square** (cover, center gravity). Joey accepted possible clipping of tall phone shots.
- **Scope = new harvests + one-time backfill** of existing harvested `product_models`.
- **Source = iosys listing image** (`…/{code}_{n}_L.jpg|webp`), re-hosted into our Storage. Not AI.
- **Engine = ImageMagick-WASM** (`imagemagick_deno`); `sharp` won't run in the Deno edge runtime.

## Key facts about the existing code (read before starting)

- `product_media.product_id` → **`product_models.id`**. Columns: `product_id, file_url, media_type, role, sort_order` (+ id/created_at). Unique on `(product_id, file_url)`.
- `product_models` has `id, brand, model_name, model_number, part_number, storage_gb (TEXT), color (TEXT, EN), color_ja (TEXT), color_key (TEXT), status` (status `'ACTIVE'`).
- **Fanout trigger `trg_fanout_product_media`** (`supabase/migrations/20260628170100_product_media_fanout_triggers.sql`): inserting ONE `product_media` row replicates it to every other `product_model` sharing the same `color_key`. **So we insert exactly one hero row per color group.**
- `/admin/products` reads photos via `src/services/product-models.ts` (`product_media(...)` join; `toHero` picks `role==='hero'` → `hero_image_url`).
- `harvestCatalog` (`supabase/functions/_shared/catalog/harvest.ts`) is the single crawl loop. `category.pageToRows(html, section, sourceUrl)` returns `CatalogRow[]`; each row's `raw_title` is the decoded+whitespace-collapsed `<img alt>` text. The page `html` is in scope at the call site (line ~463).
- `harvest-iosys-catalog` edge function upserts rows into `iosys_catalog` `ON CONFLICT (part_number)`.
- Catalog→product_models matching (reused for backfill) lives in `supabase/data-ops/2026-06-29-backorder-populate.sql` (`matched` CTE: Apple `part_number` → Android `model_number`+storage+color → `model_name`+storage+color).
- Tests are Deno tests under `supabase/functions/_shared/catalog/*.test.ts`, run with `deno test`. Confirm the exact invocation the repo uses (check `deno.json` tasks / how `android-listing.test.ts` is run) and mirror it. This plan assumes `deno test --allow-read --allow-net <file>`.

---

## File Structure

- **Create** `supabase/functions/_shared/image/square-crop.ts` — pure `cropToSquareWebp(input, size, quality)`; one responsibility (image transform), independently testable.
- **Create** `supabase/functions/_shared/image/square-crop.test.ts`
- **Create** `supabase/functions/_shared/catalog/card-images.ts` — `extractCardImageMap(html, baseUrl)` + `normalizeAltKey(s)`; pairs card `<img alt>`→`<img src>`.
- **Create** `supabase/functions/_shared/catalog/card-images.test.ts`
- **Modify** `supabase/functions/_shared/catalog/harvest.ts` — add `image_url?: string | null` to `CatalogRow`; attach it in the `harvestCatalog` loop.
- **Modify** `supabase/functions/harvest-iosys-catalog/index.ts` — include `image_url` in the upsert payload.
- **Create** `supabase/migrations/20260630120000_product_photos_pipeline.sql` — `product-media` bucket + `iosys_catalog.image_url` column.
- **Create** `supabase/functions/save-product-photos/index.ts` — fetch → square-crop → upload → insert one hero (uses `square-crop.ts`).
- **Create** `supabase/data-ops/2026-06-30-product-photo-backfill.sql` — build `product_photo_jobs` (one rep model per color group missing a hero).
- **Create** `supabase/functions/_shared/catalog/run-product-photo-backfill.ts` — runner that reads `product_photo_jobs` and calls `save-product-photos` throttled.

---

### Task 1: Migration — `product-media` bucket + `iosys_catalog.image_url`

**Files:**
- Create: `supabase/migrations/20260630120000_product_photos_pipeline.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Product catalog photos pipeline: a public-read bucket for square-cropped product images,
-- and a staging column to carry the iosys listing image URL through the catalog harvest.

-- 1. Storage bucket for product hero/gallery images (public read; authenticated write).
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-media', 'product-media', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "product-media public read"
  ON storage.objects FOR SELECT USING (bucket_id = 'product-media');
CREATE POLICY "product-media authenticated insert"
  ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'product-media' AND auth.role() = 'authenticated');
CREATE POLICY "product-media service insert"
  ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'product-media' AND auth.role() = 'service_role');
CREATE POLICY "product-media authenticated delete"
  ON storage.objects FOR DELETE USING (bucket_id = 'product-media' AND auth.role() = 'authenticated');

-- 2. Staging column: the representative iosys listing image URL for a catalog SKU.
ALTER TABLE public.iosys_catalog ADD COLUMN IF NOT EXISTS image_url text;
```

- [ ] **Step 2: Apply the migration via CLI**

Run: `supabase db push` (or `supabase migration up`)
Expected: migration applies cleanly; no error.

- [ ] **Step 3: Verify bucket + column exist**

Run:
```bash
supabase db query --linked -c "select id, public from storage.buckets where id='product-media'; select column_name from information_schema.columns where table_name='iosys_catalog' and column_name='image_url';"
```
Expected: one bucket row (`product-media`, `public=t`) and one column row (`image_url`).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260630120000_product_photos_pipeline.sql
git commit -m "feat(catalog): product-media bucket + iosys_catalog.image_url staging column"
```

---

### Task 2: `square-crop.ts` — center-crop → square WebP (pure module, TDD)

**Files:**
- Create: `supabase/functions/_shared/image/square-crop.ts`
- Test: `supabase/functions/_shared/image/square-crop.test.ts`

- [ ] **Step 1: Write the failing test**

The test builds a deliberately NON-square input (200×400 PNG) in-memory with ImageMagick, runs `cropToSquareWebp`, then reads the output back and asserts it is an exact square at the requested size. Use a small size for speed.

```ts
// supabase/functions/_shared/image/square-crop.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  ImageMagick,
  initializeImageMagick,
  MagickColor,
  MagickFormat,
  MagickGeometry,
} from "https://deno.land/x/imagemagick_deno@0.0.31/mod.ts";
import { cropToSquareWebp } from "./square-crop.ts";

await initializeImageMagick();

function makeNonSquarePng(w: number, h: number): Uint8Array {
  let out = new Uint8Array();
  ImageMagick.read(new MagickColor("#3366cc"), w, h, (img) => {
    img.write(MagickFormat.Png, (d) => (out = new Uint8Array(d)));
  });
  return out;
}

function dimsOf(bytes: Uint8Array): { w: number; h: number; format: string } {
  let r = { w: 0, h: 0, format: "" };
  ImageMagick.read(bytes, (img) => {
    r = { w: img.width, h: img.height, format: img.format.toString() };
  });
  return r;
}

Deno.test("cropToSquareWebp produces an exact square at the requested size", async () => {
  const input = makeNonSquarePng(200, 400);
  const output = await cropToSquareWebp(input, 256, 80);
  const { w, h, format } = dimsOf(output);
  assertEquals(w, 256);
  assertEquals(h, 256);
  assertEquals(format.toLowerCase().includes("webp"), true);
});

Deno.test("cropToSquareWebp on a landscape input is also square", async () => {
  const input = makeNonSquarePng(800, 300);
  const output = await cropToSquareWebp(input, 256, 80);
  const { w, h } = dimsOf(output);
  assertEquals(w, 256);
  assertEquals(h, 256);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test --allow-read --allow-net supabase/functions/_shared/image/square-crop.test.ts`
Expected: FAIL — `cropToSquareWebp` not found / module missing.

- [ ] **Step 3: Write the implementation**

```ts
// supabase/functions/_shared/image/square-crop.ts
// Center-crop an arbitrary image to a square and encode it as WebP, via ImageMagick-WASM.
// Pure + side-effect-free: bytes in, bytes out. Used by save-product-photos.
import {
  Gravity,
  ImageMagick,
  initializeImageMagick,
  MagickFormat,
  MagickGeometry,
} from "https://deno.land/x/imagemagick_deno@0.0.31/mod.ts";

let _initialized: Promise<void> | null = null;
function ensureInit(): Promise<void> {
  if (!_initialized) _initialized = initializeImageMagick();
  return _initialized;
}

/**
 * Center-crop `input` to a square (the largest centered square that fits), resize to
 * `size`×`size`, and encode as WebP at `quality` (0–100). Returns the WebP bytes.
 */
export async function cropToSquareWebp(
  input: Uint8Array,
  size: number,
  quality: number,
): Promise<Uint8Array> {
  await ensureInit();
  let out = new Uint8Array();
  ImageMagick.read(input, (img) => {
    const side = Math.min(img.width, img.height);
    // 1. Center-crop to the largest centered square.
    img.crop(new MagickGeometry(side, side), Gravity.Center);
    // 2. Drop the virtual-canvas offset the crop leaves behind, else write keeps the page.
    img.repage();
    // 3. Resize the square down/up to the exact target (force exact dims — already square).
    const geom = new MagickGeometry(size, size);
    geom.ignoreAspectRatio = true;
    img.resize(geom);
    // 4. Encode WebP.
    img.quality = quality;
    img.write(MagickFormat.WebP, (data) => {
      out = new Uint8Array(data); // copy out — `data` is only valid inside the callback
    });
  });
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test --allow-read --allow-net supabase/functions/_shared/image/square-crop.test.ts`
Expected: PASS (2 tests). If the `crop`/`repage`/`resize` API names differ in the pinned `imagemagick_deno` version, adjust to that version's API until both assertions pass — the square-output assertions are the contract.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/image/square-crop.ts supabase/functions/_shared/image/square-crop.test.ts
git commit -m "feat(image): cropToSquareWebp — center-crop to square WebP via ImageMagick-WASM"
```

---

### Task 3: `card-images.ts` — pair card `<img alt>` → `<img src>`

**Files:**
- Create: `supabase/functions/_shared/catalog/card-images.ts`
- Test: `supabase/functions/_shared/catalog/card-images.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// supabase/functions/_shared/catalog/card-images.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { extractCardImageMap, normalizeAltKey } from "./card-images.ts";

const HTML = `
<li class="item">
  <img alt="iPhone 12 64GB ブラック (MGHN3J/A)" src="https://iosys.co.jp/img/items/12345_2_M.jpg">
</li>
<li class="item">
  <img src="//iosys.co.jp/img/items/67890_1_S.webp" alt="Galaxy S24 SM-S921Q 256GB Onyx Black">
</li>
<li class="item">
  <img alt="thumb only" src="/img/items/00000_1_L.jpg">
</li>`;

Deno.test("extractCardImageMap keys by normalized alt and forces the _L large variant + absolute URL", () => {
  const map = extractCardImageMap(HTML, "https://iosys.co.jp");
  assertEquals(
    map.get(normalizeAltKey("iPhone 12 64GB ブラック (MGHN3J/A)")),
    "https://iosys.co.jp/img/items/12345_2_L.jpg",
  );
  // src-before-alt order still works; protocol-relative URL resolved.
  assertEquals(
    map.get(normalizeAltKey("Galaxy S24 SM-S921Q 256GB Onyx Black")),
    "https://iosys.co.jp/img/items/67890_1_L.webp",
  );
  // relative URL resolved against base.
  assertEquals(map.get(normalizeAltKey("thumb only")), "https://iosys.co.jp/img/items/00000_1_L.jpg");
});

Deno.test("normalizeAltKey collapses whitespace and decodes entities", () => {
  assertEquals(normalizeAltKey("iPhone&nbsp;12  64GB"), normalizeAltKey("iPhone 12 64GB"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test --allow-read supabase/functions/_shared/catalog/card-images.test.ts`
Expected: FAIL — module/exports missing.

- [ ] **Step 3: Write the implementation**

```ts
// supabase/functions/_shared/catalog/card-images.ts
// Pair each iosys listing card's <img alt> (the SKU title) with its <img src> (the product
// photo). Keyed by a normalization that matches CatalogRow.raw_title, so harvestCatalog can
// attach an image URL to each row without touching the per-brand title parsers.

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'");
}

/** Normalize an alt/title string to the same shape as CatalogRow.raw_title for map lookups. */
export function normalizeAltKey(s: string): string {
  return decodeEntities(s).replace(/[\s　]+/g, " ").trim();
}

/** Force the large (_L) iosys size variant and resolve to an absolute URL. */
function normalizeSrc(src: string, baseUrl: string): string | null {
  let u = src.trim();
  if (!u) return null;
  if (u.startsWith("//")) u = "https:" + u;
  else if (u.startsWith("/")) u = baseUrl.replace(/\/+$/, "") + u;
  else if (!/^https?:\/\//i.test(u)) return null; // skip data: and other non-http srcs
  // iosys size suffix: {code}_{n}_{L|M|S}.{ext} — prefer the large variant.
  u = u.replace(/(_\d+_)[LMS](\.(?:jpe?g|webp|png))/i, "$1L$2");
  return u;
}

/** Map every card image on a listing page: normalized alt title -> absolute large image URL. */
export function extractCardImageMap(html: string, baseUrl = "https://iosys.co.jp"): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const alt = tag.match(/\salt="([^"]*)"/i)?.[1];
    const rawSrc = tag.match(/\ssrc="([^"]*)"/i)?.[1] ??
      tag.match(/\sdata-src="([^"]*)"/i)?.[1] ??
      tag.match(/\sdata-original="([^"]*)"/i)?.[1];
    if (!alt || !rawSrc) continue;
    const key = normalizeAltKey(alt);
    if (!key || map.has(key)) continue; // first card for a title wins
    const src = normalizeSrc(rawSrc, baseUrl);
    if (src) map.set(key, src);
  }
  return map;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test --allow-read supabase/functions/_shared/catalog/card-images.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/catalog/card-images.ts supabase/functions/_shared/catalog/card-images.test.ts
git commit -m "feat(catalog): card-images — pair listing <img alt> title to <img src> photo URL"
```

---

### Task 4: Thread `image_url` through the harvest into `iosys_catalog`

**Files:**
- Modify: `supabase/functions/_shared/catalog/harvest.ts` (CatalogRow ~line 76-93; harvestCatalog loop ~line 463)
- Modify: `supabase/functions/harvest-iosys-catalog/index.ts` (upsert chunk map)
- Test: `supabase/functions/_shared/catalog/harvest.test.ts` (extend existing)

- [ ] **Step 1: Write the failing test**

Add a test to `harvest.test.ts` that runs a fixture page through `harvestCatalog` with an injected `fetchPage` and asserts at least one row gets a non-null `image_url`. Use the same fixture pattern the existing tests use (check `__fixtures__/` for an iPhone listing fixture and reuse its filename).

```ts
// add to supabase/functions/_shared/catalog/harvest.test.ts
import { harvestCatalog, IPHONE_CATEGORY } from "./harvest.ts";
// NOTE: replace FIXTURE_PATH with the existing iPhone listing fixture used elsewhere in this file.

Deno.test("harvestCatalog attaches image_url to rows from card images", async () => {
  const html = await Deno.readTextFile(
    new URL("./__fixtures__/iphone-simfree-page1.html", import.meta.url), // <-- use the real fixture name
  );
  const res = await harvestCatalog({
    category: IPHONE_CATEGORY,
    sections: [{ path: "simfree", carrier: "SIM-Free" }],
    maxPagesPerSection: 1,
    throttleMs: 0,
    fetchPage: () => Promise.resolve(html),
  });
  const withImg = res.rows.filter((r) => r.image_url);
  // Most cards carry an <img src>; require the join to land for a healthy majority.
  assertEquals(withImg.length > 0, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test --allow-read --allow-net supabase/functions/_shared/catalog/harvest.test.ts`
Expected: FAIL — `image_url` is `undefined` on every row (property not set / not on type).

- [ ] **Step 3: Add `image_url` to `CatalogRow`**

In `supabase/functions/_shared/catalog/harvest.ts`, add the field to the `CatalogRow` interface (after `raw_title`, around line 90). Optional because it's attached centrally after row construction, so the per-row builders need no change:

```ts
export interface CatalogRow {
  // ... existing fields ...
  raw_title: string
  image_url?: string | null // representative listing photo URL (attached in harvestCatalog)
  listing_count: number
  specs: Record<string, unknown>
}
```

- [ ] **Step 4: Attach the image URL in the harvest loop**

In `harvestCatalog` (`harvest.ts`), import the helper at the top with the other catalog imports:

```ts
import { extractCardImageMap, normalizeAltKey } from "./card-images.ts"
```

Then in the per-page loop, right after `const rows = category.pageToRows(html, section, sectionUrl)` (~line 463) and BEFORE the `for (const row of rows)` dedupe insertion, attach images by title:

```ts
      const rows = category.pageToRows(html, section, sectionUrl)
      if (rows.length === 0) {
        log(`[${section.path}] page ${page} had 0 cards — end of section`)
        break
      }
      // Attach the representative listing photo to each row (central join; parsers untouched).
      const imgMap = extractCardImageMap(html, baseUrl)
      for (const row of rows) {
        row.image_url = imgMap.get(normalizeAltKey(row.raw_title)) ?? null
      }
```

(`baseUrl` is already defined at the top of `harvestCatalog`.)

- [ ] **Step 5: Run test to verify it passes**

Run: `deno test --allow-read --allow-net supabase/functions/_shared/catalog/harvest.test.ts`
Expected: PASS, including the new test (rows have `image_url`). Existing harvest tests still pass.

- [ ] **Step 6: Include `image_url` in the staging upsert**

In `supabase/functions/harvest-iosys-catalog/index.ts`, the upsert maps each row with `{ ...r, harvested_at: ... }`. Since `image_url` is now a property of the row, it is already included by the spread — confirm by reading the chunk map (around the `chunkSize` loop). No change needed if the spread carries it; if the code explicitly lists columns, add `image_url: r.image_url ?? null`.

Run (verify it compiles / type-checks):
`deno check supabase/functions/harvest-iosys-catalog/index.ts`
Expected: no type errors.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared/catalog/harvest.ts supabase/functions/harvest-iosys-catalog/index.ts supabase/functions/_shared/catalog/harvest.test.ts
git commit -m "feat(catalog): capture iosys listing image_url through harvest into staging"
```

---

### Task 5: `save-product-photos` edge function

**Files:**
- Create: `supabase/functions/save-product-photos/index.ts`

This adapts `supabase/functions/save-backorder-photos/index.ts` (browser UA, CORS, service-role client, per-image try/catch) and adds the square-crop step. It processes ONE product_model per call.

- [ ] **Step 1: Write the function**

```ts
// supabase/functions/save-product-photos/index.ts
// Fetch a product photo (iosys listing image), center-crop it to a square, encode 1080² display
// + 256² thumbnail WebP, upload both to the product-media bucket, and insert ONE product_media
// hero row. The trg_fanout_product_media trigger replicates the hero to every product_model
// sharing the same color_key. Idempotent: skips a color group that already has a hero.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { cropToSquareWebp } from "../_shared/image/square-crop.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const BUCKET = "product-media";
const DISPLAY = { size: 1080, quality: 82 };
const THUMB = { size: 256, quality: 80 };

function jsonResponse(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const productModelId = typeof body?.product_model_id === "string" ? body.product_model_id.trim() : "";
    const imageUrl = typeof body?.image_url === "string" ? body.image_url.trim() : "";
    if (!productModelId) return jsonResponse({ error: "product_model_id required" }, 400);
    if (!imageUrl) return jsonResponse({ error: "image_url required" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Resolve color_key + idempotency: skip if this color group already has a hero.
    const { data: model, error: modelErr } = await supabase
      .from("product_models")
      .select("id, color_key")
      .eq("id", productModelId)
      .single();
    if (modelErr || !model) return jsonResponse({ error: "product_model not found" }, 404);

    if (model.color_key) {
      const { data: existing } = await supabase
        .from("product_media")
        .select("id, product_models!inner(color_key)")
        .eq("role", "hero")
        .eq("product_models.color_key", model.color_key)
        .limit(1);
      if (existing && existing.length > 0) {
        return jsonResponse({ skipped: "color group already has a hero", product_model_id: productModelId }, 200);
      }
    }

    // Fetch original.
    const res = await fetch(imageUrl, { headers: { "User-Agent": BROWSER_UA } });
    if (!res.ok) return jsonResponse({ error: `fetch failed: HTTP ${res.status}` }, 502);
    const original = new Uint8Array(await res.arrayBuffer());

    // Square-crop → display + thumb WebP.
    const displayBytes = await cropToSquareWebp(original, DISPLAY.size, DISPLAY.quality);
    const thumbBytes = await cropToSquareWebp(original, THUMB.size, THUMB.quality);

    const base = `${model.color_key ?? productModelId}/${crypto.randomUUID()}`;
    const displayPath = `${base}_display.webp`;
    const thumbPath = `${base}_thumb.webp`;

    for (const [path, bytes] of [[displayPath, displayBytes], [thumbPath, thumbBytes]] as const) {
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, bytes, {
        contentType: "image/webp",
        upsert: false,
      });
      if (upErr) return jsonResponse({ error: `upload failed: ${upErr.message}` }, 500);
    }

    const displayUrl = supabase.storage.from(BUCKET).getPublicUrl(displayPath).data.publicUrl;

    // Insert ONE hero row; the fanout trigger spreads it across the color group.
    const { data: row, error: insErr } = await supabase
      .from("product_media")
      .insert({
        product_id: productModelId,
        file_url: displayUrl,
        media_type: "image",
        role: "hero",
        sort_order: 0,
      })
      .select()
      .single();
    if (insErr) return jsonResponse({ error: `insert failed: ${insErr.message}` }, 500);

    return jsonResponse({ ok: true, media: row, display_url: displayUrl, thumb_path: thumbPath }, 200);
  } catch (err) {
    return jsonResponse({ error: String(err instanceof Error ? err.message : err) }, 500);
  }
});
```

- [ ] **Step 2: Type-check**

Run: `deno check supabase/functions/save-product-photos/index.ts`
Expected: no type errors.

- [ ] **Step 3: Deploy the function**

Run: `supabase functions deploy save-product-photos`
Expected: deployed successfully.

- [ ] **Step 4: Manual smoke test against one real model**

Pick one harvested model with a known `color_key` and a real iosys image URL, then invoke:
```bash
curl -s -X POST "$SUPABASE_URL/functions/v1/save-product-photos" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"product_model_id":"<UUID>","image_url":"https://iosys.co.jp/img/items/<code>_1_L.jpg"}'
```
Expected: `{ "ok": true, "media": {...}, "display_url": "...product-media/..._display.webp" }`.
Then verify the stored file is square (Task 7 covers the formal check).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/save-product-photos/index.ts
git commit -m "feat(catalog): save-product-photos edge fn — square-crop + 1080/256 webp + hero insert"
```

---

### Task 6: Backfill — job list data-op + runner

**Files:**
- Create: `supabase/data-ops/2026-06-30-product-photo-backfill.sql`
- Create: `supabase/functions/_shared/catalog/run-product-photo-backfill.ts`

- [ ] **Step 1: Write the job-list data-op**

Reuses the catalog→product_models matching from `2026-06-29-backorder-populate.sql`, sourced from `iosys_catalog` (which now carries `image_url`). Produces ONE job per `color_key` that has no hero yet, choosing the representative model + its image.

```sql
-- supabase/data-ops/2026-06-30-product-photo-backfill.sql
-- Build a job list of (product_model_id, image_url): one representative model per color_key that
-- (a) matches an iosys_catalog row carrying an image_url and (b) has no product_media hero yet.
-- The runner (run-product-photo-backfill.ts) reads product_photo_jobs and calls save-product-photos.
-- Idempotent: re-running rebuilds the table and re-excludes color groups that now have a hero.
BEGIN;

DROP TABLE IF EXISTS public.product_photo_jobs;

CREATE TABLE public.product_photo_jobs AS
WITH matched AS (
  SELECT
    c.image_url,
    c.color_en, c.color_ja,
    COALESCE(pm_part.id, pm_modelno.id, pm_name.id) AS product_id
  FROM public.iosys_catalog c
  LEFT JOIN LATERAL (
    SELECT pm.id FROM public.product_models pm
    WHERE pm.status = 'ACTIVE' AND c.part_number IS NOT NULL AND pm.part_number = c.part_number
    LIMIT 1
  ) pm_part ON true
  LEFT JOIN LATERAL (
    SELECT pm.id FROM public.product_models pm
    WHERE pm.status = 'ACTIVE'
      AND c.part_number IS NULL AND c.model_number IS NOT NULL
      AND pm.model_number = c.model_number
      AND (c.storage_gb IS NULL
           OR NULLIF(regexp_replace(COALESCE(pm.storage_gb,''),'[^0-9]','','g'),'')::int = c.storage_gb)
      AND ( (c.color_en IS NOT NULL AND lower(pm.color) = lower(c.color_en))
            OR (c.color_ja IS NOT NULL AND pm.color_ja = c.color_ja)
            OR c.color_en IS NULL )
    ORDER BY (lower(COALESCE(pm.color,'')) = lower(COALESCE(c.color_en,''))) DESC
    LIMIT 1
  ) pm_modelno ON true
  LEFT JOIN LATERAL (
    SELECT pm.id FROM public.product_models pm
    WHERE pm.status = 'ACTIVE'
      AND lower(pm.model_name) = lower(c.model_name)
      AND (c.storage_gb IS NULL
           OR NULLIF(regexp_replace(COALESCE(pm.storage_gb,''),'[^0-9]','','g'),'')::int = c.storage_gb)
      AND ( (c.color_en IS NOT NULL AND lower(pm.color) = lower(c.color_en))
            OR (c.color_ja IS NOT NULL AND pm.color_ja = c.color_ja) )
    LIMIT 1
  ) pm_name ON true
  WHERE c.image_url IS NOT NULL
),
-- one representative model per color_key (skip groups that already have a hero)
ranked AS (
  SELECT DISTINCT ON (pm.color_key)
    m.product_id, m.image_url, pm.color_key
  FROM matched m
  JOIN public.product_models pm ON pm.id = m.product_id
  WHERE m.product_id IS NOT NULL
    AND pm.color_key IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.product_media x
      JOIN public.product_models pmx ON pmx.id = x.product_id
      WHERE x.role = 'hero' AND pmx.color_key = pm.color_key
    )
  ORDER BY pm.color_key, m.product_id
)
SELECT product_id, image_url FROM ranked;

COMMIT;
```

- [ ] **Step 2: Apply the data-op and inspect the job count**

Run:
```bash
supabase db query --linked -f supabase/data-ops/2026-06-30-product-photo-backfill.sql
supabase db query --linked -c "select count(*) as jobs from public.product_photo_jobs;"
```
Expected: a positive job count (color groups missing heroes that matched a catalog image). Note the number.

- [ ] **Step 3: Write the runner**

Mirrors `run-backorder-harvest.ts` style: reads the job table via the service-role client and calls `save-product-photos` for each, throttled (~25 per 40s, per the Missive/iosys rate-limit guidance) so bulk runs stay polite.

```ts
// supabase/functions/_shared/catalog/run-product-photo-backfill.ts
// One-off backfill runner: reads public.product_photo_jobs and calls the save-product-photos
// edge function for each, throttled. Run with:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   deno run --allow-env --allow-net supabase/functions/_shared/catalog/run-product-photo-backfill.ts
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const THROTTLE_MS = 1600; // ~25 calls / 40s
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const { data: jobs, error } = await supabase
  .from("product_photo_jobs")
  .select("product_id, image_url");
if (error) throw error;
console.log(`product_photo_jobs: ${jobs?.length ?? 0}`);

let ok = 0, skipped = 0, failed = 0;
for (let i = 0; i < (jobs?.length ?? 0); i++) {
  const job = jobs![i];
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/save-product-photos`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ product_model_id: job.product_id, image_url: job.image_url }),
    });
    const out = await r.json();
    if (out.ok) ok++;
    else if (out.skipped) skipped++;
    else { failed++; console.warn(`fail ${job.product_id}: ${out.error}`); }
  } catch (e) {
    failed++; console.warn(`error ${job.product_id}: ${String(e)}`);
  }
  if ((i + 1) % 10 === 0) console.log(`progress ${i + 1}/${jobs!.length} — ok=${ok} skip=${skipped} fail=${failed}`);
  await sleep(THROTTLE_MS);
}
console.log(`DONE — ok=${ok} skipped=${skipped} failed=${failed}`);
```

- [ ] **Step 4: Run the backfill**

Run:
```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
deno run --allow-env --allow-net supabase/functions/_shared/catalog/run-product-photo-backfill.ts
```
Expected: progress lines; final `DONE — ok=N skipped=M failed=K`. Investigate any `failed`.

- [ ] **Step 5: Commit**

```bash
git add supabase/data-ops/2026-06-30-product-photo-backfill.sql supabase/functions/_shared/catalog/run-product-photo-backfill.ts
git commit -m "feat(catalog): product photo backfill — job-list data-op + throttled runner"
```

---

### Task 7: End-to-end verification (spec Section 4)

**Files:** none (verification only)

- [ ] **Step 1: Stored files are truly square (the acceptance criterion)**

Pick 5 freshly uploaded `_display.webp` public URLs and 5 `_thumb.webp` and check dimensions:
```bash
for u in <display_url_1> ... ; do curl -s "$u" | magick identify -format "%wx%h %m\n" -; done
```
Expected: every display = `1080x1080 WEBP`, every thumb = `256x256 WEBP`.

- [ ] **Step 2: Center-crop sanity (clipping check)**

Open ~5 phones + ~3 laptops/tablets in `/admin/products` (dev staff login from `.env.local`, per the reference memory). Confirm the device body isn't badly clipped — whitespace trim is fine. If devices are consistently cut off, raise it: the fallback is the spec's "smart pad-if-tall" option (out of scope unless triggered).

- [ ] **Step 3: Hero renders in admin**

In `/admin/products`, confirm previously photo-less harvested models now show a photo (`hero_image_url` populated). Spot-check across brands (Apple + 2-3 Android).

- [ ] **Step 4: Fanout across storages**

Pick one color group with multiple storage variants:
```bash
supabase db query --linked -c "select pm.storage_gb, x.file_url from product_models pm join product_media x on x.product_id=pm.id where pm.color_key='<color_key>' and x.role='hero' order by pm.storage_gb;"
```
Expected: every storage variant shows the SAME `file_url` (one insert fanned out).

- [ ] **Step 5: Idempotency**

Re-run the data-op + runner (Task 6 Steps 2 + 4). Expected: job count drops (groups now have heroes), runner reports mostly `skipped`, and no duplicate `product_media` rows are created.

- [ ] **Step 6: Update project state + version, then ship**

Update `docs/PROJECT_STATE.md` (Now / Recently shipped) with the photos pipeline, bump `package.json` once (semver), and deploy via the `push-to-main` skill.

---

## Self-Review Notes

- **Spec coverage:** Section 1 (bucket/column/hero/fanout) → Task 1 + Task 5. Section 2 (crop pipeline) → Task 2 + Task 5. Section 3 (parser src capture, threading, post-promote photo step, backfill) → Tasks 3, 4, 5, 6. Section 4 (verification) → Task 7. Center-crop decision → Task 2. New-harvests path → Tasks 4 + 5 (harvest now stages `image_url`; the same `save-product-photos` step applies). Backfill → Task 6.
- **New-harvest photo step:** the post-promote call for *ongoing* harvests reuses the exact same mechanism as backfill — after a harvest + promote, re-run the Task 6 data-op + runner (they only act on color groups missing a hero). No separate code path needed; note this in PROJECT_STATE so future harvests include the photo step.
- **Type consistency:** `cropToSquareWebp(input, size, quality)`, `extractCardImageMap(html, baseUrl)` + `normalizeAltKey(s)`, `CatalogRow.image_url`, edge-fn body `{ product_model_id, image_url }`, job table `product_photo_jobs(product_id, image_url)` — all used consistently across tasks.
- **Open risk to watch during execution:** the central image join keys on `normalizeAltKey(raw_title)`. If any Apple/iPad/Mac/Watch parser stores a `raw_title` that differs from the verbatim `<img alt>`, those rows won't get an image (they fall back to `null`, no crash). Task 4 Step 5 surfaces the join rate; if Apple rows are missing images, inspect that parser's `raw_title` and adjust `normalizeAltKey` (or capture the image inside that parser) before the backfill.
