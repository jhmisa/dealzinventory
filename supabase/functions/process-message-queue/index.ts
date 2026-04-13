import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MISSIVE_API_TOKEN = Deno.env.get('MISSIVE_API_TOKEN') ?? '';
const MISSIVE_API_URL = 'https://mail.missiveapp.com/v1';

// ---------- Types ----------

interface QueueItem {
  id: string;
  conversation_id: string | null;
  customer_id: string | null;
  order_id: string | null;
  template_id: string | null;
  message_type: string;
  content: string | null;
  status: string;
}

interface Template {
  content_en: string;
  content_ja: string;
  variables: string[];
}

// ---------- Template rendering ----------

function renderTemplate(
  template: string,
  variables: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key) => variables[key] ?? '');
}

async function resolveTemplateVariables(
  supabase: ReturnType<typeof createClient>,
  item: QueueItem,
): Promise<Record<string, string>> {
  const vars: Record<string, string> = {};

  if (item.customer_id) {
    const { data: customer } = await supabase
      .from('customers')
      .select('customer_code, last_name, first_name')
      .eq('id', item.customer_id)
      .single();
    if (customer) {
      vars.customer_name = `${customer.last_name} ${customer.first_name ?? ''}`.trim();
      vars.customer_code = customer.customer_code;
    }
  }

  if (item.order_id) {
    const { data: order } = await supabase
      .from('orders')
      .select('order_code, order_status, tracking_number, total_price, yamato_status')
      .eq('id', item.order_id)
      .single();
    if (order) {
      vars.order_code = order.order_code;
      vars.order_status = order.order_status;
      vars.tracking_number = order.tracking_number ?? 'N/A';
      vars.total_price = `¥${order.total_price}`;
      vars.yamato_status = order.yamato_status ?? 'N/A';
    }
  }

  vars.shop_url = Deno.env.get('PUBLIC_SHOP_URL') ?? 'https://shop.dealz.jp';

  return vars;
}

// ---------- Missive send ----------

async function sendViaMissive(
  conversationMissiveId: string,
  content: string,
): Promise<{ success: boolean; missiveMessageId?: string; error?: string }> {
  if (!MISSIVE_API_TOKEN) {
    return { success: false, error: 'MISSIVE_API_TOKEN not configured' };
  }

  try {
    const res = await fetch(`${MISSIVE_API_URL}/drafts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${MISSIVE_API_TOKEN}`,
      },
      body: JSON.stringify({
        drafts: {
          body: content,
          conversation: conversationMissiveId,
          send: true,
        },
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      return { success: false, error: `Missive ${res.status}: ${errBody}` };
    }

    const data = await res.json();
    return { success: true, missiveMessageId: data?.drafts?.id };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Network error' };
  }
}

// ---------- Main handler ----------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Fetch PENDING queue items that are due
    const { data: items, error: fetchError } = await supabase
      .from('automated_message_queue')
      .select('*')
      .eq('status', 'PENDING')
      .lte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(20);

    if (fetchError) throw fetchError;

    if (!items || items.length === 0) {
      return jsonResponse({ processed: 0, message: 'No pending items' });
    }

    const results: { id: string; status: string; error?: string }[] = [];

    for (const item of items as QueueItem[]) {
      // Mark as PROCESSING
      await supabase
        .from('automated_message_queue')
        .update({ status: 'PROCESSING' })
        .eq('id', item.id);

      try {
        // Resolve content: either pre-set or from template
        let content = item.content;

        if (!content && item.template_id) {
          const { data: template } = await supabase
            .from('messaging_templates')
            .select('content_en, content_ja, variables')
            .eq('id', item.template_id)
            .single();

          if (!template) {
            throw new Error('Template not found');
          }

          const vars = await resolveTemplateVariables(supabase, item);
          // Default to English; Japanese can be selected based on customer preference later
          content = renderTemplate((template as Template).content_en, vars);
        }

        if (!content) {
          throw new Error('No content to send');
        }

        // Find or create conversation for this customer
        let conversationMissiveId: string | null = null;
        let conversationDbId: string | null = item.conversation_id;

        if (conversationDbId) {
          const { data: conv } = await supabase
            .from('conversations')
            .select('missive_conversation_id')
            .eq('id', conversationDbId)
            .single();
          conversationMissiveId = conv?.missive_conversation_id ?? null;
        } else if (item.customer_id) {
          // Look for most recent conversation with this customer
          const { data: conv } = await supabase
            .from('conversations')
            .select('id, missive_conversation_id')
            .eq('customer_id', item.customer_id)
            .order('last_message_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (conv) {
            conversationMissiveId = conv.missive_conversation_id;
            conversationDbId = conv.id;
          }
        }

        if (!conversationMissiveId || !conversationDbId) {
          throw new Error('No conversation found for this customer');
        }

        // Send via Missive
        const sendResult = await sendViaMissive(conversationMissiveId, content);

        if (!sendResult.success) {
          throw new Error(sendResult.error ?? 'Send failed');
        }

        // Store message in DB
        await supabase.from('messages').insert({
          conversation_id: conversationDbId,
          missive_message_id: sendResult.missiveMessageId ?? null,
          role: 'system',
          content,
          status: 'SENT',
          message_type: item.message_type,
        });

        // Update conversation
        await supabase
          .from('conversations')
          .update({ last_message_at: new Date().toISOString() })
          .eq('id', conversationDbId);

        // If this was a review request, mark the order
        if (item.message_type === 'REVIEW_REQUEST' && item.order_id) {
          await supabase
            .from('orders')
            .update({ review_requested_at: new Date().toISOString() })
            .eq('id', item.order_id);
        }

        // Mark queue item as SENT
        await supabase
          .from('automated_message_queue')
          .update({ status: 'SENT', processed_at: new Date().toISOString() })
          .eq('id', item.id);

        results.push({ id: item.id, status: 'SENT' });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';

        await supabase
          .from('automated_message_queue')
          .update({
            status: 'FAILED',
            processed_at: new Date().toISOString(),
            error_details: { error: errorMsg, attempted_at: new Date().toISOString() },
          })
          .eq('id', item.id);

        results.push({ id: item.id, status: 'FAILED', error: errorMsg });
      }
    }

    return jsonResponse({
      processed: results.length,
      sent: results.filter((r) => r.status === 'SENT').length,
      failed: results.filter((r) => r.status === 'FAILED').length,
      results,
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
