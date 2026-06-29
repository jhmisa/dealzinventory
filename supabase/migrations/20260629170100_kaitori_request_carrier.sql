-- Capture the originating carrier on a kaitori (buy-back) request so staff can
-- price docomo/au/SoftBank units accordingly via the existing price-revision flow.
-- Lightweight: carrier is captured + displayed only; it does NOT participate in
-- kaitori_price_list auto-quote matching (no price-matrix explosion).
-- Free-text to mirror items.carrier / product_models.carrier; nullable = "not specified".

ALTER TABLE kaitori_requests
  ADD COLUMN carrier text;

COMMENT ON COLUMN kaitori_requests.carrier IS
  'Originating carrier (docomo/au/SoftBank/SIM-free) declared by the seller. Informational for manual pricing; not used in auto-quote matching.';
