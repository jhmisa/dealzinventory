// Reusable iosys catalog harvester.
// Re-run this whenever new phones come in: it crawls iosys iPhone listings by carrier,
// dedupes by part_number, enriches with the model->spec reference, and UPSERTs into the
// iosys_catalog staging table (ON CONFLICT part_number) — so re-runs are incremental.
//
// POST body (all optional):
//   { category?: "iphone"|"ipad", maxPagesPerSection?: number, throttleMs?: number,
//     sections?: string[], dryRun?: boolean }
// Returns the harvest stats (and, on dryRun, the rows without writing).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { harvestCatalog, IPAD_CATEGORY, IPHONE_CATEGORY } from "../_shared/catalog/harvest.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function jsonResponse(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const maxPagesPerSection = Number(body?.maxPagesPerSection) || 30;
    const throttleMs = Number(body?.throttleMs) || 800;
    const dryRun = body?.dryRun === true;
    const category = String(body?.category ?? "iphone").toLowerCase() === "ipad"
      ? IPAD_CATEGORY
      : IPHONE_CATEGORY;
    const sections = Array.isArray(body?.sections)
      ? category.sections.filter((s) => body.sections.includes(s.path))
      : category.sections;

    const progress: string[] = [];
    const res = await harvestCatalog({
      category,
      sections,
      maxPagesPerSection,
      throttleMs,
      onProgress: (m) => progress.push(m),
      fetchPage: async (url) => {
        const r = await fetch(url, {
          headers: {
            "User-Agent": BROWSER_UA,
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "ja,en;q=0.8",
          },
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return await r.text();
      },
    });

    // Guard against a junk/edge-IP response: if we parsed nothing, do not touch the DB.
    if (res.rows.length === 0) {
      return jsonResponse(
        { error: "harvest parsed 0 SKUs — likely blocked or served junk; DB untouched", stats: res.stats, progress },
        502,
      );
    }

    if (dryRun) {
      return jsonResponse({ dryRun: true, stats: res.stats, progress, rows: res.rows }, 200);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Upsert in chunks on the part_number conflict target.
    let upserted = 0;
    const chunkSize = 200;
    for (let i = 0; i < res.rows.length; i += chunkSize) {
      const chunk = res.rows.slice(i, i + chunkSize).map((r) => ({
        ...r,
        harvested_at: new Date().toISOString(),
      }));
      const { error } = await supabase
        .from("iosys_catalog")
        .upsert(chunk, { onConflict: "part_number", ignoreDuplicates: false });
      if (error) {
        return jsonResponse({ error: error.message, upserted, stats: res.stats, progress }, 500);
      }
      upserted += chunk.length;
    }

    return jsonResponse({ ok: true, upserted, stats: res.stats, progress }, 200);
  } catch (err) {
    return jsonResponse({ error: String(err instanceof Error ? err.message : err) }, 500);
  }
});
