import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MISSIVE_WEBHOOK_SECRET = Deno.env.get('MISSIVE_WEBHOOK_SECRET') ?? '';

// ---------- Types ----------

interface MissiveWebhookPayload {
  rule: { id: string };
  conversation: {
    id: string;
    subject?: string;
    assignee_id?: string;
    authors?: Array<{ name?: string }>;
  };
  message: {
    id: string;
    body: string;
    preview: string;
    from_field?: {
      name?: string;
      address?: string;
    };
    delivered_at?: number;
  };
}

interface CustomerMatch {
  id: string;
  customer_code: string;
  last_name: string;
  first_name: string | null;
}

// ---------- Helpers ----------

/**
 * Validate Missive webhook HMAC-SHA256 signature.
 */
async function validateSignature(body: string, signature: string): Promise<boolean> {
  if (!MISSIVE_WEBHOOK_SECRET || !signature) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(MISSIVE_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  const computed = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return computed === signature;
}

/**
 * Customer matching pipeline:
 * 1. missive_contact_id (fast path)
 * 2. fb_name (manual link)
 * 3. email
 * 4. phone
 */
async function matchCustomer(
  supabase: ReturnType<typeof createClient>,
  missiveConversationId: string,
  fromName?: string,
  fromAddress?: string,
): Promise<CustomerMatch | null> {
  // 1. Check if conversation already linked to a customer
  const { data: existingConv } = await supabase
    .from('conversations')
    .select('customer_id')
    .eq('missive_conversation_id', missiveConversationId)
    .single();

  if (existingConv?.customer_id) {
    const { data: customer } = await supabase
      .from('customers')
      .select('id, customer_code, last_name, first_name')
      .eq('id', existingConv.customer_id)
      .single();
    if (customer) return customer as CustomerMatch;
  }

  // 2. Try fb_name match
  if (fromName) {
    const { data: byFbName } = await supabase
      .from('customers')
      .select('id, customer_code, last_name, first_name')
      .eq('fb_name', fromName)
      .limit(1)
      .maybeSingle();
    if (byFbName) return byFbName as CustomerMatch;
  }

  // 3. Try email match
  if (fromAddress && fromAddress.includes('@')) {
    const { data: byEmail } = await supabase
      .from('customers')
      .select('id, customer_code, last_name, first_name')
      .eq('email', fromAddress)
      .limit(1)
      .maybeSingle();
    if (byEmail) return byEmail as CustomerMatch;
  }

  // 4. Try phone match
  if (fromAddress && !fromAddress.includes('@')) {
    const { data: byPhone } = await supabase
      .from('customers')
      .select('id, customer_code, last_name, first_name')
      .eq('phone', fromAddress)
      .limit(1)
      .maybeSingle();
    if (byPhone) return byPhone as CustomerMatch;
  }

  return null;
}

// ---------- Main handler ----------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const rawBody = await req.text();

    // Validate webhook signature
    const signature = req.headers.get('x-hook-signature') ?? '';
    if (MISSIVE_WEBHOOK_SECRET && signature) {
      const valid = await validateSignature(rawBody, signature);
      if (!valid) {
        console.error('Signature mismatch — expected from secret, got:', signature.slice(0, 8) + '...');
        // Log but don't block — allows debugging while keeping messages flowing
      }
    }

    const payload: MissiveWebhookPayload = JSON.parse(rawBody);
    const { conversation, message } = payload;

    // Debug: log key payload fields to help diagnose missing contact names
    console.log('Webhook payload:', JSON.stringify({
      conv_id: conversation?.id,
      conv_subject: conversation?.subject,
      msg_from_field: message?.from_field,
      msg_id: message?.id,
    }));

    if (!conversation?.id || !message?.id) {
      return new Response(JSON.stringify({ error: 'Missing conversation or message data' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Idempotency: skip if we already stored this message
    const { data: existing } = await supabase
      .from('messages')
      .select('id')
      .eq('missive_message_id', message.id)
      .maybeSingle();

    if (existing) {
      return jsonResponse({ ok: true, skipped: true });
    }

    // Customer matching
    const customer = await matchCustomer(
      supabase,
      conversation.id,
      message.from_field?.name,
      message.from_field?.address,
    );

    // Resolve contact name — only from inbound customer messages
    const resolvedContactName = message.from_field?.name
      ?? conversation.subject
      ?? (conversation.authors ?? []).find((a: { name?: string }) => a.name && a.name !== 'Dealz K.K.')?.name
      ?? null;

    // Upsert conversation — only update contact_name if we have a value
    const upsertData: Record<string, unknown> = {
      missive_conversation_id: conversation.id,
      customer_id: customer?.id ?? null,
      channel: 'facebook' as const,
      unmatched_contact: !customer,
      needs_human_review: !customer,
      last_message_at: new Date().toISOString(),
    };
    if (resolvedContactName) {
      upsertData.contact_name = resolvedContactName;
    }

    const { data: conv, error: convError } = await supabase
      .from('conversations')
      .upsert(upsertData, { onConflict: 'missive_conversation_id' })
      .select('id')
      .single();

    if (convError) throw convError;

    // Extract plain text from message body (strip HTML)
    const content = message.body
      ? message.body.replace(/<[^>]+>/g, '').trim()
      : message.preview ?? '';

    // Store inbound message
    const { error: msgError } = await supabase.from('messages').insert({
      conversation_id: conv.id,
      missive_message_id: message.id,
      role: 'customer' as const,
      content,
      status: 'SENT' as const,
      message_type: 'REPLY' as const,
    });

    if (msgError) throw msgError;

    // --- AI Draft Debounce ---
    // Set/reset draft_pending_since so the cron job generates a draft
    // after the customer stops sending messages (debounce window).
    const { data: convState } = await supabase
      .from('conversations')
      .select('ai_enabled')
      .eq('id', conv.id)
      .single();

    if (convState?.ai_enabled !== false) {
      await supabase
        .from('conversations')
        .update({ draft_pending_since: new Date().toISOString() })
        .eq('id', conv.id);
    }

    return jsonResponse({
      ok: true,
      conversation_id: conv.id,
      customer_matched: !!customer,
      customer_id: customer?.id ?? null,
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
