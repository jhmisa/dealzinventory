# Content Studio — Phase 4 Implementation Plan (Content sources)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline). Steps use `- [ ]`.

**Phase 4 goal:** Feed the Library from non-video sources. **Reviews ingestion** (wire the existing `customer_reviews` table — manual / paste / CSV, NO live FB scrape), a **Review-card maker** (review → branded 1080×1080 quote card → `content_items` kind=review_card in the Reviews pool), and a **Carousel builder** (ordered slides → `content_items` kind=carousel). Both makers land in the Create hub. Nothing publishes.

**Architecture:** `customer_reviews` gets `rating` + `imported_from` + `review_card_content_item_id`. The review card is rendered on a 1080×1080 canvas (pure text-wrap/layout helper + a draw fn), uploaded to the `social-media` bucket, and recorded as a `content_items` row so it flows through the Library → Calendar → (eventually) publisher like any other content. Carousel = upload/reorder images → `content_items(kind=carousel)`.

**Safety invariants:** app's shadcn/Tailwind theme; atomic commits + PROJECT_STATE per commit; `tsc` + `tsx` on new tests before commit; migrations via CLI; regen `database.types.ts`, hand-edit `types.ts`; never enable publish-due cron / content_publisher_enabled; never push main.

---

## Task 1 — DB: customer_reviews columns

**Files:** `supabase/migrations/20260711020000_customer_reviews_content_studio.sql`.

- [ ] **1.1** Migration:
```sql
ALTER TABLE public.customer_reviews
  ADD COLUMN IF NOT EXISTS rating int CHECK (rating BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS imported_from text NOT NULL DEFAULT 'manual' CHECK (imported_from IN ('manual','csv','paste')),
  ADD COLUMN IF NOT EXISTS review_card_content_item_id uuid REFERENCES public.content_items(id) ON DELETE SET NULL;
```
- [ ] **1.2** Apply via CLI. Regen `database.types.ts` (temp → verify → copy). `tsc`. (`CustomerReview*` types alias the table, so they pick up the new columns automatically.)
- [ ] **1.3** Commit `feat(content-studio): customer_reviews rating + imported_from + card link`.

## Task 2 — Review-card render (pure + canvas)

**Files:** `src/lib/content-studio/review-card.ts` (+ test).

- [ ] **2.1** Pure `wrapText(text, maxCharsPerLine, maxLines): string[]` (greedy word-wrap, ellipsis last line if overflow) + `REVIEW_CARD_STYLES` (Forest/Ink/Paper → {bg, fg, accent}) + `starString(rating): string`. + test (wrap splits on words, respects maxLines + ellipsis; stars). `npx tsx`.
- [ ] **2.2** `drawReviewCard(ctx, { name, quote, rating, style }): void` — draws a 1080×1080 branded card (bg, quote in large wrapped type, ★ rating, "— Name", a small Dealz wordmark). Uses wrapText. Not unit-tested (canvas), but used by the maker + verified visually.
- [ ] **2.3** Commit `feat(content-studio): review-card render helpers (pure wrap + canvas draw)`.

## Task 3 — Review-card maker (Create hub)

**Files:** `src/components/content-studio/create/review-card-maker.tsx`; service `content-items` reuse; storage upload helper.

- [ ] **3.1** A dialog/section: left = review source (existing reviews list from `useCustomerReviews` + an "Add review" mini-form: name, quote, rating, item_code; + a **Paste** textarea that parses "Name: …\nQuote: …" or a simple block; + **CSV import** (name,quote,rating rows) → bulk `createCustomerReview(imported_from='csv')`). Right = card style picker (Forest/Ink/Paper) + a live `<canvas>` preview via `drawReviewCard`.
- [ ] **3.2** **Generate**: render an offscreen 1080×1080 canvas → `toBlob('image/webp')` → upload to `social-media` bucket (`review-cards/{uuid}.webp`) → `createContentItem({ kind:'review_card', title: \`Review · ${name}\`, media_urls:[url], category_id: reviewsCategoryId, orientation:'square', source:'review' })` → also `updateCustomerReview(id,{ review_card_content_item_id })`. Toast + it appears in Library. Resolve Reviews category via `useContentCategories()` (slug 'reviews').
- [ ] **3.3** `tsc`. Commit `feat(content-studio): Review-card maker (ingest + style + render to Library)`.

## Task 4 — Carousel builder (Create hub)

**Files:** `src/components/content-studio/create/carousel-builder.tsx`.

- [ ] **4.1** A dialog: title + category select + an ordered slide list — add images (file input, upload each to `social-media` bucket `carousels/{uuid}`), reorder (up/down buttons), remove; first slide labelled **Cover**; a caption textarea.
- [ ] **4.2** **Save**: `createContentItem({ kind:'carousel', title, media_urls:[...orderedUrls], category_id, orientation:'square', source:'carousel' })` → toast → Library. (Blotato multi-image publish params noted in spec §10; NOT published here.)
- [ ] **4.3** `tsc`. Commit `feat(content-studio): Carousel builder (ordered slides -> Library)`.

## Task 5 — Wire Create hub + verify + FINAL milestone

**Files:** `src/pages/admin/content-studio.tsx`.

- [ ] **5.1** Replace the disabled 'Build carousel' + 'Make review card' cards with buttons that open the new makers (enabled). Keep product-video + talking-head as-is.
- [ ] **5.2** Playwright (dev-staff): add a review → generate a review card → confirm a `content_items(kind=review_card)` shows in the Library; build a 2-image carousel → confirm `content_items(kind=carousel)` in Library. Screenshot. 0 console errors. Clean up test reviews / content_items / uploaded objects.
- [ ] **5.3** PROJECT_STATE update; commit. **FINAL milestone show-and-tell** across all 4 phases + remaining work (Phase 3b, MONO reskin, cron go-live gated on Joey); branch ready for review/merge (do NOT merge/push).

## Exit criteria
- Reviews can be added (manual/paste/CSV); a review renders to a branded card that lands in the Library; a carousel of ordered slides lands in the Library. tsc green, pure tests pass, migrations applied, atomic commits, nothing published.
