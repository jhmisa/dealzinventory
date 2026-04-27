import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { downloadAttachmentsToStorage } from "../_shared/download-to-storage.ts";

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

    let input: { dry_run?: boolean; batch_size?: number } = {};
    try { input = await req.json(); } catch { /* defaults */ }
    const dryRun = !!input.dry_run;
    const batchSize = input.batch_size ?? 50;

    // Find messages with external URLs in attachments
    const { data: messages, error } = await supabase
      .from('messages')
      .select('id, conversation_id, attachments')
      .not('attachments', 'eq', '[]')
      .not('attachments', 'is', null)
      .order('created_at', { ascending: false })
      .limit(batchSize);

    if (error) {
      return jsonResponse({ error: error.message });
    }

    // Filter to messages that have at least one external URL attachment
    const needsUpdate = (messages ?? []).filter((m) => {
      const atts = m.attachments as Array<{ file_url: string }>;
      return atts.some(a => a.file_url.startsWith('http://') || a.file_url.startsWith('https://'));
    });

    let updated = 0;
    let failed = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const msg of needsUpdate) {
      const atts = msg.attachments as Array<{ file_url: string; filename: string; mime_type: string; size_bytes?: number }>;
      const hasExternal = atts.some(a => a.file_url.startsWith('http://') || a.file_url.startsWith('https://'));
      if (!hasExternal) {
        skipped++;
        continue;
      }

      if (dryRun) {
        updated++;
        continue;
      }

      try {
        const stored = await downloadAttachmentsToStorage(supabase, atts, msg.conversation_id);
        // Check if any were actually downloaded (file_url changed from http to storage path)
        const anyChanged = stored.some((s, i) => s.file_url !== atts[i].file_url);
        if (anyChanged) {
          await supabase
            .from('messages')
            .update({ attachments: stored })
            .eq('id', msg.id);
          updated++;
        } else {
          // All downloads failed — URLs likely already expired
          failed++;
          errors.push(`${msg.id}: all downloads failed (URLs likely expired)`);
        }
      } catch (e) {
        failed++;
        errors.push(`${msg.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return jsonResponse({
      ok: true,
      dry_run: dryRun,
      total_with_attachments: messages?.length ?? 0,
      needs_update: needsUpdate.length,
      updated,
      failed,
      skipped,
      errors: errors.slice(0, 10),
    });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Internal error' });
  }
});

function jsonResponse(data: Record<string, unknown>) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
