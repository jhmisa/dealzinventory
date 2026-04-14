import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const MISSIVE_API_TOKEN = Deno.env.get('MISSIVE_API_TOKEN') ?? '';
const MISSIVE_API_URL = 'https://public.missiveapp.com/v1';

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Get all conversations missing contact_platform_id
  const { data: conversations, error } = await supabase
    .from('conversations')
    .select('id, missive_conversation_id')
    .is('contact_platform_id', null);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const results: Array<{ id: string; status: string; platform_id?: string }> = [];

  for (const conv of conversations ?? []) {
    try {
      // Fetch messages from Missive for this conversation
      const msgsRes = await fetch(
        `${MISSIVE_API_URL}/conversations/${conv.missive_conversation_id}/messages`,
        { headers: { Authorization: `Bearer ${MISSIVE_API_TOKEN}` } },
      );

      if (!msgsRes.ok) {
        results.push({ id: conv.id, status: `missive_error_${msgsRes.status}` });
        continue;
      }

      const msgsData = await msgsRes.json();
      const messages = msgsData?.messages ?? [];

      // Log first inbound message structure to understand the format
      let platformId: string | null = null;
      const sample = messages.find((m: Record<string, unknown>) => !m.delivered_at);

      // Try multiple strategies to find the PSID
      for (const m of messages) {
        if (!m.delivered_at && m.from_field) {
          // Strategy 1: numeric id (direct PSID)
          if (m.from_field.id && /^\d+$/.test(m.from_field.id)) {
            platformId = m.from_field.id;
            break;
          }
          // Strategy 2: address field might contain PSID
          if (m.from_field.address && /^\d+$/.test(m.from_field.address)) {
            platformId = m.from_field.address;
            break;
          }
        }
        // Strategy 3: check to_fields of outbound messages
        if (m.delivered_at && m.to_fields?.length === 1) {
          const tf = m.to_fields[0];
          if (tf.id && /^\d+$/.test(tf.id)) {
            platformId = tf.id;
            break;
          }
          if (tf.address && /^\d+$/.test(tf.address)) {
            platformId = tf.address;
            break;
          }
        }
      }

      if (platformId) {
        await supabase
          .from('conversations')
          .update({ contact_platform_id: platformId })
          .eq('id', conv.id);
        results.push({ id: conv.id, status: 'updated', platform_id: platformId });
      } else {
        // Log the sample message for debugging
        results.push({
          id: conv.id,
          status: 'no_psid_found',
          platform_id: sample ? JSON.stringify({
            from_field: sample.from_field,
            to_fields: sample.to_fields,
          }).slice(0, 200) : 'no_inbound_messages',
        });
      }
    } catch (e) {
      results.push({ id: conv.id, status: `error: ${e instanceof Error ? e.message : 'unknown'}` });
    }
  }

  return new Response(JSON.stringify({ total: conversations?.length ?? 0, results }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
