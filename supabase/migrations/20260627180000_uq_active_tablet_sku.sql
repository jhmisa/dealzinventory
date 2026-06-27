-- Phase 4 (iPad): lock in the now-clean iPad catalog integrity.
-- One ACTIVE iPad SKU per (brand, model_name, color, storage_gb). model_name encodes
-- connectivity (Wi-Fi vs Wi-Fi + Cellular), so Wi-Fi and Cellular variants are distinct keys.
-- Prevents duplicate/dirty rows reappearing — same guard the iPhone catalog got.
--
-- Partial (device_category='TABLET' AND status='ACTIVE') because:
--   * Android/PC rows are not yet reconciled — don't constrain them.
--   * ARCHIVED rows intentionally retain superseded legacy duplicates — only ACTIVE is unique.
-- A global constraint is deferred to Phase 5-full once all device categories are clean.
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_tablet_sku
  ON public.product_models (brand, model_name, color, storage_gb)
  WHERE device_category = 'TABLET' AND status = 'ACTIVE';
