-- R6: a recorded video / social post can feature MULTIPLE products (the recorder tracks several
-- P-codes via itemBounds), but social_media_posts stored only a single `item_code` (the first one).
-- Add `item_codes text[]` so the caption engine can build one emoji block per featured product.
-- `item_code` stays as the primary/featured code (thumbnail + Recorded Videos grouping); `item_codes`
-- is the full ordered list. Nullable — legacy rows and single-product posts leave it null and the
-- caption engine falls back to [item_code].
ALTER TABLE public.social_media_posts
  ADD COLUMN IF NOT EXISTS item_codes text[];

COMMENT ON COLUMN public.social_media_posts.item_codes IS
  'All featured product codes for a multi-product post/video, in order. NULL → use [item_code].';
