import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BLOTATO_API_KEY = Deno.env.get('BLOTATO_API_KEY') ?? '';
const BLOTATO_API_BASE = 'https://backend.blotato.com/v2';

interface BlotatoPostResponse {
  status: 'in-progress' | 'published' | 'scheduled' | 'failed'
  publicUrl?: string
  errorMessage?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    if (!BLOTATO_API_KEY) {
      return jsonResponse({ error: 'BLOTATO_API_KEY not configured' });
    }

    // Fetch all scheduled posts with a blotato_submission_id
    const { data: posts, error: fetchErr } = await supabase
      .from('social_media_posts')
      .select('id, blotato_submission_id')
      .eq('status', 'scheduled')
      .not('blotato_submission_id', 'is', null);

    if (fetchErr) {
      return jsonResponse({ error: fetchErr.message });
    }

    if (!posts || posts.length === 0) {
      return jsonResponse({ synced: 0, published: 0, failed: 0, unchanged: 0 });
    }

    let published = 0;
    let failed = 0;
    let unchanged = 0;

    for (const post of posts) {
      try {
        const res = await fetch(
          `${BLOTATO_API_BASE}/posts/${post.blotato_submission_id}`,
          { headers: { 'blotato-api-key': BLOTATO_API_KEY } },
        );

        if (!res.ok) {
          unchanged++;
          continue;
        }

        const data = await res.json() as BlotatoPostResponse;

        if (data.status === 'published') {
          await supabase
            .from('social_media_posts')
            .update({
              status: 'published',
              blotato_post_url: data.publicUrl ?? null,
              published_at: new Date().toISOString(),
            })
            .eq('id', post.id);
          published++;
        } else if (data.status === 'failed') {
          await supabase
            .from('social_media_posts')
            .update({
              status: 'failed',
              error_message: data.errorMessage ?? 'Unknown error from Blotato',
            })
            .eq('id', post.id);
          failed++;
        } else {
          unchanged++;
        }
      } catch {
        unchanged++;
      }
    }

    return jsonResponse({
      synced: posts.length,
      published,
      failed,
      unchanged,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return jsonResponse({ error: message });
  }
});

function jsonResponse(data: Record<string, unknown>) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
