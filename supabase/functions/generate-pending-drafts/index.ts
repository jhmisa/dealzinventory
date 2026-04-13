import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { generateAndSaveDraft } from "../_shared/generate-draft.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Read debounce seconds from request body (passed by DB function) or fall back to system_settings
    let debounceSeconds = 120;
    try {
      const body = await req.json();
      if (body?.debounce_seconds) {
        debounceSeconds = body.debounce_seconds;
      }
    } catch {
      // No body or invalid JSON — use default
    }

    // Query conversations ready for AI draft generation
    const cutoff = new Date(Date.now() - debounceSeconds * 1000).toISOString();

    const { data: conversations, error: queryError } = await supabase
      .from('conversations')
      .select('id, customer_id')
      .not('draft_pending_since', 'is', null)
      .lte('draft_pending_since', cutoff)
      .eq('ai_enabled', true)
      .limit(10);

    if (queryError) throw queryError;

    if (!conversations || conversations.length === 0) {
      return jsonResponse({ processed: 0, message: 'No pending drafts' });
    }

    let succeeded = 0;
    let failed = 0;
    let skipped = 0;

    for (const conv of conversations) {
      // Immediately clear draft_pending_since to prevent re-processing on overlap
      await supabase
        .from('conversations')
        .update({ draft_pending_since: null })
        .eq('id', conv.id);

      try {
        // Verify latest message is from customer (skip if staff already replied)
        const { data: latestMsg } = await supabase
          .from('messages')
          .select('role')
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestMsg?.role !== 'customer') {
          skipped++;
          continue;
        }

        await generateAndSaveDraft(supabase, conv.id, conv.customer_id);
        succeeded++;
      } catch (err) {
        console.error(`Draft generation failed for conversation ${conv.id}:`, err);
        // Flag for human review so staff knows AI couldn't respond
        await supabase
          .from('conversations')
          .update({ needs_human_review: true })
          .eq('id', conv.id);
        failed++;
      }
    }

    return jsonResponse({
      processed: conversations.length,
      succeeded,
      failed,
      skipped,
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
