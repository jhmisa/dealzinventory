import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

const BUCKET = 'backorder-media';

function jsonResponse(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Pick a file extension from the URL path, falling back to content-type, then 'jpg'.
function extFromUrl(url: string, contentType: string | null): string {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.([a-zA-Z0-9]{2,5})(?:$|\?)/);
    if (match) {
      const e = match[1].toLowerCase();
      if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'].includes(e)) return e;
    }
  } catch {
    // ignore malformed URL — fall through to content-type
  }
  if (contentType) {
    const ct = contentType.split(';')[0].trim().toLowerCase();
    const map: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'image/avif': 'avif',
    };
    if (map[ct]) return map[ct];
  }
  return 'jpg';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const backorderLineId =
      typeof body?.backorder_line_id === 'string' ? body.backorder_line_id.trim() : '';
    const imageUrls: string[] = Array.isArray(body?.image_urls)
      ? body.image_urls.filter((u: unknown): u is string => typeof u === 'string' && u.trim() !== '')
      : [];
    const source: string =
      typeof body?.source === 'string' && body.source.trim() ? body.source.trim() : 'iosys';

    if (!backorderLineId) {
      return jsonResponse({ error: "backorder_line_id required" }, 400);
    }
    if (imageUrls.length === 0) {
      return jsonResponse({ error: "image_urls required" }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const media: unknown[] = [];
    const skipped: string[] = [];

    for (let i = 0; i < imageUrls.length; i++) {
      const url = imageUrls[i];
      try {
        const res = await fetch(url, { headers: { "User-Agent": BROWSER_UA } });
        if (!res.ok) {
          console.warn('save-backorder-photos: fetch failed', res.status, url.slice(0, 100));
          skipped.push(url);
          continue;
        }

        const contentType = res.headers.get('content-type');
        const ext = extFromUrl(url, contentType);
        const blob = await res.blob();
        const path = `${backorderLineId}/${i}_${crypto.randomUUID()}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(path, blob, {
            contentType: contentType ?? `image/${ext === 'jpg' ? 'jpeg' : ext}`,
            upsert: false,
          });

        if (uploadError) {
          console.warn('save-backorder-photos: upload failed', uploadError.message, url.slice(0, 100));
          skipped.push(url);
          continue;
        }

        const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

        const { data: row, error: insertError } = await supabase
          .from('backorder_line_media')
          .insert({
            backorder_line_id: backorderLineId,
            file_url: publicUrl,
            source,
            sort_order: i,
          })
          .select()
          .single();

        if (insertError) {
          console.warn('save-backorder-photos: insert failed', insertError.message, url.slice(0, 100));
          skipped.push(url);
          continue;
        }

        media.push(row);
      } catch (err) {
        console.warn('save-backorder-photos: error', String(err), url.slice(0, 100));
        skipped.push(url);
      }
    }

    return jsonResponse({ media, skipped }, 200);
  } catch (err) {
    return jsonResponse({ error: String(err instanceof Error ? err.message : err) }, 500);
  }
});
