-- Content Studio Phase 1: seed the Library from existing recorded videos so it isn't empty.
-- Recorded videos are social_media_posts rows with post_type='video'. Idempotent: skips
-- any post whose media_urls already produced a content_item.
INSERT INTO public.content_items
  (kind, title, category_id, media_urls, thumbnail_url, item_codes, orientation, source, created_by, created_at)
SELECT
  'video',
  COALESCE(NULLIF(p.caption, ''), 'Recorded video ' || left(p.id::text, 8)),
  NULL,
  p.media_urls,
  NULL,
  COALESCE(p.item_codes, CASE WHEN p.item_code IS NOT NULL THEN ARRAY[p.item_code] END),
  'portrait',
  'recorder',
  p.created_by,
  p.created_at
FROM public.social_media_posts p
WHERE p.post_type = 'video'
  AND array_length(p.media_urls, 1) >= 1
  AND NOT EXISTS (
    SELECT 1 FROM public.content_items ci WHERE ci.media_urls = p.media_urls
  );
