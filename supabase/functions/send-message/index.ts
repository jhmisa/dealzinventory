import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MISSIVE_API_TOKEN = Deno.env.get('MISSIVE_API_TOKEN') ?? '';
const MISSIVE_API_URL = 'https://public.missiveapp.com/v1';
const MISSIVE_MESSENGER_ACCOUNT_ID = Deno.env.get('MISSIVE_MESSENGER_ACCOUNT_ID') ?? '';

// ---------- Types ----------

interface MessageAttachment {
  file_url: string;
  filename: string;
  mime_type: string;
  size_bytes?: number;
}

interface SendMessageInput {
  conversation_id: string;
  content: string;
  // If approving an AI draft, pass the draft message ID
  approve_draft_id?: string;
  attachments?: MessageAttachment[];
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

    const { conversation_id, content, approve_draft_id, attachments: inputAttachments } = body as SendMessageInput;

    if (!conversation_id || !content) {
      return jsonResponse({ error: 'conversation_id and content are required' });
    }

    // Fetch conversation to get Missive conversation ID
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('id, missive_conversation_id, contact_platform_id')
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
        attachments: inputAttachments ?? [],
      })
      .select('id')
      .single();

    if (insertError) throw insertError;

    // Fetch attachment files from Storage and convert to base64 for Missive
    const missiveAttachments: Array<{ base64: string; filename: string; media_type: string }> = [];
    if (inputAttachments && inputAttachments.length > 0) {
      for (const att of inputAttachments) {
        try {
          const { data: fileData, error: downloadError } = await supabase.storage
            .from('messaging-attachments')
            .download(att.file_url);

          if (downloadError || !fileData) {
            console.error(`Failed to download attachment ${att.filename}:`, downloadError);
            continue;
          }

          const arrayBuffer = await fileData.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          let binary = '';
          for (let i = 0; i < uint8Array.length; i++) {
            binary += String.fromCharCode(uint8Array[i]);
          }
          const base64 = btoa(binary);

          missiveAttachments.push({
            base64,
            filename: att.filename,
            media_type: att.mime_type,
          });
        } catch (err) {
          console.error(`Error processing attachment ${att.filename}:`, err);
        }
      }
    }

    // Send via Missive Drafts API
    let missiveMessageId: string | null = null;
    let sendError: { missive_status?: number; missive_error?: string; attempted_at: string; retry_count: number } | null = null;

    try {
      if (!MISSIVE_API_TOKEN) {
        throw new Error('MISSIVE_API_TOKEN not configured');
      }

      // Use the customer's Facebook PSID stored in our DB (set by webhook on inbound messages)
      const contactPlatformId = conversation.contact_platform_id;
      console.log('contact_platform_id from DB:', contactPlatformId);

      if (!contactPlatformId) {
        throw new Error('No contact_platform_id on conversation — customer must send a message first so we can capture their Facebook ID');
      }

      const draftPayload: Record<string, unknown> = {
        send: true,
        account: MISSIVE_MESSENGER_ACCOUNT_ID,
        body: content,
        to_fields: [{ id: contactPlatformId }],
        conversation: conversation.missive_conversation_id,
        ...(missiveAttachments.length > 0 && { attachments: missiveAttachments }),
      };

      console.log('Sending draft payload:', JSON.stringify({ drafts: draftPayload }));

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

    // Only update conversation state on successful send
    if (!sendError) {
      await supabase
        .from('conversations')
        .update({
          last_message_at: new Date().toISOString(),
          needs_human_review: false,
          draft_pending_since: null,  // Cancel pending AI draft — staff already replied
        })
        .eq('id', conversation.id);
    }

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
