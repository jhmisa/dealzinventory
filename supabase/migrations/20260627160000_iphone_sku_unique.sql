-- Phase 5 (partial): lock in the now-clean iPhone catalog integrity.
-- One ACTIVE iPhone SKU per (brand, model_name, color, storage_gb). Prevents the
-- duplicate/dirty rows that the reconcile just cleaned up from reappearing.
--
-- Partial (device_category='IPHONE' AND status='ACTIVE') because:
--   * Android/PC rows are not yet reconciled (Phase 4) — don't constrain them.
--   * ARCHIVED rows intentionally retain superseded duplicates — only ACTIVE is unique.
-- A global constraint is deferred to Phase 5-full once all device categories are clean.

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_iphone_sku
  ON public.product_models (brand, model_name, color, storage_gb)
  WHERE device_category = 'IPHONE' AND status = 'ACTIVE';
