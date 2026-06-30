-- Android color JA→EN cleanup (2026-07-01). These ANDROID product_models rows were promoted in
-- earlier runs as the Japanese color token (coalesce fallback) BEFORE the verified English names
-- were added to the <BRAND>_COLORS_JA_EN maps this pass. Backfill the verified English names in
-- place (no new rows, so the partial UNIQUE index is untouched — each JA-token row is the sole
-- representative of its (brand,model,storage) identity). Brand-scoped because the same katakana can
-- map to different official English across makers (e.g. チタニウムグレー = Titan Gray for Xiaomi but
-- Titanium Gray for OPPO/Samsung).
BEGIN;

UPDATE public.product_models pm SET color = m.en
FROM (VALUES
  ('Fujitsu','ターコイズ','Turquoise'),
  ('Motorola','コスモブルー','Cosmos Blue'),
  ('Motorola','リュクスラベンダー','Luxe Lavender'),
  ('Motorola','ライトスカイホワイト','PANTONE Lightest Sky'),
  ('Oppo','スターグレー','Star Grey'),
  ('Samsung','プリズムブリックスブラック','Prism Bricks Black'),
  ('Samsung','プリズムブリックスホワイト','Prism Bricks White'),
  ('Samsung','チタニウムシルバーブルー','Titanium Silverblue'),
  ('Sharp','トレンチベージュ','Trench Beige'),
  ('Sharp','フルブラック','Full Black'),
  ('Sharp','クラッシィブルー','Classy Blue'),
  ('Sony','フロストグレー','Frost Gray'),
  ('Sony','アイスホワイト','Ice White'),
  ('Sony','ミストグレー','Mist Gray'),
  ('Sony','チャコールブラック','Charcoal Black'),
  ('Xiaomi','リップルグリーン','Ripple Green'),
  ('Xiaomi','チタニウムグレー','Titan Gray'),
  ('Xiaomi','スターリットグリーン','Starlit Green')
) AS m(brand, ja, en)
WHERE pm.device_category='ANDROID' AND pm.status='ACTIVE'
  AND pm.brand = m.brand AND pm.color = m.ja
  -- safety: don't collide with an already-existing EN-named sibling SKU
  AND NOT EXISTS (
    SELECT 1 FROM public.product_models x
    WHERE x.device_category='ANDROID' AND x.status='ACTIVE'
      AND x.brand=pm.brand AND x.model_name=pm.model_name
      AND coalesce(x.storage_gb,'')=coalesce(pm.storage_gb,'') AND x.color=m.en
  );

COMMIT;
