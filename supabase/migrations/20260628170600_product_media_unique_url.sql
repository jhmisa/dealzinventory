-- The color-fanout triggers dedup and match sibling rows by (product_id, file_url),
-- which is only sound if that pair is unique. Enforce it (data already has 0 dupes).
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_media_product_file
  ON public.product_media (product_id, file_url);
