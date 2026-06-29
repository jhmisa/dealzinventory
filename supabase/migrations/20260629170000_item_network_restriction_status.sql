-- Network utilization restriction status (ネットワーク利用制限) for physical items.
-- Japanese carrier blacklist convention:
--   CLEAN   = ○  no restriction (safe to resell)
--   CAUTION = △  currently clear but on installment / could change
--   BLOCKED = ×  赤ロム — barred from the network
--   UNKNOWN = —  not yet checked (default; we don't reliably capture IMEIs yet)
-- This is item-level provenance, NOT a product-model SKU dimension.

CREATE TYPE network_restriction_status AS ENUM ('CLEAN', 'CAUTION', 'BLOCKED', 'UNKNOWN');

ALTER TABLE items
  ADD COLUMN network_restriction_status network_restriction_status NOT NULL DEFAULT 'UNKNOWN';

COMMENT ON COLUMN items.network_restriction_status IS
  'Japanese network utilization restriction (○/△/×). Defaults to UNKNOWN until an IMEI check is performed.';
