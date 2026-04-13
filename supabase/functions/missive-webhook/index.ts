import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { buildCustomerContext, formatContextForPrompt } from "../_shared/build-ai-context.ts";
import { generateAIReply, type AIProvider } from "../_shared/ai-providers.ts";

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
    if (MISSIVE_WEBHOOK_SECRET) {
      const valid = await validateSignature(rawBody, signature);
      if (!valid) {
        return new Response(JSON.stringify({ error: 'Invalid webhook signature' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const payload: MissiveWebhookPayload = JSON.parse(rawBody);
    const { conversation, message } = payload;

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

    // Upsert conversation
    const { data: conv, error: convError } = await supabase
      .from('conversations')
      .upsert(
        {
          missive_conversation_id: conversation.id,
          customer_id: customer?.id ?? null,
          contact_name: message.from_field?.name ?? null,
          channel: 'facebook' as const,
          unmatched_contact: !customer,
          needs_human_review: !customer,
          last_message_at: new Date().toISOString(),
        },
        { onConflict: 'missive_conversation_id' },
      )
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

    // --- AI Draft Generation ---
    // Check if AI is enabled for this conversation
    const { data: convState } = await supabase
      .from('conversations')
      .select('ai_enabled')
      .eq('id', conv.id)
      .single();

    if (convState?.ai_enabled !== false) {
      try {
        await generateAndSaveDraft(supabase, conv.id, customer?.id ?? null);
      } catch (aiErr) {
        // AI failure should not break the webhook — just flag for human review
        console.error('AI draft generation failed:', aiErr);
        await supabase
          .from('conversations')
          .update({ needs_human_review: true })
          .eq('id', conv.id);
      }
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

// ---------- AI Draft Generation ----------

async function generateAndSaveDraft(
  supabase: ReturnType<typeof createClient>,
  conversationId: string,
  customerId: string | null,
) {
  // 1. Fetch active AI provider
  const { data: provider } = await supabase
    .from('ai_providers')
    .select('id, name, provider, model_id, api_key_encrypted')
    .eq('is_active', true)
    .eq('purpose', 'messaging')
    .maybeSingle();

  if (!provider) {
    // No active AI provider — skip silently
    return;
  }

  // 2. Fetch active persona
  const { data: persona } = await supabase
    .from('messaging_persona')
    .select('system_prompt')
    .eq('is_active', true)
    .maybeSingle();

  if (!persona?.system_prompt) return;

  // 3. Build customer context
  const context = await buildCustomerContext(supabase, customerId, conversationId);
  const contextBlock = formatContextForPrompt(context);

  // 4. Prepare message history for AI
  const chatMessages = context.recentMessages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  // 5. Generate AI reply
  const aiResponse = await generateAIReply(
    provider as AIProvider,
    persona.system_prompt,
    contextBlock,
    chatMessages,
  );

  // 6. Determine if human review is needed
  const needsReview = aiResponse.confidence < 0.5 || aiResponse.escalation_reason !== null;

  // 7. Save draft message
  await supabase.from('messages').insert({
    conversation_id: conversationId,
    role: 'assistant',
    content: aiResponse.reply,
    status: 'DRAFT',
    message_type: 'REPLY',
    ai_confidence: aiResponse.confidence,
    ai_context_summary: JSON.stringify({
      intent: aiResponse.intent,
      data_used: aiResponse.data_used,
      escalation_reason: aiResponse.escalation_reason,
    }),
  });

  // 8. Update conversation review state
  await supabase
    .from('conversations')
    .update({ needs_human_review: needsReview || !customerId })
    .eq('id', conversationId);
}

function jsonResponse(data: Record<string, unknown>) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
