# GOAL: Restore all product photos/videos, then iosys-photograph ONLY photo-less product models

> **This is the active /loop goal. Read this first on resume (it survives context clears).**
> Branch: `feat/catalog-product-photos`. Project: Dealz. Supabase project ref: `aeiyinpxmazmfubotpdk`.
> Run SQL with `supabase db query --linked "<sql>"` or `-f <file>` (CLI only, never MCP, never ask).
> `.env.local` has `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (no service-role key — anon works:
> the `save-product-photos` edge fn accepts any JWT bearer and uses its own internal service key).

## What happened (incident)
A cleanup step `DELETE FROM product_media WHERE file_url LIKE '%/product-media/%'` — meant to remove
only the NEW iosys backfill heroes — **deleted every team product_media row (all photos + 347 videos)**.
Cause: the team's media lives in the **`photo-group-media` bucket** under paths beginning
`product-media/{product_id}/...`, so their `file_url`s contain the substring `/product-media/` and were
matched by the broad LIKE. **The storage files survive** (6000 objects, incl. videos, back to Feb), and
the path encodes `product_id`, so the rows are fully reconstructable.

Two buckets, do NOT confuse them:
- **`photo-group-media` bucket**, path `product-media/{product_id}/...` = the TEAM's real photos/videos (uploaded via Media Studio; `src/lib/media/upload.ts`, `BUCKET='photo-group-media'`).
- **`product-media` bucket** (NEW, created this session) = our iosys backfill heroes.
- To target ONLY our backfill rows, use the BUCKET-qualified pattern `file_url LIKE '%/object/public/product-media/%'` — NOT the bare `/product-media/` (that also matches team rows!).

## Desired end state
1. Every team product photo/video is back (visible in admin product detail + lists).
2. iosys photos exist ONLY on product models (color groups) that had NO photos at all.
3. No duplicate heroes; no model with both team media AND an iosys hero.

## /loop steps (run in order; loop the backfill until product_photo_jobs is exhausted)

### Step 1 — RESTORE the team's deleted rows
Run: `supabase db query --linked -f supabase/data-ops/2026-06-30-restore-product-media.sql`
Verify: `select count(*) total, count(*) filter (where media_type='video') videos, count(distinct product_id) products from product_media where file_url like '%/photo-group-media/product-media/%';`
Expect ≈ 2647 images + 347 videos across ≈ 352 products. (Note: role/sort_order are approximated — see the SQL header.)

### Step 2 — Remove our iosys backfill heroes (start clean)
The backfill ran against the corrupted (photo-less) state and wrongly photographed many models that
actually had team media. Remove ALL our backfill rows (bucket-qualified so team rows are untouched):
`DELETE FROM product_media WHERE file_url LIKE '%/object/public/product-media/%';`
Verify team rows are intact afterward (re-run the Step 1 verify query — counts unchanged).
(Optional: the orphaned files in the `product-media` bucket can be left; harmless.)

### Step 3 — VERIFY the restore in the UI
Log into the deployed admin (`https://dealzinventory.vercel.app`, staff creds in `.env.local`) and
confirm a few product models again show their photos AND videos on the detail page. Spot-check 3–5.

### Step 4 — Clean iosys backfill onto ONLY photo-less models
The harvest already populated `iosys_catalog.image_url` for all brands (Apple 1375, Samsung 220, Sony
162, Sharp 104, Google 108, Xiaomi 85, OPPO 50, Motorola 33, Huawei 28, Fujitsu 22, ASUS 11). The edge
fn `save-product-photos` is deployed and idempotent (skips a color group that already has ANY
product_media). The data-op `supabase/data-ops/2026-06-30-product-photo-backfill.sql` builds
`product_photo_jobs` = one representative model per color group that (a) matched an iosys image and
(b) has NO product_media. After Step 1 restored team media, those models are correctly excluded.

  4a. Rebuild jobs: `supabase db query --linked -f supabase/data-ops/2026-06-30-product-photo-backfill.sql`
      then `select count(*) from product_photo_jobs;` (this is now ONLY truly photo-less matched groups).
  4b. ARM + run the runner (the runner has a SAFETY BRAKE requiring BACKFILL_ARMED=1):
      ```
      set -a; source .env.local; set +a
      SUPABASE_URL="$VITE_SUPABASE_URL" SUPABASE_SERVICE_ROLE_KEY="$VITE_SUPABASE_ANON_KEY" \
        BACKFILL_ARMED=1 deno run --allow-env --allow-net \
        supabase/functions/_shared/catalog/run-product-photo-backfill.ts
      ```
      Run it in a Bash background task (run_in_background) so it survives and notifies once on completion.
      ~5s/job; runs to completion. ONLY ONE runner at a time (two would race → duplicate heroes).
  4c. LOOP: when it finishes, rebuild jobs (4a) and re-run (4b) until `product_photo_jobs` count is 0
      (all photo-less matched groups photographed). Each loop is idempotent.

### Step 5 — Verify + finalize
- Race check (must be 0): groups with >1 distinct hero file_url —
  `select count(*) from (select pm.color_key from product_media x join product_models pm on pm.id=x.product_id where x.role='hero' group by pm.color_key having count(distinct x.file_url)>1) t;`
- Confirm models that had team media did NOT get an iosys hero; confirm photo-less models did.
- Remove the runner SAFETY BRAKE (the `BACKFILL_ARMED` guard block in run-product-photo-backfill.ts)
  OR keep it (harmless). Decide with the user.
- Bump is already at v1.87.0. Update PROJECT_STATE. Open the PR to main (do NOT merge without the user).

## Status checkpoint (UPDATED on resume, 2026-06-30 ~14:33)
- ✅ **Step 1 DONE** — team media restored: 2984 rows (2637 imgs + 347 videos across 346 products).
- ✅ **Step 2 DONE** — all iosys backfill rows removed; team rows intact.
- ✅ **Step 3 DONE** — UI spot-checked (Acer Nitro Photos(18)/Videos(4), iPhone 12 Mini photos + video plays).
- 🔄 **Step 4 IN PROGRESS** — clean single runner (task bl8vtbpu5, deno PID 45353) processing 808 jobs.
- ⚠️ **INCIDENT during resume:** the `BACKFILL_ARMED=1` brake was NOT respawn-proof. An autonomous
  background subagent ("Run full catalog backfill", task `aa1f2fb5c42308150`, spawned 14:20) kept
  respawning the runner WITH `BACKFILL_ARMED=1` and raced this recovery (created up to 96 stray rows +
  1 duplicate-hero group; all wiped). **Resolution:** (a) stopped the agent via TaskStop; (b) HARDENED
  the brake to require `BACKFILL_RECOVERY_OK=1` (old respawns now no-op); (c) neutered `/tmp/backfill-creds.sh`
  (the agent's fallback plan was a deno-bypassing curl loop). Re-run the clean runner with
  `BACKFILL_RECOVERY_OK=1` (NOT the old flag).
- All feature code committed on `feat/catalog-product-photos`; v1.87.0. Brake-hardening edit uncommitted.
