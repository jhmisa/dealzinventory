import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { imageSearchProvider } from "../_shared/image-search/provider.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    const query = typeof body?.query === 'string' ? body.query.trim() : '';
    const limit: number = typeof body?.limit === 'number' ? body.limit : 8;

    if (!query) {
      return jsonResponse({ error: "query required" }, 400);
    }

    if (!imageSearchProvider.isConfigured()) {
      return jsonResponse({ configured: false, images: [] }, 200);
    }

    const images = await imageSearchProvider.search(query, limit);
    return jsonResponse({ configured: true, images }, 200);
  } catch (err) {
    return jsonResponse({ error: String(err instanceof Error ? err.message : err) }, 500);
  }
});
