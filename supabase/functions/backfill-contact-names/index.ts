import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  resolveNameFromMissiveConversation,
  unwrapMissiveConversation,
} from "../_shared/resolve-contact-name.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MISSIVE_API_TOKEN = Deno.env.get('MISSIVE_API_TOKEN') ?? '';
const MISSIVE_API_URL = 'https://public.missiveapp.com/v1';

interface BackfillBody {
  // ISO timestamp — only sweep conversations active since then (cheap, for cron).
  since?: string;
  // Cap how many conversations to process in one run.
  limit?: number;
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

    if (!MISSIVE_API_TOKEN) {
      return new Response(JSON.stringify({ error: 'MISSIVE_API_TOKEN not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Optional scoping (used by the every-2-min cron to stay cheap). With no
    // body it falls back to a full sweep of all NULL-name conversations.
    let body: BackfillBody = {};
    try {
      body = (await req.json()) as BackfillBody;
    } catch {
      // no/invalid body — full sweep
    }
    const { since, limit } = body ?? {};

    // Fetch conversations with missing contact_name
    let query = supabase
      .from('conversations')
      .select('id, missive_conversation_id, contact_name')
      .or('contact_name.is.null,contact_name.eq.')
      .order('last_message_at', { ascending: false });

    if (since) query = query.gte('last_message_at', since);
    if (typeof limit === 'number' && limit > 0) query = query.limit(limit);

    const { data: conversations, error } = await query;

    if (error) throw error;

    const results: {
      id: string;
      name: string | null;
      status: string;
      keys?: string[];
      sample?: Record<string, unknown>;
    }[] = [];

    for (const conv of conversations ?? []) {
      try {
        // Fetch conversation from Missive to resolve the FB name.
        const res = await fetch(
          `${MISSIVE_API_URL}/conversations/${conv.missive_conversation_id}`,
          { headers: { Authorization: `Bearer ${MISSIVE_API_TOKEN}` } },
        );

        if (!res.ok) {
          results.push({ id: conv.id, name: null, status: `missive_error_${res.status}` });
          continue;
        }

        const data = await res.json();
        // Shared resolver applies the same fallback chain + "Message from " strip
        // as the webhook, so names stay consistent across ingestion paths.
        const name = resolveNameFromMissiveConversation(unwrapMissiveConversation(data));

        if (name) {
          await supabase
            .from('conversations')
            .update({ contact_name: name })
            .eq('id', conv.id);

          results.push({ id: conv.id, name, status: 'updated' });
        } else {
          // Return keys + sample values for debugging
          const convData = unwrapMissiveConversation(data) as Record<string, unknown> | null;
          const keys = convData ? Object.keys(convData).slice(0, 15) : [];
          const sample: Record<string, unknown> = {};
          for (const k of ['subject', 'contacts', 'assignees', 'authors', 'latest_message', 'messages_count']) {
            if (convData?.[k] !== undefined) sample[k] = convData[k];
          }
          results.push({ id: conv.id, name: null, status: 'no_name_found', keys, sample });
        }

        // Rate limit: small delay between API calls
        await new Promise((r) => setTimeout(r, 200));
      } catch (err) {
        results.push({
          id: conv.id,
          name: null,
          status: err instanceof Error ? err.message : 'error',
        });
      }
    }

    const updated = results.filter((r) => r.status === 'updated').length;

    return new Response(JSON.stringify({
      ok: true,
      total: conversations?.length ?? 0,
      updated,
      results,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({
      error: err instanceof Error ? err.message : 'Internal server error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
