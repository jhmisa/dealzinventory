import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MISSIVE_API_TOKEN = Deno.env.get('MISSIVE_API_TOKEN') ?? '';
const MISSIVE_API_URL = 'https://public.missiveapp.com/v1';

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

    // Fetch all conversations with missing contact_name
    const { data: conversations, error } = await supabase
      .from('conversations')
      .select('id, missive_conversation_id, contact_name')
      .or('contact_name.is.null,contact_name.eq.')
      .order('last_message_at', { ascending: false });

    if (error) throw error;

    const results: { id: string; name: string | null; status: string }[] = [];

    for (const conv of conversations ?? []) {
      try {
        // Fetch conversation from Missive to get subject (FB name)
        const res = await fetch(
          `${MISSIVE_API_URL}/conversations/${conv.missive_conversation_id}`,
          { headers: { Authorization: `Bearer ${MISSIVE_API_TOKEN}` } },
        );

        if (!res.ok) {
          results.push({ id: conv.id, name: null, status: `missive_error_${res.status}` });
          continue;
        }

        const data = await res.json();
        // Missive returns { conversations: [ { ... } ] } as an array
        const convData = Array.isArray(data?.conversations)
          ? data.conversations[0]
          : data?.conversations;

        // Try multiple fields where FB name might live
        // For authors, skip org name "Dealz K.K." and pick the customer
        const externalAuthor = (convData?.authors ?? [])
          .find((a: { name?: string }) => a.name && a.name !== 'Dealz K.K.');

        const name =
          convData?.subject ??
          convData?.contacts?.[0]?.name ??
          convData?.contacts?.[0]?.first_name ??
          externalAuthor?.name ??
          convData?.latest_message?.from_field?.name ??
          convData?.messages?.[0]?.from_field?.name ??
          null;

        if (name) {
          await supabase
            .from('conversations')
            .update({ contact_name: name.trim() })
            .eq('id', conv.id);

          results.push({ id: conv.id, name: name.trim(), status: 'updated' });
        } else {
          // Return keys + sample values for debugging
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
