import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MISSIVE_API_TOKEN = Deno.env.get('MISSIVE_API_TOKEN') ?? '';
const MISSIVE_API_URL = 'https://public.missiveapp.com/v1';

// ---------- Types ----------

interface SendMessageInput {
  conversation_id: string;
  content: string;
  // If approving an AI draft, pass the draft message ID
  approve_draft_id?: string;
}

// ---------- Main handler ----------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    // Health check endpoint (no auth required)
    if (body.health_check) {
      if (!MISSIVE_API_TOKEN) {
        return jsonResponse({ error: 'MISSIVE_API_TOKEN not configured' });
      }
      try {
        const res = await fetch(`${MISSIVE_API_URL}/organizations`, {
          headers: { Authorization: `Bearer ${MISSIVE_API_TOKEN}` },
        });
        // 200 = success, 403 = token valid but no access (still connected)
        if (res.status === 401) {
          return jsonResponse({ error: 'MISSIVE_API_TOKEN is invalid' });
        }
        return jsonResponse({ ok: true, connected: true });
      } catch (e) {
        return jsonResponse({ error: e instanceof Error ? e.message : 'Network error' });
      }
    }

    // All other endpoints require staff auth
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return jsonResponse({ error: 'Invalid or expired token' });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { conversation_id, content, approve_draft_id } = body as SendMessageInput;

    if (!conversation_id || !content) {
      return jsonResponse({ error: 'conversation_id and content are required' });
    }

    // Fetch conversation to get Missive conversation ID
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('id, missive_conversation_id')
      .eq('id', conversation_id)
      .single();

    if (convError || !conversation) {
      return jsonResponse({ error: 'Conversation not found' });
    }

    // If approving a draft, update its status first
    if (approve_draft_id) {
      await supabase
        .from('messages')
        .update({ status: 'SENDING' })
        .eq('id', approve_draft_id);
    }

    // Insert outbound message with SENDING status
    const { data: msg, error: insertError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversation.id,
        role: 'staff' as const,
        content,
        status: 'SENDING' as const,
        message_type: 'REPLY' as const,
        sent_by: user.id,
      })
      .select('id')
      .single();

    if (insertError) throw insertError;

    // Send via Missive Drafts API
    let missiveMessageId: string | null = null;
    let sendError: { missive_status?: number; missive_error?: string; attempted_at: string; retry_count: number } | null = null;

    try {
      if (!MISSIVE_API_TOKEN) {
        throw new Error('MISSIVE_API_TOKEN not configured');
      }

      // Fetch conversation from Missive to determine the correct sender (from_field)
      const convRes = await fetch(
        `${MISSIVE_API_URL}/conversations/${conversation.missive_conversation_id}`,
        { headers: { Authorization: `Bearer ${MISSIVE_API_TOKEN}` } },
      );

      let fromField: { address: string; name?: string } | undefined;
      if (convRes.ok) {
        const convData = await convRes.json();
        const messages = convData?.conversations?.messages ?? [];

        // Strategy 1: Find from_field of a previous outbound message (sent by us)
        for (const m of messages) {
          if (m.delivered_at && m.from_field?.address) {
            // Outbound messages have delivered_at set by Missive
            // Check if this is from our side (not the customer)
            const toFields = m.to_fields ?? [];
            const isOutbound = toFields.some((t: { address: string }) =>
              t.address && !t.address.includes('@')
            ) || m.references?.length > 0;
            if (isOutbound) {
              fromField = m.from_field;
              break;
            }
          }
        }

        // Strategy 2: For Facebook — our page ID is in to_fields of inbound customer messages
        if (!fromField) {
          for (const m of messages) {
            const toFields = m.to_fields ?? [];
            for (const t of toFields) {
              if (t.address && !t.address.includes('@')) {
                fromField = t;
                break;
              }
            }
            if (fromField) break;
          }
        }

        // Strategy 3: Don't send from_field at all — let Missive pick the default
        // (fromField stays undefined)

        console.log('Missive conversation messages sample:', JSON.stringify(
          messages.slice(0, 2).map((m: Record<string, unknown>) => ({
            from_field: m.from_field,
            to_fields: m.to_fields,
            delivered_at: m.delivered_at,
          }))
        ));
      }

      console.log('from_field resolved:', JSON.stringify(fromField ?? null));

      const draftPayload: Record<string, unknown> = {
        body: content,
        conversation: conversation.missive_conversation_id,
        send: true,
      };
      if (fromField) {
        draftPayload.from_field = fromField;
      }

      const missiveRes = await fetch(`${MISSIVE_API_URL}/drafts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${MISSIVE_API_TOKEN}`,
        },
        body: JSON.stringify({ drafts: draftPayload }),
      });

      if (!missiveRes.ok) {
        const errBody = await missiveRes.text();
        sendError = {
          missive_status: missiveRes.status,
          missive_error: errBody,
          attempted_at: new Date().toISOString(),
          retry_count: 0,
        };
      } else {
        const missiveData = await missiveRes.json();
        missiveMessageId = missiveData?.drafts?.id ?? null;
      }
    } catch (fetchErr) {
      sendError = {
        missive_error: fetchErr instanceof Error ? fetchErr.message : 'Network error',
        attempted_at: new Date().toISOString(),
        retry_count: 0,
      };
    }

    // Update message status based on Missive response
    const newStatus = sendError ? 'FAILED' : 'SENT';
    const updateFields: Record<string, unknown> = {
      status: newStatus,
      ...(missiveMessageId && { missive_message_id: missiveMessageId }),
      ...(sendError && { error_details: sendError }),
    };

    await supabase
      .from('messages')
      .update(updateFields)
      .eq('id', msg.id);

    // If we approved a draft, update that draft's status too
    if (approve_draft_id) {
      const draftStatus = sendError ? 'FAILED' : 'SENT';
      await supabase
        .from('messages')
        .update({ status: draftStatus })
        .eq('id', approve_draft_id);

      // Delete the separate staff message since the draft itself is the message
      if (!sendError) {
        await supabase.from('messages').delete().eq('id', msg.id);
      }
    }

    // Update conversation state
    await supabase
      .from('conversations')
      .update({
        last_message_at: new Date().toISOString(),
        needs_human_review: false,
        draft_pending_since: null,  // Cancel pending AI draft — staff already replied
      })
      .eq('id', conversation.id);

    if (sendError) {
      console.error('Send message failed:', JSON.stringify(sendError));
      return jsonResponse({
        error: `Message delivery failed: ${sendError.missive_error ?? 'Unknown error'}`,
        message_id: msg.id,
        details: sendError,
      });
    }

    return jsonResponse({
      ok: true,
      message_id: approve_draft_id ?? msg.id,
      missive_message_id: missiveMessageId,
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
