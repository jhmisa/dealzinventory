-- 2026-07-08-backorder-stranded-media-fanout.sql
-- Backorder gallery inheritance (Part E1 remediation).
--
-- 10 older backorder-anchored product_models never received the color-fanout media that their
-- same-(brand, model, color) siblings already carry in the product-media bucket (they predate the
-- fanout trigger / were created after their siblings got photos). Copy the representative sibling's
-- gallery onto each stranded model so (a) its B-code shows a real product gallery, and (b) the
-- Part E2 guarded drop of backorder_line_media can proceed (guard is per product_id).
--
-- Safe because: reuses product-media-bucket URLs (survive the backorder-media bucket delete);
-- the fanout trigger's own INSERT is idempotent (NOT EXISTS file_url) and depth-guarded;
-- targets ONLY product_ids that currently have ZERO product_media.
WITH stranded AS (
  SELECT DISTINCT bl.product_id, pmm.color_key
  FROM backorder_lines bl
  JOIN product_models pmm ON pmm.id = bl.product_id
  WHERE pmm.color_key IS NOT NULL
    AND EXISTS (SELECT 1 FROM backorder_line_media m WHERE m.backorder_line_id = bl.id)
    AND NOT EXISTS (SELECT 1 FROM product_media p2 WHERE p2.product_id = bl.product_id)
),
src_counts AS (
  SELECT s.product_id AS target_id, pmx.product_id AS source_id, count(*) AS n
  FROM stranded s
  JOIN product_models sibm ON sibm.color_key = s.color_key AND sibm.id <> s.product_id
  JOIN product_media pmx ON pmx.product_id = sibm.id
  GROUP BY s.product_id, pmx.product_id
),
chosen AS (
  SELECT DISTINCT ON (target_id) target_id, source_id
  FROM src_counts
  ORDER BY target_id, n DESC, source_id
)
INSERT INTO product_media (product_id, file_url, media_type, role, sort_order)
SELECT c.target_id, src.file_url, src.media_type, src.role, src.sort_order
FROM chosen c
JOIN product_media src ON src.product_id = c.source_id
WHERE NOT EXISTS (
  SELECT 1 FROM product_media ex
  WHERE ex.product_id = c.target_id AND ex.file_url = src.file_url
);
