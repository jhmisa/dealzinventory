import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { resolveAdapter } from "../_shared/supplier-adapters/registry.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

function jsonResponse(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const url = typeof body?.url === 'string' ? body.url.trim() : '';

    if (!url) {
      return jsonResponse({ error: "url required" }, 400);
    }

    const adapter = resolveAdapter(url);
    if (!adapter) {
      return jsonResponse({ error: "No supplier adapter matches this URL" }, 422);
    }

    const code = adapter.extractCode(url);
    if (!code) {
      return jsonResponse({ error: "Could not find a product code in the URL" }, 422);
    }

    const res = await fetch(url, {
      headers: { "User-Agent": BROWSER_UA },
    });

    if (!res.ok) {
      return jsonResponse({ error: `Supplier returned ${res.status}` }, 502);
    }

    const html = await res.text();
    const product = adapter.parse(html, url);

    return jsonResponse({ product }, 200);
  } catch (err) {
    return jsonResponse({ error: String(err instanceof Error ? err.message : err) }, 500);
  }
});
