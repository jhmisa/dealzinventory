import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CreateReturnInput {
  order_id: string
  customer_id: string
  reason_category: string
  description: string
  items: { order_item_id: string; reason_note?: string }[]
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

    const body: CreateReturnInput = await req.json();
    const { order_id, customer_id, reason_category, description, items } = body;

    if (!order_id || !customer_id || !reason_category || !description || !items?.length) {
      return jsonResponse({ error: 'order_id, customer_id, reason_category, description, and items are required' });
    }

    // 1. Validate order belongs to customer and is SHIPPED or DELIVERED
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, order_status, customer_id')
      .eq('id', order_id)
      .single();

    if (orderError || !order) {
      return jsonResponse({ error: 'Order not found' });
    }
    if (order.customer_id !== customer_id) {
      return jsonResponse({ error: 'Order does not belong to this customer' });
    }
    if (!['SHIPPED', 'DELIVERED'].includes(order.order_status)) {
      return jsonResponse({ error: `Cannot create return for order with status: ${order.order_status}` });
    }

    // 2. Validate items belong to the order
    const orderItemIds = items.map(i => i.order_item_id);
    const { data: orderItems, error: oiError } = await supabase
      .from('order_items')
      .select('id, item_id')
      .eq('order_id', order_id)
      .in('id', orderItemIds);

    if (oiError) {
      return jsonResponse({ error: `Failed to validate items: ${oiError.message}` });
    }
    if (!orderItems || orderItems.length !== orderItemIds.length) {
      return jsonResponse({ error: 'One or more items do not belong to this order' });
    }

    // 3. Check for existing open returns on the same items
    const { data: existingReturns } = await supabase
      .from('return_request_items')
      .select('order_item_id, return_requests!inner(return_status)')
      .in('order_item_id', orderItemIds)
      .not('return_requests.return_status', 'in', '("RESOLVED","REJECTED","CANCELLED")');

    if (existingReturns && existingReturns.length > 0) {
      return jsonResponse({ error: 'One or more items already have an open return request' });
    }

    // 4. Generate return code
    const { data: codeData, error: codeError } = await supabase.rpc('generate_code', {
      prefix: 'RET',
      seq_name: 'ret_code_seq',
    });
    if (codeError) {
      return jsonResponse({ error: `Failed to generate return code: ${codeError.message}` });
    }

    // 5. Insert return request
    const { data: returnRequest, error: retError } = await supabase
      .from('return_requests')
      .insert({
        return_code: codeData as string,
        order_id,
        customer_id,
        reason_category,
        customer_description: description,
      })
      .select()
      .single();

    if (retError) {
      return jsonResponse({ error: `Failed to create return request: ${retError.message}` });
    }

    // 6. Insert return request items
    const itemIdMap = new Map(orderItems.map(oi => [oi.id, oi.item_id]));
    const returnItems = items.map(i => ({
      return_request_id: returnRequest.id,
      order_item_id: i.order_item_id,
      item_id: itemIdMap.get(i.order_item_id) ?? null,
      reason_note: i.reason_note || null,
    }));

    const { error: riError } = await supabase
      .from('return_request_items')
      .insert(returnItems);

    if (riError) {
      // Rollback
      await supabase.from('return_requests').delete().eq('id', returnRequest.id);
      return jsonResponse({ error: `Failed to create return items: ${riError.message}` });
    }

    return jsonResponse({
      return_code: codeData as string,
      return_request_id: returnRequest.id,
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
