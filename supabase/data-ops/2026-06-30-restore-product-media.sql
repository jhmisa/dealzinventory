-- RESTORE product_media rows that were deleted by an overly-broad cleanup on 2026-06-30.
--
-- INCIDENT: during the catalog-photos work, a cleanup ran
--   DELETE FROM product_media WHERE file_url LIKE '%/product-media/%';
-- intending to remove only the new iosys backfill heroes (which live in the NEW `product-media`
-- storage BUCKET). But the team's real product photos/videos are stored in the `photo-group-media`
-- BUCKET under a path that begins with `product-media/{product_id}/...`, so THEIR file_urls also
-- contain the substring `/product-media/`. The LIKE matched them and deleted every team
-- product_media row (all photos AND all 347 videos).
--
-- The storage FILES survived (6000 objects in photo-group-media, incl. videos, back to 2026-02-17).
-- The object path encodes the product_id, so we rebuild the rows from storage.objects.
--
-- Upload format (src/lib/media/upload.ts), bucket=photo-group-media, path=`product-media/{productId}`:
--   image:  product-media/{product_id}/{id}_display.{ext}  + ..._thumb.{ext}   (file_url = the _display URL)
--   video:  product-media/{product_id}/{id}.{mp4|webm|mov} + ..._thumb.{ext}   (file_url = the video URL)
-- Thumbs are NOT separate product_media rows, so they are excluded here.
--
-- KNOWN APPROXIMATIONS (the deleted rows' exact metadata is unrecoverable from storage):
--   * role: we cannot know which image was the team's chosen hero. We set the lowest-created image
--     per product to 'hero' and the rest to 'gallery'. Display works either way (the reader falls
--     back to media[0] when no hero), but specific hero choices may differ from the originals.
--   * sort_order: approximated by storage created_at (= upload order), per product.
--
-- Idempotent: ON CONFLICT (product_id, file_url) DO NOTHING. Safe to re-run.
-- Apply:  supabase db query --linked -f supabase/data-ops/2026-06-30-restore-product-media.sql

BEGIN;

-- Insert exact per-product files directly; disable the color-fanout trigger during the bulk load.
ALTER TABLE public.product_media DISABLE TRIGGER trg_fanout_product_media;

INSERT INTO public.product_media (product_id, file_url, media_type, role, sort_order)
SELECT
  split_part(o.name, '/', 2)::uuid AS product_id,
  'https://aeiyinpxmazmfubotpdk.supabase.co/storage/v1/object/public/photo-group-media/' || o.name AS file_url,
  CASE WHEN o.name ~* '\.(mp4|mov|webm)$' THEN 'video' ELSE 'image' END AS media_type,
  'gallery' AS role,
  (row_number() OVER (PARTITION BY split_part(o.name, '/', 2) ORDER BY o.created_at) - 1)::int AS sort_order
FROM storage.objects o
WHERE o.bucket_id = 'photo-group-media'
  AND o.name LIKE 'product-media/%'
  AND o.name !~ '_thumb\.'                                   -- thumbnails are not product_media rows
  AND split_part(o.name, '/', 2) ~ '^[0-9a-fA-F-]{36}$'      -- valid product UUID in path
  AND EXISTS (SELECT 1 FROM public.product_models pm WHERE pm.id = split_part(o.name, '/', 2)::uuid)
ON CONFLICT (product_id, file_url) DO NOTHING;

-- Give each product a hero = its earliest image (so hero_image_url is populated in lists).
UPDATE public.product_media t
SET role = 'hero'
FROM (
  SELECT DISTINCT ON (product_id) id
  FROM public.product_media
  WHERE media_type = 'image'
    AND file_url LIKE '%/object/public/photo-group-media/product-media/%'
  ORDER BY product_id, sort_order
) firsts
WHERE t.id = firsts.id;

ALTER TABLE public.product_media ENABLE TRIGGER trg_fanout_product_media;

COMMIT;

-- Verify after running:
--   select count(*) total, count(*) filter (where media_type='video') videos,
--          count(distinct product_id) products
--   from product_media where file_url like '%/photo-group-media/product-media/%';
-- Expect ~ (2647 images + 347 videos) across ~352 products.
