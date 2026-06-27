// Local dev runner for the iosys catalog harvest (NOT deployed).
// Crawls iosys from your own IP (verified to return real HTML), then emits a SQL file
// that upserts into iosys_catalog. Apply with:
//   deno run --allow-net --allow-write supabase/functions/_shared/catalog/run-harvest-local.ts > /tmp/harvest.sql
//   supabase db query --linked -f /tmp/harvest.sql
//
// The deployed edge function (harvest-iosys-catalog) uses the SAME harvestCatalog()
// core for the reusable "new phones came in -> re-run" path.

import { harvestCatalog } from "./harvest.ts"

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

const res = await harvestCatalog({
  maxPagesPerSection: 30,
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
  (part_number, model_number, brand, model_name, storage_gb, color_ja, color_en,
   carrier, device_category, source_url, carrier_path, raw_title, listing_count, specs)
SELECT x.part_number, x.model_number, x.brand, x.model_name, x.storage_gb, x.color_ja,
       x.color_en, NULLIF(x.carrier,'')::jp_carrier, x.device_category, x.source_url,
       x.carrier_path, x.raw_title, x.listing_count, x.specs
FROM jsonb_to_recordset($json$${json}$json$::jsonb) AS x(
  part_number text, model_number text, brand text, model_name text, storage_gb int,
  color_ja text, color_en text, carrier text, device_category text, source_url text,
  carrier_path text, raw_title text, listing_count int, specs jsonb)
ON CONFLICT (part_number) DO UPDATE SET
  model_number = EXCLUDED.model_number,
  brand = EXCLUDED.brand,
  model_name = EXCLUDED.model_name,
  storage_gb = EXCLUDED.storage_gb,
  color_ja = EXCLUDED.color_ja,
  color_en = EXCLUDED.color_en,
  carrier = EXCLUDED.carrier,
  device_category = EXCLUDED.device_category,
  source_url = EXCLUDED.source_url,
  carrier_path = EXCLUDED.carrier_path,
  raw_title = EXCLUDED.raw_title,
  listing_count = EXCLUDED.listing_count,
  specs = EXCLUDED.specs,
  harvested_at = now(),
  updated_at = now();
`
console.log(sql)
