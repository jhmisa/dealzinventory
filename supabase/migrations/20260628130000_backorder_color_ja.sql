-- Backorder lines: store the Japanese color token alongside the canonical English color.
--
-- Owner principle (2026-06-28): inventory + customer-facing surfaces show ENGLISH colors;
-- the Kaitori side shows JAPANESE. product_models already carries color (EN) + color_ja (JA);
-- backorder_lines now mirrors that. The iosys parse fills color = canonical English (derived
-- via apple-colors JA->EN) and color_ja = the original Japanese listing token.
ALTER TABLE public.backorder_lines
  ADD COLUMN IF NOT EXISTS color_ja text;

COMMENT ON COLUMN public.backorder_lines.color IS
  'Canonical ENGLISH color (inventory + customer-facing). Japanese original is color_ja.';
COMMENT ON COLUMN public.backorder_lines.color_ja IS
  'Original JAPANESE color token from the supplier listing (Kaitori side). English is color.';
