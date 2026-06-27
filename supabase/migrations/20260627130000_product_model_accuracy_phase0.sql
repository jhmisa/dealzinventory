-- Product Model Accuracy via iosys — Phase 0: Schema & references
-- Spec: docs/superpowers/specs/2026-06-27-product-model-accuracy-iosys.md
-- Decisions (confirmed 2026-06-27): A=SKU-level, B=in-place on product_models,
--   C=carrier vocab {SIM-Free,docomo,au,SoftBank,Rakuten} + is_unlocked separate,
--   D=existing-unit carrier verify-not-guess, E=janpara deferred.
--
-- This migration ONLY adds non-destructive scaffolding. No existing data is mutated.
-- Uniqueness constraints on product_models are DEFERRED to Phase 5 (after the data is clean).

-- ---------------------------------------------------------------------------
-- 1. product_models: bilingual color + provenance
-- ---------------------------------------------------------------------------
-- color_ja: Japanese color name (e.g. ホワイト) alongside canonical English `color`.
--           Needed for kaitori offers to the JP market.
ALTER TABLE public.product_models
  ADD COLUMN IF NOT EXISTS color_ja text;

-- source_url: the iosys listing that confirmed this SKU (provenance, optional).
--             Pairs with existing verified_at / verified_by columns.
ALTER TABLE public.product_models
  ADD COLUMN IF NOT EXISTS source_url text;

COMMENT ON COLUMN public.product_models.color_ja IS
  'Japanese color name (e.g. ホワイト). color = canonical English. Populated from iosys via the JP<->EN Apple color map.';
COMMENT ON COLUMN public.product_models.source_url IS
  'iosys (or other supplier) listing URL that confirmed this SKU. Provenance; pairs with verified_at/verified_by.';

-- ---------------------------------------------------------------------------
-- 2. Controlled carrier vocabulary (Decision C)
-- ---------------------------------------------------------------------------
-- Carrier = the network a JP unit was sold under. Distinct from is_unlocked (lock state).
DO $$ BEGIN
  CREATE TYPE jp_carrier AS ENUM ('SIM-Free','docomo','au','SoftBank','Rakuten');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ---------------------------------------------------------------------------
-- 3. iosys_catalog — read-only staging table for the harvested SKU catalog
-- ---------------------------------------------------------------------------
-- The crawler lands deduped SKU identities here. product_models is NEVER mutated
-- directly from the crawl — reconciliation (Phase 2) is a separate, reviewed step.
-- part_number is the absolute SKU key (model + storage + color + region).
CREATE TABLE IF NOT EXISTS public.iosys_catalog (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_number   text,                 -- Apple retail SKU, e.g. MGHY3J/A (absolute key; may be null if iosys omits it)
  model_number  text,                 -- A-number, e.g. A2402 (regional hardware variant; coarse)
  brand         text,
  model_name    text NOT NULL,        -- clean model, e.g. "iPhone 12"
  storage_gb    integer,              -- integer GB (matches backorder_lines / items convention)
  color_ja      text,                 -- Japanese color from iosys title
  color_en      text,                 -- English color derived via the Apple color map (null if unmapped → human confirm)
  carrier       jp_carrier,           -- from the iosys URL path segment
  device_category text,               -- IPHONE | TABLET | ANDROID (harvest hint)
  source_url    text,                 -- a representative iosys listing for this SKU
  supplier_product_code text,         -- iosys numeric code of the representative listing
  raw_title     text,                 -- original listing title (audit / re-parse)
  specs         jsonb NOT NULL DEFAULT '{}'::jsonb,  -- enriched specs (chipset/screen/year/ram/os) from the model->spec reference
  carrier_path  text,                 -- raw url path segment harvested from (simfree/docomo/au/softbank/rakuten)
  listing_count integer,              -- how many iosys listings shared this part_number (coverage signal)
  harvested_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- One row per part_number when present; otherwise allow rows keyed by the natural tuple.
CREATE UNIQUE INDEX IF NOT EXISTS uq_iosys_catalog_part_number
  ON public.iosys_catalog (part_number) WHERE part_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_iosys_catalog_model
  ON public.iosys_catalog (model_name, storage_gb, color_en);
CREATE INDEX IF NOT EXISTS idx_iosys_catalog_carrier
  ON public.iosys_catalog (carrier);

CREATE TRIGGER set_iosys_catalog_updated_at
  BEFORE UPDATE ON public.iosys_catalog
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.iosys_catalog ENABLE ROW LEVEL SECURITY;

-- Staff-only: this is an internal harvest/reconcile staging table. No anon access.
CREATE POLICY iosys_catalog_auth_all ON public.iosys_catalog
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.iosys_catalog TO anon, authenticated, service_role;

COMMENT ON TABLE public.iosys_catalog IS
  'Read-only staging: deduped SKU identities harvested from iosys. Source of truth for reconciling product_models. Never written to by app flows; only the harvest edge function and reconcile tooling.';
