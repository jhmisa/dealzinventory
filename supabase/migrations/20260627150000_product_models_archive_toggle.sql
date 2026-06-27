-- Phase 2 (non-destructive reconcile) — the on/off switch.
-- Owner-chosen strategy: never delete existing product_models. Enrich the rows we can
-- confidently map to an iosys SKU (keeps the photos/videos already shot against them);
-- ARCHIVE the uncertain ones so they stop showing in search for new inventory.
--
-- ARCHIVED is a new product_status value (existing app queries filter status='ACTIVE',
-- so archived rows auto-hide). superseded_by links a retired/duplicated row to the clean
-- SKU that replaces it — for traceability and so the change is fully reversible.
--
-- NOTE: ALTER TYPE ... ADD VALUE cannot be used in the same transaction that later
-- references the new value, so the enum value is added in this standalone migration; the
-- data reconcile (which uses 'ARCHIVED') runs afterward.

ALTER TYPE product_status ADD VALUE IF NOT EXISTS 'ARCHIVED';

ALTER TABLE public.product_models
  ADD COLUMN IF NOT EXISTS superseded_by uuid REFERENCES public.product_models(id);

COMMENT ON COLUMN public.product_models.superseded_by IS
  'If set, this row has been superseded by the referenced clean SKU row (Phase 2 reconcile). Used when ARCHIVING a messy/duplicate row without deleting it.';
