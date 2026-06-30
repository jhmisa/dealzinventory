-- Archive stale JA-token color duplicates (2026-07-01). Re-harvesting aquos/xiaomi/oppo/motorola
-- AFTER adding their verified EN color maps made the fill-gaps insert EN-named rows as NEW (the
-- NOT-EXISTS guard keys on color, and JA-token ≠ EN-token), leaving a duplicate pair per SKU:
-- the pre-existing JA-token row + the new EN row. The JA-token rows carry 0 items. Supersede them
-- by their EN sibling (same brand/model/storage) and ARCHIVE — non-destructive, keeps the EN row.
BEGIN;

WITH pairs AS (
  SELECT ja.id AS ja_id, en.id AS en_id
  FROM public.product_models ja
  JOIN (VALUES
    ('Motorola','コスモブルー','Cosmos Blue'),
    ('Motorola','リュクスラベンダー','Luxe Lavender'),
    ('Motorola','ライトスカイホワイト','PANTONE Lightest Sky'),
    ('Oppo','スターグレー','Star Grey'),
    ('Sharp','トレンチベージュ','Trench Beige'),
    ('Sharp','フルブラック','Full Black'),
    ('Sharp','クラッシィブルー','Classy Blue'),
    ('Xiaomi','リップルグリーン','Ripple Green'),
    ('Xiaomi','チタニウムグレー','Titan Gray'),
    ('Xiaomi','スターリットグリーン','Starlit Green')
  ) AS m(brand, ja, en) ON ja.brand=m.brand AND ja.color=m.ja
  JOIN public.product_models en
    ON en.device_category='ANDROID' AND en.status='ACTIVE' AND en.brand=ja.brand
    AND en.model_name=ja.model_name AND coalesce(en.storage_gb,'')=coalesce(ja.storage_gb,'')
    AND en.color=m.en AND en.id<>ja.id
  WHERE ja.device_category='ANDROID' AND ja.status='ACTIVE'
    AND NOT EXISTS (SELECT 1 FROM public.items i WHERE i.product_id=ja.id)  -- safety: 0 items
)
UPDATE public.product_models pm
SET status='ARCHIVED', superseded_by=pairs.en_id
FROM pairs WHERE pm.id=pairs.ja_id;

COMMIT;
