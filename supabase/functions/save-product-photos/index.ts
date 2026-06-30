// supabase/functions/save-product-photos/index.ts
// Fetch a product photo (iosys/CloudFront listing image), center-crop it to a square, encode 1080²
// display + 256² thumbnail WebP, upload both to the product-media bucket, and insert ONE
// product_media hero row. The trg_fanout_product_media trigger replicates the hero to every
// product_model sharing the same color_key. Idempotent: skips a color group that already has a hero.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { cropToSquareWebp } from "../_shared/image/square-crop.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const BUCKET = "product-media";
const DISPLAY = { size: 1080, quality: 82 };
const THUMB = { size: 256, quality: 80 };

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
    const productModelId = typeof body?.product_model_id === "string" ? body.product_model_id.trim() : "";
    const imageUrl = typeof body?.image_url === "string" ? body.image_url.trim() : "";
    if (!productModelId) return jsonResponse({ error: "product_model_id required" }, 400);
    if (!imageUrl) return jsonResponse({ error: "image_url required" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: model, error: modelErr } = await supabase
      .from("product_models")
      .select("id, color_key")
      .eq("id", productModelId)
      .single();
    if (modelErr || !model) return jsonResponse({ error: "product_model not found" }, 404);

    if (model.color_key) {
      const { data: existing } = await supabase
        .from("product_media")
        .select("id, product_models!inner(color_key)")
        .eq("role", "hero")
        .eq("product_models.color_key", model.color_key)
        .limit(1);
      if (existing && existing.length > 0) {
        return jsonResponse({ skipped: "color group already has a hero", product_model_id: productModelId }, 200);
      }
    } else {
      // No color_key to group on: fall back to a per-model hero check so a manual
      // re-call doesn't create a duplicate hero on this exact product_model.
      const { data: existing } = await supabase
        .from("product_media")
        .select("id")
        .eq("product_id", productModelId)
        .eq("role", "hero")
        .limit(1);
      if (existing && existing.length > 0) {
        return jsonResponse({ skipped: "model already has a hero", product_model_id: productModelId }, 200);
      }
    }

    const res = await fetch(imageUrl, { headers: { "User-Agent": BROWSER_UA } });
    if (!res.ok) return jsonResponse({ error: `fetch failed: HTTP ${res.status}` }, 502);
    const original = new Uint8Array(await res.arrayBuffer());

    const displayBytes = await cropToSquareWebp(original, DISPLAY.size, DISPLAY.quality);
    const thumbBytes = await cropToSquareWebp(original, THUMB.size, THUMB.quality);

    // Storage keys allow only a restricted charset; color_key contains `|` and
    // spaces. Slugify the prefix (the canonical color_key still lives on the row).
    const slugged = (model.color_key ?? productModelId)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    // A color_key that is entirely non-ASCII slugs to "", which would yield a
    // leading-slash storage path Storage rejects. Fall back to the model UUID.
    const prefix = slugged.length > 0 ? slugged : productModelId.replace(/-/g, "");
    const base = `${prefix}/${crypto.randomUUID()}`;
    const displayPath = `${base}_display.webp`;
    const thumbPath = `${base}_thumb.webp`;

    // Track successfully-uploaded objects so we can clean them up if a later
    // upload or the DB insert fails, avoiding orphaned storage objects.
    const uploadedPaths: string[] = [];
    const cleanupUploads = async () => {
      if (uploadedPaths.length > 0) {
        await supabase.storage.from(BUCKET).remove(uploadedPaths).catch(() => {});
      }
    };

    for (const [path, bytes] of [[displayPath, displayBytes], [thumbPath, thumbBytes]] as const) {
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, bytes, {
        contentType: "image/webp",
        upsert: false,
      });
      if (upErr) {
        await cleanupUploads();
        return jsonResponse({ error: `upload failed: ${upErr.message}` }, 500);
      }
      uploadedPaths.push(path);
    }

    const displayUrl = supabase.storage.from(BUCKET).getPublicUrl(displayPath).data.publicUrl;

    const { data: row, error: insErr } = await supabase
      .from("product_media")
      .insert({
        product_id: productModelId,
        file_url: displayUrl,
        media_type: "image",
        role: "hero",
        sort_order: 0,
      })
      .select()
      .single();
    if (insErr) {
      await cleanupUploads();
      return jsonResponse({ error: `insert failed: ${insErr.message}` }, 500);
    }

    return jsonResponse({ ok: true, media: row, display_url: displayUrl, thumb_path: thumbPath }, 200);
  } catch (err) {
    return jsonResponse({ error: String(err instanceof Error ? err.message : err) }, 500);
  }
});
