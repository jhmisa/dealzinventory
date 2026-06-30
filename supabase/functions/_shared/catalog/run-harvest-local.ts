// Local dev runner for the iosys catalog harvest (NOT deployed).
// Crawls iosys from your own IP (verified to return real HTML), then emits a SQL file
// that upserts into iosys_catalog. Apply with:
//   deno run --allow-net --allow-write run-harvest-local.ts [iphone|ipad] > /tmp/harvest.sql
//   supabase db query --linked -f /tmp/harvest.sql
//
// The deployed edge function (harvest-iosys-catalog) uses the SAME harvestCatalog()
// core for the reusable "new phones came in -> re-run" path.

import {
  AQUOS_CATEGORY,
  GALAXY_CATEGORY,
  harvestCatalog,
  IPAD_CATEGORY,
  MACBOOK_CATEGORY,
  DESKMAC_CATEGORY,
  APPLEWATCH_CATEGORY,
  ARROWS_CATEGORY,
  HUAWEI_CATEGORY,
  MOTOROLA_CATEGORY,
  ROG_CATEGORY,
  ZENFONE_CATEGORY,
  IPHONE_CATEGORY,
  OPPO_CATEGORY,
  PIXEL_CATEGORY,
  XIAOMI_CATEGORY,
  XPERIA_CATEGORY,
} from "./harvest.ts"

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

const which = (Deno.args[0] ?? "iphone").toLowerCase()
const category = which === "ipad"
  ? IPAD_CATEGORY
  : which === "macbook"
  ? MACBOOK_CATEGORY
  : which === "deskmac"
  ? DESKMAC_CATEGORY
  : which === "applewatch" || which === "watch"
  ? APPLEWATCH_CATEGORY
  : which === "galaxy"
  ? GALAXY_CATEGORY
  : which === "xperia"
  ? XPERIA_CATEGORY
  : which === "aquos"
  ? AQUOS_CATEGORY
  : which === "pixel"
  ? PIXEL_CATEGORY
  : which === "xiaomi"
  ? XIAOMI_CATEGORY
  : which === "oppo"
  ? OPPO_CATEGORY
  : which === "arrows"
  ? ARROWS_CATEGORY
  : which === "huawei"
  ? HUAWEI_CATEGORY
  : which === "zenfone"
  ? ZENFONE_CATEGORY
  : which === "rog"
  ? ROG_CATEGORY
  : which === "motorola"
  ? MOTOROLA_CATEGORY
  : IPHONE_CATEGORY
console.error(`=== harvesting category: ${which} ===`)

const res = await harvestCatalog({
  category,
  maxPagesPerSection: 60,
  stopAfterDryPages: 2,
  throttleMs: 900,
  onProgress: (m) => console.error(m), // progress to stderr; SQL to stdout
  fetchPage: async (url) => {
    const r = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "ja,en;q=0.8",
      },
    })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return await r.text()
  },
})

console.error("=== HARVEST STATS ===")
console.error(JSON.stringify(res.stats, null, 2))

const json = JSON.stringify(res.rows)
// Dollar-quoted literal avoids all escaping of Japanese / apostrophes.
const sql = `-- iosys_catalog harvest (${res.rows.length} SKUs, ${res.stats.pagesFetched} pages)
INSERT INTO public.iosys_catalog
  (sku_key, part_number, model_number, brand, model_name, storage_gb, color_ja, color_en,
   carrier, connectivity, device_category, source_url, carrier_path, raw_title, image_url, listing_count, specs)
SELECT x.sku_key, x.part_number, x.model_number, x.brand, x.model_name, x.storage_gb, x.color_ja,
       x.color_en, NULLIF(x.carrier,'')::jp_carrier, x.connectivity, x.device_category, x.source_url,
       x.carrier_path, x.raw_title, x.image_url, x.listing_count, x.specs
FROM jsonb_to_recordset($json$${json}$json$::jsonb) AS x(
  sku_key text, part_number text, model_number text, brand text, model_name text, storage_gb int,
  color_ja text, color_en text, carrier text, connectivity text, device_category text, source_url text,
  carrier_path text, raw_title text, image_url text, listing_count int, specs jsonb)
ON CONFLICT (sku_key) DO UPDATE SET
  part_number = EXCLUDED.part_number,
  model_number = EXCLUDED.model_number,
  brand = EXCLUDED.brand,
  model_name = EXCLUDED.model_name,
  storage_gb = EXCLUDED.storage_gb,
  color_ja = EXCLUDED.color_ja,
  color_en = EXCLUDED.color_en,
  carrier = EXCLUDED.carrier,
  connectivity = EXCLUDED.connectivity,
  device_category = EXCLUDED.device_category,
  source_url = EXCLUDED.source_url,
  carrier_path = EXCLUDED.carrier_path,
  raw_title = EXCLUDED.raw_title,
  image_url = EXCLUDED.image_url,
  listing_count = EXCLUDED.listing_count,
  specs = EXCLUDED.specs,
  harvested_at = now(),
  updated_at = now();
`
console.log(sql)
